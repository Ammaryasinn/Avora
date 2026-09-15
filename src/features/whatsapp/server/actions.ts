"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import {
  FollowUpConsentStatus,
  LeadQualificationStage,
  OrganizationRole,
} from "@/generated/prisma/enums";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";
import { isWhatsAppOutboundEnabled } from "@/lib/whatsapp/config";
import {
  getWhatsAppCloudApiGateway,
  WhatsAppCloudApiAmbiguousError,
  WhatsAppCloudApiError,
} from "@/lib/whatsapp/cloud-api-gateway";
import {
  evaluateWhatsAppOutboundEligibility,
  resolveLatestInboundAt,
} from "@/lib/whatsapp/outbound-policy.mjs";
import { decryptWhatsAppToken, encryptWhatsAppToken } from "@/lib/whatsapp/token-cipher";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

import { recordAuditEvent } from "./audit";
import {
  assignmentSchema,
  consentSchema,
  manualDraftSchema,
  parseForm,
  qualificationSchema,
  whatsappConnectionSchema,
} from "./schema";

const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

class OutboundValidationError extends Error {}

function paths(organizationSlug: string, conversationId?: string, leadId?: string) {
  const dashboard = `/dashboard/${organizationSlug}`;
  revalidatePath(`${dashboard}/settings/integrations/whatsapp`);
  revalidatePath(`${dashboard}/conversations`);
  revalidatePath(`${dashboard}/leads`);
  if (conversationId) revalidatePath(`${dashboard}/conversations/${conversationId}`);
  if (leadId) revalidatePath(`${dashboard}/leads/${leadId}`);
}

function invalid(message: string, error?: z.ZodError): ActionState {
  return {
    status: "error",
    message,
    fieldErrors: error ? z.flattenError(error).fieldErrors : undefined,
  };
}

function safeProviderError(value: string | undefined) {
  return value?.replace(/[\r\n\t]+/g, " ").slice(0, 240) || "WhatsApp rejected the message.";
}

async function latestPersistedInboundAt(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  conversationId: string,
) {
  const select = { providerTimestamp: true, receivedAt: true, createdAt: true } as const;
  const [providerTimestamp, receivedAt, createdAt] = await Promise.all([
    transaction.message.findFirst({
      where: {
        organizationId,
        conversationId,
        direction: "INBOUND",
        providerTimestamp: { not: null },
      },
      orderBy: { providerTimestamp: "desc" },
      select,
    }),
    transaction.message.findFirst({
      where: {
        organizationId,
        conversationId,
        direction: "INBOUND",
        providerTimestamp: null,
        receivedAt: { not: null },
      },
      orderBy: { receivedAt: "desc" },
      select,
    }),
    transaction.message.findFirst({
      where: {
        organizationId,
        conversationId,
        direction: "INBOUND",
        providerTimestamp: null,
        receivedAt: null,
      },
      orderBy: { createdAt: "desc" },
      select,
    }),
  ]);
  return resolveLatestInboundAt(
    [providerTimestamp, receivedAt, createdAt].filter(
      (message): message is NonNullable<typeof message> => message !== null,
    ),
  );
}

