import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import {
  AuditActorType,
  LeadStatus,
  MessageContentType,
  MessageCurrentStatus,
  MessageDeliveryState,
  WhatsAppWebhookEventStatus,
} from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";
import { getBlobStore } from "@/lib/storage/r2-object-storage";
import { getWhatsAppWebhookConfiguration } from "@/lib/whatsapp/config";
import {
  normalizedWhatsAppEventSchema,
  type NormalizedWhatsAppEvent,
} from "@/lib/whatsapp/contracts";

function providerDate(timestamp: string | null) {
  if (!timestamp) return null;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

function messageType(value: string): MessageContentType {
  const mapped: Record<string, MessageContentType> = {
    text: MessageContentType.TEXT,
    image: MessageContentType.IMAGE,
    audio: MessageContentType.AUDIO,
    video: MessageContentType.VIDEO,
    document: MessageContentType.DOCUMENT,
    sticker: MessageContentType.STICKER,
    location: MessageContentType.LOCATION,
    contacts: MessageContentType.CONTACTS,
    interactive: MessageContentType.INTERACTIVE,
    reaction: MessageContentType.REACTION,
  };
  return mapped[value] ?? MessageContentType.UNSUPPORTED;
}

function deliveryState(value: string): MessageDeliveryState | null {
  const mapped: Record<string, MessageDeliveryState> = {
    sent: MessageDeliveryState.SENT,
    delivered: MessageDeliveryState.DELIVERED,
    read: MessageDeliveryState.READ,
    failed: MessageDeliveryState.FAILED,
    deleted: MessageDeliveryState.DELETED,
  };
  return mapped[value] ?? null;
}

function currentStatus(value: MessageDeliveryState): MessageCurrentStatus {
  return MessageCurrentStatus[value];
}

const statusRank: Record<MessageCurrentStatus, number> = {
  RECEIVED: 0,
  DRAFT: 0,
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 5,
  DELETED: 6,
};

function safeError(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/[\r\n\t]+/g, " ").slice(0, 240);
}

