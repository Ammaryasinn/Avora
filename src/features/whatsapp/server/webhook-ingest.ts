import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db/database";
import { getBlobStore } from "@/lib/storage/r2-object-storage";
import { getWhatsAppWebhookConfiguration } from "@/lib/whatsapp/config";
import {
  extractWhatsAppWebhookEvents,
  whatsappWebhookEnvelopeSchema,
} from "@/lib/whatsapp/contracts";
import { getWhatsAppWebhookDispatcher } from "@/lib/whatsapp/webhook-dispatcher";

const MAXIMUM_WEBHOOK_BYTES = 1_048_576;

export class WhatsAppWebhookInputError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WhatsAppWebhookInputError";
  }
}

function storageKey(organizationId: string, deliveryId: string, receivedAt: Date) {
  const date = receivedAt.toISOString().slice(0, 10);
  return `organizations/${organizationId}/whatsapp/webhooks/${date}/${deliveryId}.json`;
}

export async function ingestWhatsAppWebhook(body: Uint8Array) {
  const configuration = getWhatsAppWebhookConfiguration();
  if (!configuration.inboundEnabled) {
    throw new WhatsAppWebhookInputError("WhatsApp inbound processing is disabled.", 503);
  }
  if (body.byteLength === 0 || body.byteLength > MAXIMUM_WEBHOOK_BYTES) {
    throw new WhatsAppWebhookInputError("Invalid webhook body size.", 413);
  }

  let input: unknown;
  try {
    input = JSON.parse(Buffer.from(body).toString("utf8"));
  } catch {
    throw new WhatsAppWebhookInputError("Invalid webhook JSON.", 400);
  }
  const parsed = whatsappWebhookEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new WhatsAppWebhookInputError("Invalid WhatsApp webhook payload.", 400);
  }

  const extracted = extractWhatsAppWebhookEvents(parsed.data);
  if (extracted.phoneNumberIds.size !== 1) {
    throw new WhatsAppWebhookInputError("Webhook delivery must target one phone number.", 400);
  }
  const phoneNumberId = [...extracted.phoneNumberIds][0];
  const database = getDatabase();
  const connection = await database.whatsAppConnection.findFirst({
    where: {
      phoneNumberId,
      status: { notIn: ["DISCONNECTED", "REVOKED"] },
    },
    select: { id: true, organizationId: true },
  });
  if (!connection) return { outcome: "unknown_connection" as const };

  const payloadSha256 = createHash("sha256").update(body).digest("hex");
  const duplicate = await database.whatsAppWebhookDelivery.findUnique({
    where: { connectionId_payloadSha256: { connectionId: connection.id, payloadSha256 } },
    select: { id: true },
  });
  if (duplicate) return { outcome: "duplicate" as const, deliveryId: duplicate.id };

  const receivedAt = new Date();
  const deliveryId = randomUUID();
  const blobStore = getBlobStore();
  const rawStorageKey = storageKey(connection.organizationId, deliveryId, receivedAt);
  const expiresAt = new Date(receivedAt.getTime() + configuration.rawRetentionDays * 86_400_000);

  await blobStore.putObject({
    key: rawStorageKey,
    body,
    contentType: "application/json",
    metadata: {
      organization: connection.organizationId,
      retentionUntil: expiresAt.toISOString(),
      payloadSha256,
    },
  });

  try {
    const result = await database.$transaction(async (transaction) => {
      await transaction.whatsAppWebhookDelivery.create({
        data: {
          id: deliveryId,
          organizationId: connection.organizationId,
          connectionId: connection.id,
          payloadSha256,
          rawStorageProvider: blobStore.provider,
          rawBucket: blobStore.bucket,
          rawStorageKey,
          rawSizeBytes: body.byteLength,
          expiresAt,
        },
      });
      const created = await transaction.whatsAppWebhookEvent.createMany({
        data: extracted.events.map((event) => ({
          organizationId: connection.organizationId,
          connectionId: connection.id,
          deliveryId,
          providerEventKey: event.providerEventKey,
          providerMessageId: event.providerMessageId,
          eventType: event.eventType,
          normalizedPayload: event.payload as Prisma.InputJsonValue,
          maxAttempts: configuration.maxAttempts,
        })),
        skipDuplicates: true,
      });
      await transaction.whatsAppWebhookDelivery.update({
        where: { id: deliveryId },
        data: {
          eventCount: created.count,
          status: created.count === 0 ? "IGNORED" : "RECEIVED",
          processedAt: created.count === 0 ? new Date() : null,
        },
      });
      await transaction.whatsAppConnection.update({
        where: { id: connection.id },
        data: { lastWebhookAt: receivedAt },
      });
      return created.count;
    });
    if (result > 0) {
      await getWhatsAppWebhookDispatcher().enqueue(deliveryId, connection.organizationId);
    }
    return { outcome: result > 0 ? "accepted" as const : "duplicate" as const, deliveryId };
  } catch (error) {
    await blobStore.deleteObject(rawStorageKey).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await database.whatsAppWebhookDelivery.findUnique({
        where: { connectionId_payloadSha256: { connectionId: connection.id, payloadSha256 } },
        select: { id: true },
      });
      return { outcome: "duplicate" as const, deliveryId: existing?.id };
    }
    throw error;
  }
}