export async function saveWhatsAppConnectionAction(
  organizationSlug: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(whatsappConnectionSchema, formData);
  if (!parsed.success) return invalid("Review the WhatsApp connection details.", parsed.error);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  let existing = parsed.data.connectionId
    ? await database.whatsAppConnection.findFirst({
        where: { id: parsed.data.connectionId, organizationId: tenant.organizationId },
        select: { id: true, organizationId: true },
      })
    : null;
  if (parsed.data.connectionId && !existing) {
    return invalid("That WhatsApp connection is unavailable.");
  }
  const phoneOwner = await database.whatsAppConnection.findUnique({
    where: { phoneNumberId: parsed.data.phoneNumberId },
    select: { id: true, organizationId: true },
  });
  if (phoneOwner && phoneOwner.id !== existing?.id && phoneOwner.organizationId !== tenant.organizationId) {
    return invalid("That WhatsApp phone number is already connected to another Avora organization.");
  }
  if (phoneOwner && phoneOwner.id !== existing?.id) {
    if (existing) {
      return invalid("That phone number belongs to another connection in this organization.");
    }
    existing = phoneOwner;
  }

  const connectionId = existing?.id ?? randomUUID();
  try {
    const gateway = getWhatsAppCloudApiGateway();
    const phone = await gateway.inspectPhoneNumber(parsed.data.phoneNumberId, parsed.data.accessToken);
    if (phone.id !== parsed.data.phoneNumberId) {
      return invalid("Meta returned a different WhatsApp phone number identity.");
    }
    await gateway.verifyPhoneNumberOwnership(
      parsed.data.wabaId,
      parsed.data.phoneNumberId,
      parsed.data.accessToken,
    );
    if (parsed.data.intent === "test") {
      return {
        status: "idle",
        message: `Connection test passed for ${phone.verifiedName ?? phone.displayPhoneNumber ?? "the supplied phone number"}. Nothing was saved or sent.`,
      };
    }
    await gateway.subscribeWaba(parsed.data.wabaId, parsed.data.accessToken);
    const encrypted = encryptWhatsAppToken(
      parsed.data.accessToken,
      tenant.organizationId,
      connectionId,
    );
    const connection = existing
      ? await database.whatsAppConnection.update({
          where: { id: existing.id },
          data: {
            configuredById: user.id,
            status: "CONNECTED",
            wabaId: parsed.data.wabaId,
            phoneNumberId: parsed.data.phoneNumberId,
            displayPhoneNumber: phone.displayPhoneNumber,
            verifiedName: phone.verifiedName,
            tokenCiphertext: encrypted.ciphertext,
            tokenIv: encrypted.iv,
            tokenAuthTag: encrypted.authTag,
            tokenKeyVersion: encrypted.keyVersion,
            webhookSubscribedAt: new Date(),
            lastValidatedAt: new Date(),
            disconnectedAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
          select: { id: true },
        })
      : await database.whatsAppConnection.create({
          data: {
        id: connectionId,
        organizationId: tenant.organizationId,
        configuredById: user.id,
        status: "CONNECTED",
        wabaId: parsed.data.wabaId,
        phoneNumberId: parsed.data.phoneNumberId,
        displayPhoneNumber: phone.displayPhoneNumber,
        verifiedName: phone.verifiedName,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
        webhookSubscribedAt: new Date(),
        lastValidatedAt: new Date(),
          },
          select: { id: true },
        });
    await recordAuditEvent({
      organizationId: tenant.organizationId,
      actorUserId: user.id,
      action: existing ? "WHATSAPP_CONNECTION_RECONNECTED" : "WHATSAPP_CONNECTION_CREATED",
      entityType: "WhatsAppConnection",
      entityId: connection.id,
      metadata: { phoneNumberId: parsed.data.phoneNumberId, wabaId: parsed.data.wabaId },
    });
    paths(organizationSlug);
    return { status: "idle", message: "WhatsApp connection verified and saved." };
  } catch {
    return invalid("Avora could not verify and save this WhatsApp connection.");
  }
}

export async function disconnectWhatsAppAction(
  organizationSlug: string,
  connectionId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const updated = await getDatabase().whatsAppConnection.updateMany({
    where: { id: connectionId, organizationId: tenant.organizationId },
    data: {
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      tokenCiphertext: null,
      tokenIv: null,
      tokenAuthTag: null,
      tokenKeyVersion: null,
      tokenExpiresAt: null,
    },
  });
  if (updated.count === 1) {
    await recordAuditEvent({
      organizationId: tenant.organizationId,
      actorUserId: user.id,
      action: "WHATSAPP_CONNECTION_DISCONNECTED",
      entityType: "WhatsAppConnection",
      entityId: connectionId,
    });
  }
  paths(organizationSlug);
}

export async function assignConversationAction(
  organizationSlug: string,
  conversationId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(assignmentSchema, formData);
  if (!parsed.success) return invalid("Choose a valid organization member.", parsed.error);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const [conversation, member] = await Promise.all([
    database.conversation.findFirst({
      where: { id: conversationId, organizationId: tenant.organizationId, archivedAt: null },
      select: { id: true, leadId: true },
    }),
    database.organizationMember.findFirst({
      where: { id: parsed.data.assignedOrganizationMemberId, organizationId: tenant.organizationId },
      select: { id: true },
    }),
  ]);
  if (!conversation || !member) return invalid("The conversation or assignee is unavailable.");

  await database.$transaction(async (transaction) => {
    await transaction.conversationAssignment.updateMany({
      where: { organizationId: tenant.organizationId, conversationId, status: "ACTIVE" },
      data: { status: "RELEASED", releasedAt: new Date(), releasedById: user.id },
    });
    await transaction.conversationAssignment.create({
      data: {
        organizationId: tenant.organizationId,
        conversationId,
        assignedOrganizationMemberId: member.id,
        assignedById: user.id,
        reason: parsed.data.reason,
      },
    });
    await transaction.conversation.update({
      where: { id: conversationId },
      data: {
        status: "HANDOFF",
        currentAssignedOrganizationMemberId: member.id,
        handedOffAt: new Date(),
        automationSuppressedAt: new Date(),
        automationSuppressionReason: "Human handoff",
      },
    });
    const participant = await transaction.conversationParticipant.findFirst({
      where: {
        organizationId: tenant.organizationId,
        conversationId,
        organizationMemberId: member.id,
        leftAt: null,
      },
      select: { id: true },
    });
    if (!participant) {
      await transaction.conversationParticipant.create({
        data: {
          organizationId: tenant.organizationId,
          conversationId,
          participantType: "ORGANIZATION_MEMBER",
          role: "ASSIGNEE",
          organizationMemberId: member.id,
        },
      });
    }
    await transaction.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "CONVERSATION_ASSIGNED",
        entityType: "Conversation",
        entityId: conversationId,
        metadata: { assignedOrganizationMemberId: member.id },
      },
    });
  });
  paths(organizationSlug, conversationId, conversation.leadId ?? undefined);
  return { status: "idle", message: "Conversation handed off and assigned." };
}