async function claimNextEvent(workerId: string) {
  const database = getDatabase();
  const { leaseSeconds } = getWhatsAppWebhookConfiguration();

  return database.$transaction(async (transaction) => {
    const now = new Date();
    const claimable = {
      availableAt: { lte: now },
      OR: [
        {
          status: { in: [WhatsAppWebhookEventStatus.RECEIVED, WhatsAppWebhookEventStatus.RETRY_PENDING] },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        {
          status: WhatsAppWebhookEventStatus.PROCESSING,
          leaseExpiresAt: { lte: now },
        },
      ],
    } satisfies Prisma.WhatsAppWebhookEventWhereInput;
    const candidate = await transaction.whatsAppWebhookEvent.findFirst({
      where: claimable,
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      select: { id: true, organizationId: true },
    });
    if (!candidate) return null;

    const leaseToken = `${workerId}:${randomUUID()}`;
    const claimed = await transaction.whatsAppWebhookEvent.updateMany({
      where: { id: candidate.id, organizationId: candidate.organizationId, ...claimable },
      data: {
        status: WhatsAppWebhookEventStatus.PROCESSING,
        attemptCount: { increment: 1 },
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1_000),
        processingStartedAt: now,
      },
    });
    if (claimed.count !== 1) return null;
    return { ...candidate, leaseToken };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function resolveAttribution(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  payload: Extract<NormalizedWhatsAppEvent, { kind: "message" }>,
) {
  if (!payload.referral?.sourceId) return null;
  return transaction.metaAdMapping.findFirst({
    where: { organizationId, externalAdId: payload.referral.sourceId },
    select: {
      campaignMetaAd: {
        select: {
          campaignCreativeId: true,
          campaignProduct: { select: { productId: true } },
          configuration: { select: { campaignId: true } },
        },
      },
    },
  });
}

async function processMessageEvent(
  eventId: string,
  organizationId: string,
  leaseToken: string,
  payload: Extract<NormalizedWhatsAppEvent, { kind: "message" }>,
) {
  const database = getDatabase();
  await database.$transaction(async (transaction) => {
    const event = await transaction.whatsAppWebhookEvent.findFirst({
      where: {
        id: eventId,
        organizationId,
        leaseToken,
        status: WhatsAppWebhookEventStatus.PROCESSING,
        connection: { phoneNumberId: payload.phoneNumberId },
      },
      select: { id: true, connectionId: true, deliveryId: true },
    });
    if (!event) throw new Error("Webhook event lease is no longer valid.");

    const providerTimestamp = providerDate(payload.timestamp) ?? new Date();
    const contact = await transaction.contact.upsert({
      where: { organizationId_waId: { organizationId, waId: payload.from } },
      create: {
        organizationId,
        waId: payload.from,
        phoneE164: payload.from.startsWith("+") ? payload.from : `+${payload.from}`,
        displayName: payload.contactName,
        firstSeenAt: providerTimestamp,
        lastSeenAt: providerTimestamp,
      },
      update: {
        displayName: payload.contactName ?? undefined,
        lastSeenAt: providerTimestamp,
      },
    });
    const attribution = await resolveAttribution(transaction, organizationId, payload);
    const activeLead = await transaction.lead.findFirst({
      where: {
        organizationId,
        contactId: contact.id,
        status: { in: [LeadStatus.NEW, LeadStatus.OPEN, LeadStatus.QUALIFYING, LeadStatus.QUALIFIED] },
      },
      orderBy: { lastActivityAt: "desc" },
    });
    const attributed = attribution?.campaignMetaAd;
    const lead = activeLead
      ? await transaction.lead.update({
          where: { id: activeLead.id },
          data: {
            lastActivityAt: providerTimestamp,
            providerClickId: activeLead.providerClickId ?? payload.referral?.clickId,
            providerAdId: activeLead.providerAdId ?? payload.referral?.sourceId,
            referralSourceUrl: activeLead.referralSourceUrl ?? payload.referral?.sourceUrl,
            campaignId: activeLead.campaignId ?? attributed?.configuration.campaignId,
            campaignCreativeId: activeLead.campaignCreativeId ?? attributed?.campaignCreativeId,
            productId: activeLead.productId ?? attributed?.campaignProduct?.productId,
          },
        })
      : await transaction.lead.create({
          data: {
            organizationId,
            contactId: contact.id,
            source: attributed ? "META_CAMPAIGN" : "WHATSAPP",
            campaignId: attributed?.configuration.campaignId,
            campaignCreativeId: attributed?.campaignCreativeId,
            productId: attributed?.campaignProduct?.productId,
            providerClickId: payload.referral?.clickId,
            providerAdId: payload.referral?.sourceId,
            referralSourceUrl: payload.referral?.sourceUrl,
            firstInboundAt: providerTimestamp,
            lastActivityAt: providerTimestamp,
          },
        });
    await transaction.leadQualification.upsert({
      where: { leadId: lead.id },
      create: { organizationId, leadId: lead.id },
      update: {},
    });
    const conversation = await transaction.conversation.upsert({
      where: {
        organizationId_connectionId_conversationKey: {
          organizationId,
          connectionId: event.connectionId,
          conversationKey: contact.waId,
        },
      },
      create: {
        organizationId,
        connectionId: event.connectionId,
        contactId: contact.id,
        leadId: lead.id,
        conversationKey: contact.waId,
        lastMessageAt: providerTimestamp,
        lastInboundAt: providerTimestamp,
      },
      update: {
        leadId: lead.id,
        status: "OPEN",
        lastMessageAt: providerTimestamp,
        lastInboundAt: providerTimestamp,
        resolvedAt: null,
        archivedAt: null,
      },
    });
    await transaction.followUpState.upsert({
      where: { leadId: lead.id },
      create: {
        organizationId,
        contactId: contact.id,
        leadId: lead.id,
        conversationId: conversation.id,
      },
      update: { conversationId: conversation.id },
    });
    const participant = await transaction.conversationParticipant.findFirst({
      where: { organizationId, conversationId: conversation.id, contactId: contact.id, leftAt: null },
      select: { id: true },
    });
    if (!participant) {
      await transaction.conversationParticipant.create({
        data: {
          organizationId,
          conversationId: conversation.id,
          participantType: "CONTACT",
          role: "CUSTOMER",
          contactId: contact.id,
          displayName: contact.displayName,
        },
      });
    }
    const existingMessage = await transaction.message.findUnique({
      where: {
        connectionId_providerMessageId: {
          connectionId: event.connectionId,
          providerMessageId: payload.providerMessageId,
        },
      },
      select: { id: true },
    });
    if (!existingMessage) {
      const replyTo = payload.replyToProviderMessageId
        ? await transaction.message.findUnique({
            where: {
              connectionId_providerMessageId: {
                connectionId: event.connectionId,
                providerMessageId: payload.replyToProviderMessageId,
              },
            },
            select: { id: true },
          })
        : null;
      await transaction.message.create({
        data: {
          organizationId,
          connectionId: event.connectionId,
          conversationId: conversation.id,
          sourceWebhookEventId: event.id,
          providerMessageId: payload.providerMessageId,
          direction: "INBOUND",
          authorType: "CONTACT",
          authoredByContactId: contact.id,
          contentType: messageType(payload.messageType),
          textBody: payload.textBody,
          content: payload.content
            ? payload.content as Prisma.InputJsonValue
            : undefined,
          providerMediaId: payload.media?.id,
          mediaMimeType: payload.media?.mimeType,
          mediaFileName: payload.media?.fileName,
          mediaSha256: payload.media?.sha256,
          replyToMessageId: replyTo?.id,
          currentStatus: "RECEIVED",
          providerTimestamp,
          receivedAt: new Date(),
        },
      });
      await transaction.conversation.update({
        where: { id: conversation.id },
        data: { unreadCount: { increment: 1 } },
      });
    }
    await transaction.auditEvent.create({
      data: {
        organizationId,
        actorType: AuditActorType.PROVIDER,
        action: "WHATSAPP_MESSAGE_RECEIVED",
        entityType: "Conversation",
        entityId: conversation.id,
        correlationId: event.id,
        metadata: { contentType: messageType(payload.messageType) },
      },
    });
    const completed = await transaction.whatsAppWebhookEvent.updateMany({
      where: { id: event.id, organizationId, leaseToken, status: "PROCESSING" },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        leaseToken: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (completed.count !== 1) throw new Error("Webhook event lease expired before commit.");
  });
}

async function processStatusEvent(
  eventId: string,
  organizationId: string,
  leaseToken: string,
  payload: Extract<NormalizedWhatsAppEvent, { kind: "status" }>,
) {
  const state = deliveryState(payload.status);
  if (!state) {
    await getDatabase().whatsAppWebhookEvent.updateMany({
      where: { id: eventId, organizationId, leaseToken, status: "PROCESSING" },
      data: { status: "IGNORED", processedAt: new Date(), leaseToken: null, leaseExpiresAt: null },
    });
    return;
  }
  await getDatabase().$transaction(async (transaction) => {
    const event = await transaction.whatsAppWebhookEvent.findFirst({
      where: {
        id: eventId,
        organizationId,
        leaseToken,
        status: "PROCESSING",
        connection: { phoneNumberId: payload.phoneNumberId },
      },
      select: { id: true, connectionId: true, providerEventKey: true },
    });
    if (!event) throw new Error("Webhook event lease is no longer valid.");
    const message = await transaction.message.findFirst({
      where: { organizationId, connectionId: event.connectionId, providerMessageId: payload.providerMessageId },
      select: { id: true, currentStatus: true },
    });
    if (!message) throw new Error("Referenced message is not available yet.");

    await transaction.messageDeliveryStatus.upsert({
      where: { organizationId_providerEventKey: { organizationId, providerEventKey: event.providerEventKey } },
      create: {
        organizationId,
        messageId: message.id,
        sourceWebhookEventId: event.id,
        providerEventKey: event.providerEventKey,
        status: state,
        providerTimestamp: providerDate(payload.timestamp),
        errorCode: safeError(payload.error?.code),
        errorTitle: safeError(payload.error?.title),
        errorMessage: safeError(payload.error?.message),
      },
      update: {},
    });
    const nextStatus = currentStatus(state);
    if (statusRank[nextStatus] >= statusRank[message.currentStatus]) {
      await transaction.message.update({
        where: { id: message.id },
        data: {
          currentStatus: nextStatus,
          lastErrorCode: nextStatus === "FAILED" ? safeError(payload.error?.code) : null,
          lastErrorMessage: nextStatus === "FAILED" ? safeError(payload.error?.message) : null,
        },
      });
    }
    const completed = await transaction.whatsAppWebhookEvent.updateMany({
      where: { id: event.id, organizationId, leaseToken, status: "PROCESSING" },
      data: { status: "PROCESSED", processedAt: new Date(), leaseToken: null, leaseExpiresAt: null },
    });
    if (completed.count !== 1) throw new Error("Webhook event lease expired before commit.");
  });
}

async function refreshDelivery(deliveryId: string, organizationId: string) {
  const database = getDatabase();
  const [total, processed, failed, pending] = await Promise.all([
    database.whatsAppWebhookEvent.count({ where: { deliveryId, organizationId } }),
    database.whatsAppWebhookEvent.count({ where: { deliveryId, organizationId, status: { in: ["PROCESSED", "IGNORED"] } } }),
    database.whatsAppWebhookEvent.count({ where: { deliveryId, organizationId, status: "FAILED" } }),
    database.whatsAppWebhookEvent.count({ where: { deliveryId, organizationId, status: { in: ["RECEIVED", "RETRY_PENDING", "PROCESSING"] } } }),
  ]);
  const terminal = pending === 0;
  const status = terminal
    ? failed === 0 ? "PROCESSED" : processed === 0 ? "FAILED" : "PARTIAL"
    : "PROCESSING";
  await database.whatsAppWebhookDelivery.updateMany({
    where: { id: deliveryId, organizationId },
    data: {
      status,
      eventCount: total,
      processedEventCount: processed,
      failedEventCount: failed,
      processedAt: terminal ? new Date() : null,
    },
  });
}

async function markFailure(eventId: string, organizationId: string, leaseToken: string) {
  const database = getDatabase();
  const event = await database.whatsAppWebhookEvent.findFirst({
    where: { id: eventId, organizationId, leaseToken, status: "PROCESSING" },
    select: { attemptCount: true, maxAttempts: true, deliveryId: true },
  });
  if (!event) return null;
  const exhausted = event.attemptCount >= event.maxAttempts;
  const delay = Math.min(3_600_000, 5_000 * 2 ** Math.max(0, event.attemptCount - 1));
  await database.whatsAppWebhookEvent.updateMany({
    where: { id: eventId, organizationId, leaseToken, status: "PROCESSING" },
    data: {
      status: exhausted ? "FAILED" : "RETRY_PENDING",
      availableAt: new Date(Date.now() + delay),
      leaseToken: null,
      leaseExpiresAt: null,
      lastErrorCode: "PROCESSING_FAILED",
      lastErrorMessage: "The webhook event could not be processed safely.",
    },
  });
  return event.deliveryId;
}

export async function cleanupExpiredWhatsAppWebhookPayloads(limit = 10) {
  const database = getDatabase();
  const expired = await database.whatsAppWebhookDelivery.findMany({
    where: { expiresAt: { lte: new Date() }, rawDeletedAt: null },
    orderBy: { expiresAt: "asc" },
    take: Math.min(50, Math.max(1, limit)),
    select: { id: true, organizationId: true, rawStorageKey: true },
  });
  let deleted = 0;
  for (const delivery of expired) {
    try {
      await getBlobStore().deleteObject(delivery.rawStorageKey);
      const updated = await database.whatsAppWebhookDelivery.updateMany({
        where: { id: delivery.id, organizationId: delivery.organizationId, rawDeletedAt: null },
        data: { rawDeletedAt: new Date() },
      });
      deleted += updated.count;
    } catch {
      // Retention deletion is retried by the next worker invocation.
    }
  }
  return deleted;
}

export async function processNextWhatsAppWebhookEvent(workerId = randomUUID()) {
  await cleanupExpiredWhatsAppWebhookPayloads();
  const claimed = await claimNextEvent(workerId);
  if (!claimed) return { processed: false, outcome: "idle" as const };

  const event = await getDatabase().whatsAppWebhookEvent.findFirst({
    where: { id: claimed.id, organizationId: claimed.organizationId, leaseToken: claimed.leaseToken },
    select: { normalizedPayload: true, deliveryId: true },
  });
  if (!event) return { processed: false, outcome: "lease_lost" as const };
  const parsed = normalizedWhatsAppEventSchema.safeParse(event.normalizedPayload);
  if (!parsed.success) {
    const deliveryId = await markFailure(claimed.id, claimed.organizationId, claimed.leaseToken);
    if (deliveryId) await refreshDelivery(deliveryId, claimed.organizationId);
    return { processed: true, outcome: "retry_scheduled" as const };
  }

  try {
    if (parsed.data.kind === "message") {
      await processMessageEvent(claimed.id, claimed.organizationId, claimed.leaseToken, parsed.data);
    } else if (parsed.data.kind === "status") {
      await processStatusEvent(claimed.id, claimed.organizationId, claimed.leaseToken, parsed.data);
    } else {
      await getDatabase().whatsAppWebhookEvent.updateMany({
        where: { id: claimed.id, organizationId: claimed.organizationId, leaseToken: claimed.leaseToken, status: "PROCESSING" },
        data: { status: "IGNORED", processedAt: new Date(), leaseToken: null, leaseExpiresAt: null },
      });
    }
    await refreshDelivery(event.deliveryId, claimed.organizationId);
    return { processed: true, outcome: "processed" as const };
  } catch {
    const deliveryId = await markFailure(claimed.id, claimed.organizationId, claimed.leaseToken);
    if (deliveryId) await refreshDelivery(deliveryId, claimed.organizationId);
    return { processed: true, outcome: "retry_scheduled" as const };
  }
}