export async function releaseConversationAssignmentAction(
  organizationSlug: string,
  conversationId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const conversation = await getDatabase().conversation.findFirst({
    where: { id: conversationId, organizationId: tenant.organizationId },
    select: { id: true, leadId: true, currentAssignedOrganizationMemberId: true },
  });
  if (!conversation) return;
  await getDatabase().$transaction(async (transaction) => {
    await transaction.conversationAssignment.updateMany({
      where: { organizationId: tenant.organizationId, conversationId, status: "ACTIVE" },
      data: { status: "RELEASED", releasedAt: new Date(), releasedById: user.id },
    });
    if (conversation.currentAssignedOrganizationMemberId) {
      await transaction.conversationParticipant.updateMany({
        where: {
          organizationId: tenant.organizationId,
          conversationId,
          organizationMemberId: conversation.currentAssignedOrganizationMemberId,
          leftAt: null,
        },
        data: { leftAt: new Date() },
      });
    }
    await transaction.conversation.update({
      where: { id: conversationId },
      data: { status: "OPEN", currentAssignedOrganizationMemberId: null },
    });
    await transaction.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "CONVERSATION_ASSIGNMENT_RELEASED",
        entityType: "Conversation",
        entityId: conversationId,
      },
    });
  });
  paths(organizationSlug, conversationId, conversation.leadId ?? undefined);
}

export async function updateLeadQualificationAction(
  organizationSlug: string,
  leadId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(qualificationSchema, formData);
  if (!parsed.success) return invalid("Review the qualification details.", parsed.error);
  const user = await ensureCurrentUser();
  const lead = await getDatabase().lead.findFirst({
    where: { id: leadId, organizationId: tenant.organizationId, archivedAt: null },
    select: { id: true, conversations: { select: { id: true }, take: 1 } },
  });
  if (!lead) return invalid("The lead is unavailable.");
  const now = new Date();
  await getDatabase().$transaction([
    getDatabase().lead.update({
      where: { id: lead.id },
      data: { status: parsed.data.leadStatus, lastActivityAt: now },
    }),
    getDatabase().leadQualification.upsert({
      where: { leadId: lead.id },
      create: {
        organizationId: tenant.organizationId,
        leadId: lead.id,
        stage: parsed.data.stage,
        need: parsed.data.need,
        budget: parsed.data.budget,
        timeline: parsed.data.timeline,
        decisionMaker: parsed.data.decisionMaker,
        score: parsed.data.score,
        notes: parsed.data.notes,
        updatedById: user.id,
        qualifiedAt: parsed.data.stage === LeadQualificationStage.QUALIFIED ? now : null,
        disqualifiedAt: parsed.data.stage === LeadQualificationStage.DISQUALIFIED ? now : null,
      },
      update: {
        stage: parsed.data.stage,
        need: parsed.data.need ?? null,
        budget: parsed.data.budget ?? null,
        timeline: parsed.data.timeline ?? null,
        decisionMaker: parsed.data.decisionMaker ?? null,
        score: parsed.data.score ?? null,
        notes: parsed.data.notes ?? null,
        updatedById: user.id,
        qualifiedAt: parsed.data.stage === LeadQualificationStage.QUALIFIED ? now : null,
        disqualifiedAt: parsed.data.stage === LeadQualificationStage.DISQUALIFIED ? now : null,
      },
    }),
    getDatabase().auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "LEAD_QUALIFICATION_UPDATED",
        entityType: "Lead",
        entityId: lead.id,
        metadata: { status: parsed.data.leadStatus, stage: parsed.data.stage },
      },
    }),
  ]);
  paths(organizationSlug, lead.conversations[0]?.id, lead.id);
  return { status: "idle", message: "Lead qualification updated." };
}

function canTransitionConsent(
  current: FollowUpConsentStatus,
  next: FollowUpConsentStatus,
) {
  if (current === next) return true;
  const transitions: Record<FollowUpConsentStatus, FollowUpConsentStatus[]> = {
    UNKNOWN: [FollowUpConsentStatus.NO_CONSENT, FollowUpConsentStatus.OPTED_IN, FollowUpConsentStatus.OPTED_OUT],
    NO_CONSENT: [FollowUpConsentStatus.OPTED_IN, FollowUpConsentStatus.OPTED_OUT],
    OPTED_IN: [FollowUpConsentStatus.OPTED_OUT],
    OPTED_OUT: [FollowUpConsentStatus.OPTED_IN],
  };
  return transitions[current].includes(next);
}

export async function updateFollowUpConsentAction(
  organizationSlug: string,
  leadId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(consentSchema, formData);
  if (!parsed.success) return invalid("Review the consent record.", parsed.error);
  const user = await ensureCurrentUser();
  const lead = await getDatabase().lead.findFirst({
    where: { id: leadId, organizationId: tenant.organizationId },
    select: {
      id: true,
      contactId: true,
      followUpState: { select: { consentStatus: true } },
      conversations: { where: { archivedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!lead) return invalid("The lead is unavailable.");
  const current = lead.followUpState?.consentStatus ?? FollowUpConsentStatus.UNKNOWN;
  if (!canTransitionConsent(current, parsed.data.consentStatus)) {
    return invalid(`Consent cannot move directly from ${current} to ${parsed.data.consentStatus}.`);
  }
  const now = new Date();
  const pausesFollowUp = parsed.data.consentStatus !== FollowUpConsentStatus.OPTED_IN;
  await getDatabase().$transaction([
    getDatabase().followUpState.upsert({
      where: { leadId: lead.id },
      create: {
        organizationId: tenant.organizationId,
        contactId: lead.contactId,
        leadId: lead.id,
        conversationId: lead.conversations[0]?.id,
        consentStatus: parsed.data.consentStatus,
        consentSource: parsed.data.consentSource,
        consentCapturedAt: parsed.data.consentStatus === FollowUpConsentStatus.UNKNOWN ? null : now,
        optedOutAt: parsed.data.consentStatus === FollowUpConsentStatus.OPTED_OUT ? now : null,
        status: pausesFollowUp ? "PAUSED" : "NOT_SCHEDULED",
        pausedReason: pausesFollowUp ? "Follow-up consent is unavailable." : null,
        updatedById: user.id,
      },
      update: {
        consentStatus: parsed.data.consentStatus,
        consentSource: parsed.data.consentSource ?? null,
        consentCapturedAt: parsed.data.consentStatus === FollowUpConsentStatus.UNKNOWN ? null : now,
        optedOutAt: parsed.data.consentStatus === FollowUpConsentStatus.OPTED_OUT ? now : null,
        status: pausesFollowUp ? "PAUSED" : "NOT_SCHEDULED",
        nextFollowUpAt: null,
        pausedReason: pausesFollowUp ? "Follow-up consent is unavailable." : null,
        updatedById: user.id,
      },
    }),
    getDatabase().auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "FOLLOW_UP_CONSENT_UPDATED",
        entityType: "Lead",
        entityId: lead.id,
        metadata: { previous: current, current: parsed.data.consentStatus },
      },
    }),
  ]);
  paths(organizationSlug, lead.conversations[0]?.id, lead.id);
  return { status: "idle", message: "Follow-up consent updated." };
}

export async function createManualDraftAction(
  organizationSlug: string,
  conversationId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(manualDraftSchema, formData);
  if (!parsed.success) return invalid("Review the reply draft.", parsed.error);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const [conversation, membership] = await Promise.all([
    database.conversation.findFirst({
      where: { id: conversationId, organizationId: tenant.organizationId, archivedAt: null },
      select: { id: true, connectionId: true, leadId: true },
    }),
    database.organizationMember.findFirst({
      where: { organizationId: tenant.organizationId, userId: user.id },
      select: { id: true },
    }),
  ]);
  if (!conversation || !membership) return invalid("The conversation is unavailable.");
  const message = await database.message.create({
    data: {
      organizationId: tenant.organizationId,
      connectionId: conversation.connectionId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      authorType: "HUMAN",
      authoredByOrganizationMemberId: membership.id,
      contentType: "TEXT",
      textBody: parsed.data.body,
      currentStatus: "DRAFT",
    },
    select: { id: true },
  });
  await recordAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "WHATSAPP_REPLY_DRAFT_CREATED",
    entityType: "Message",
    entityId: message.id,
  });
  paths(organizationSlug, conversation.id, conversation.leadId ?? undefined);
  return { status: "idle", message: "Reply saved as a draft. Nothing was sent to WhatsApp." };
}

export async function sendManualDraftAction(
  organizationSlug: string,
  conversationId: string,
  messageId: string,
  _previousState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previousState;
  void _formData;
  const tenant = await requireTenantContext(organizationSlug, managers);
  if (!isWhatsAppOutboundEnabled()) {
    return invalid("Outbound WhatsApp sending is disabled.");
  }
  const parsedMessageId = z.string().trim().min(1).max(64).safeParse(messageId);
  if (!parsedMessageId.success) return invalid("The reply draft is unavailable.");
  const user = await ensureCurrentUser();
  const database = getDatabase();

  let claimed: {
    messageId: string;
    textBody: string;
    recipientWaId: string;
    phoneNumberId: string;
    accessToken: string;
    leadId: string | null;
  };
  try {
    claimed = await database.$transaction(async (transaction) => {
      const message = await transaction.message.findFirst({
        where: {
          id: parsedMessageId.data,
          organizationId: tenant.organizationId,
          conversationId,
          conversation: {
            organizationId: tenant.organizationId,
            contact: { organizationId: tenant.organizationId },
            connection: { organizationId: tenant.organizationId },
          },
        },
        select: {
          id: true,
          direction: true,
          authorType: true,
          contentType: true,
          textBody: true,
          currentStatus: true,
          conversation: {
            select: {
              id: true,
              organizationId: true,
              archivedAt: true,
              leadId: true,
              contact: { select: { organizationId: true, waId: true, status: true } },
              followUpState: { select: { consentStatus: true } },
              connection: {
                select: {
                  id: true,
                  organizationId: true,
                  status: true,
                  phoneNumberId: true,
                  disconnectedAt: true,
                  tokenCiphertext: true,
                  tokenIv: true,
                  tokenAuthTag: true,
                  tokenKeyVersion: true,
                },
              },
            },
          },
        },
      });
      if (
        !message ||
        message.direction !== "OUTBOUND" ||
        message.authorType !== "HUMAN" ||
        message.contentType !== "TEXT" ||
        !message.textBody
      ) {
        throw new OutboundValidationError("The reply draft is unavailable.");
      }
      if (message.currentStatus !== "DRAFT") {
        throw new OutboundValidationError("This draft has already been submitted.");
      }

      const connection = message.conversation.connection;
      const hasUsableToken = Boolean(
        connection.tokenCiphertext &&
        connection.tokenIv &&
        connection.tokenAuthTag &&
        connection.tokenKeyVersion,
      );
      const latestInboundAt = await latestPersistedInboundAt(
        transaction,
        tenant.organizationId,
        conversationId,
      );
      const eligibility = evaluateWhatsAppOutboundEligibility({
        featureEnabled: isWhatsAppOutboundEnabled(),
        role: tenant.role,
        conversationArchived: Boolean(message.conversation.archivedAt),
        connectionStatus: connection.status,
        connectionDisconnected: Boolean(connection.disconnectedAt),
        hasUsableToken,
        contactStatus: message.conversation.contact.status,
        consentStatus: message.conversation.followUpState?.consentStatus ?? FollowUpConsentStatus.UNKNOWN,
        latestInboundAt,
        now: new Date(),
      });
      if (!eligibility.canSend) throw new OutboundValidationError(eligibility.message);
      if (
        message.conversation.organizationId !== tenant.organizationId ||
        message.conversation.contact.organizationId !== tenant.organizationId ||
        connection.organizationId !== tenant.organizationId
      ) {
        throw new OutboundValidationError("The reply draft is unavailable.");
      }

      const accessToken = decryptWhatsAppToken(
        {
          ciphertext: connection.tokenCiphertext!,
          iv: connection.tokenIv!,
          authTag: connection.tokenAuthTag!,
          keyVersion: connection.tokenKeyVersion!,
        },
        tenant.organizationId,
        connection.id,
      );
      const claim = await transaction.message.updateMany({
        where: {
          id: message.id,
          organizationId: tenant.organizationId,
          conversationId,
          currentStatus: "DRAFT",
        },
        data: {
          currentStatus: "QUEUED",
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (claim.count !== 1) {
        throw new OutboundValidationError("This draft has already been submitted.");
      }
      return {
        messageId: message.id,
        textBody: message.textBody,
        recipientWaId: message.conversation.contact.waId,
        phoneNumberId: connection.phoneNumberId,
        accessToken,
        leadId: message.conversation.leadId,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof OutboundValidationError) return invalid(error.message);
    return invalid("Avora could not safely prepare this WhatsApp message.");
  }

  if (!isWhatsAppOutboundEnabled()) {
    await database.message.updateMany({
      where: {
        id: claimed.messageId,
        organizationId: tenant.organizationId,
        conversationId,
        currentStatus: "QUEUED",
        providerMessageId: null,
      },
      data: { currentStatus: "DRAFT" },
    });
    return invalid("Outbound WhatsApp sending is disabled.");
  }

  try {
    const result = await getWhatsAppCloudApiGateway().sendTextMessage(
      claimed.phoneNumberId,
      claimed.recipientWaId,
      claimed.textBody,
      claimed.accessToken,
    );
    const sentAt = new Date();
    await database.$transaction(async (transaction) => {
      const finalized = await transaction.message.updateMany({
        where: {
          id: claimed.messageId,
          organizationId: tenant.organizationId,
          conversationId,
          currentStatus: "QUEUED",
          providerMessageId: null,
        },
        data: {
          providerMessageId: result.providerMessageId,
          currentStatus: "SENT",
          sentAt,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      if (finalized.count !== 1) throw new Error("The send claim could not be finalized.");
      await transaction.messageDeliveryStatus.create({
        data: {
          organizationId: tenant.organizationId,
          messageId: claimed.messageId,
          providerEventKey: `outbound:${claimed.messageId}:sent`,
          status: "SENT",
          providerTimestamp: sentAt,
        },
      });
      await transaction.conversation.updateMany({
        where: { id: conversationId, organizationId: tenant.organizationId, archivedAt: null },
        data: { lastMessageAt: sentAt, lastOutboundAt: sentAt },
      });
      if (claimed.leadId) {
        await transaction.lead.updateMany({
          where: { id: claimed.leadId, organizationId: tenant.organizationId },
          data: { lastActivityAt: sentAt },
        });
      }
      await transaction.auditEvent.create({
        data: {
          organizationId: tenant.organizationId,
          actorUserId: user.id,
          action: "WHATSAPP_MESSAGE_SENT",
          entityType: "Message",
          entityId: claimed.messageId,
          correlationId: claimed.messageId,
          metadata: { providerMessageId: result.providerMessageId },
        },
      });
    });
    paths(organizationSlug, conversationId, claimed.leadId ?? undefined);
    return { status: "idle", message: "Message sent via WhatsApp." };
  } catch (error) {
    if (error instanceof WhatsAppCloudApiError) {
      const errorMessage = safeProviderError(error.message);
      try {
        await database.$transaction([
          database.message.updateMany({
            where: {
              id: claimed.messageId,
              organizationId: tenant.organizationId,
              conversationId,
              currentStatus: "QUEUED",
              providerMessageId: null,
            },
            data: {
              currentStatus: "FAILED",
              lastErrorCode: error.code ? String(error.code) : `HTTP_${error.status}`,
              lastErrorMessage: errorMessage,
            },
          }),
          database.messageDeliveryStatus.upsert({
            where: {
              organizationId_providerEventKey: {
                organizationId: tenant.organizationId,
                providerEventKey: `outbound:${claimed.messageId}:failed`,
              },
            },
            create: {
              organizationId: tenant.organizationId,
              messageId: claimed.messageId,
              providerEventKey: `outbound:${claimed.messageId}:failed`,
              status: "FAILED",
              errorCode: error.code ? String(error.code) : `HTTP_${error.status}`,
              errorTitle: error.type?.slice(0, 240),
              errorMessage,
            },
            update: {},
          }),
          database.auditEvent.create({
            data: {
              organizationId: tenant.organizationId,
              actorUserId: user.id,
              action: "WHATSAPP_MESSAGE_SEND_FAILED",
              entityType: "Message",
              entityId: claimed.messageId,
              correlationId: claimed.messageId,
              metadata: { status: error.status, code: error.code ?? null },
            },
          }),
        ]);
      } catch {
        return invalid("WhatsApp rejected the message, but Avora could not persist the failure details.");
      }
      paths(organizationSlug, conversationId, claimed.leadId ?? undefined);
      return invalid("WhatsApp rejected the message. Review the failed draft before trying again.");
    }

    const ambiguous = error instanceof WhatsAppCloudApiAmbiguousError
      ? error.message
      : "The WhatsApp send result could not be confirmed.";
    try {
      await database.$transaction([
        database.message.updateMany({
          where: {
            id: claimed.messageId,
            organizationId: tenant.organizationId,
            conversationId,
            currentStatus: "QUEUED",
            providerMessageId: null,
          },
          data: {
            lastErrorCode: "SEND_OUTCOME_UNKNOWN",
            lastErrorMessage: safeProviderError(ambiguous),
          },
        }),
        database.auditEvent.create({
          data: {
            organizationId: tenant.organizationId,
            actorUserId: user.id,
            action: "WHATSAPP_MESSAGE_SEND_OUTCOME_UNKNOWN",
            entityType: "Message",
            entityId: claimed.messageId,
            correlationId: claimed.messageId,
          },
        }),
      ]);
    } catch {
      return invalid("The WhatsApp send result is unknown. Do not retry this draft.");
    }
    paths(organizationSlug, conversationId, claimed.leadId ?? undefined);
    return invalid("The WhatsApp send result is unknown. Do not retry this draft.");
  }
}

export async function markConversationReadAction(
  organizationSlug: string,
  conversationId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  await getDatabase().conversation.updateMany({
    where: { id: conversationId, organizationId: tenant.organizationId },
    data: { unreadCount: 0 },
  });
  paths(organizationSlug, conversationId);
}
