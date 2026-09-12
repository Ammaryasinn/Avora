import { createHash } from "node:crypto";

import { z } from "zod";

const metadataSchema = z.object({
  display_phone_number: z.string().optional(),
  phone_number_id: z.string().min(1),
});

const contactSchema = z.object({
  wa_id: z.string().min(1),
  profile: z.object({ name: z.string().optional() }).optional(),
});

const mediaSchema = z.object({
  id: z.string().optional(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});

const messageSchema = z.object({
  from: z.string().min(1),
  id: z.string().min(1),
  timestamp: z.string().optional(),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
  context: z.object({ id: z.string().optional() }).optional(),
  referral: z.object({
    ctwa_clid: z.string().optional(),
    source_id: z.string().optional(),
    source_url: z.string().optional(),
  }).optional(),
  image: mediaSchema.optional(),
  audio: mediaSchema.optional(),
  video: mediaSchema.optional(),
  document: mediaSchema.optional(),
  sticker: mediaSchema.optional(),
  location: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    name: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
  interactive: z.record(z.string(), z.unknown()).optional(),
  reaction: z.object({ message_id: z.string().optional(), emoji: z.string().optional() }).optional(),
});

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  timestamp: z.string().optional(),
  recipient_id: z.string().optional(),
  errors: z.array(z.object({
    code: z.number().optional(),
    title: z.string().optional(),
    message: z.string().optional(),
  })).optional(),
});

const valueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: metadataSchema,
  contacts: z.array(contactSchema).optional(),
  messages: z.array(messageSchema).optional(),
  statuses: z.array(statusSchema).optional(),
});

export const whatsappWebhookEnvelopeSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(z.object({
    id: z.string().min(1),
    changes: z.array(z.object({
      field: z.string(),
      value: valueSchema,
    })),
  })).min(1),
});

export const normalizedMessageEventSchema = z.object({
  kind: z.literal("message"),
  wabaId: z.string(),
  phoneNumberId: z.string(),
  displayPhoneNumber: z.string().nullable(),
  providerMessageId: z.string(),
  from: z.string(),
  contactName: z.string().nullable(),
  timestamp: z.string().nullable(),
  messageType: z.string(),
  textBody: z.string().nullable(),
  content: z.record(z.string(), z.unknown()).nullable(),
  media: z.object({
    id: z.string().nullable(),
    mimeType: z.string().nullable(),
    sha256: z.string().nullable(),
    fileName: z.string().nullable(),
  }).nullable(),
  replyToProviderMessageId: z.string().nullable(),
  referral: z.object({
    clickId: z.string().nullable(),
    sourceId: z.string().nullable(),
    sourceUrl: z.string().nullable(),
  }).nullable(),
});

export const normalizedStatusEventSchema = z.object({
  kind: z.literal("status"),
  wabaId: z.string(),
  phoneNumberId: z.string(),
  providerMessageId: z.string(),
  status: z.string(),
  timestamp: z.string().nullable(),
  recipientId: z.string().nullable(),
  error: z.object({
    code: z.string().nullable(),
    title: z.string().nullable(),
    message: z.string().nullable(),
  }).nullable(),
});

export const normalizedUnknownEventSchema = z.object({
  kind: z.literal("unknown"),
  wabaId: z.string(),
  phoneNumberId: z.string(),
  field: z.string(),
});

export const normalizedWhatsAppEventSchema = z.discriminatedUnion("kind", [
  normalizedMessageEventSchema,
  normalizedStatusEventSchema,
  normalizedUnknownEventSchema,
]);

export type NormalizedWhatsAppEvent = z.infer<typeof normalizedWhatsAppEventSchema>;

export type ExtractedWhatsAppEvent = {
  providerEventKey: string;
  providerMessageId: string | null;
  eventType: "MESSAGE" | "MESSAGE_STATUS" | "UNKNOWN";
  payload: NormalizedWhatsAppEvent;
};

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mediaFor(message: z.infer<typeof messageSchema>) {
  const value = message.image ?? message.audio ?? message.video ?? message.document ?? message.sticker;
  if (!value) return null;
  return {
    id: value.id ?? null,
    mimeType: value.mime_type ?? null,
    sha256: value.sha256 ?? null,
    fileName: value.filename ?? null,
  };
}

function contentFor(message: z.infer<typeof messageSchema>) {
  if (message.location) return { location: message.location };
  if (message.interactive) return { interactive: message.interactive };
  if (message.reaction) return { reaction: message.reaction };
  return null;
}

export function extractWhatsAppWebhookEvents(
  envelope: z.infer<typeof whatsappWebhookEnvelopeSchema>,
) {
  const phoneNumberIds = new Set<string>();
  const events: ExtractedWhatsAppEvent[] = [];

  for (const entry of envelope.entry) {
    for (const change of entry.changes) {
      const { value } = change;
      phoneNumberIds.add(value.metadata.phone_number_id);
      const contactNames = new Map(
        (value.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name ?? null]),
      );

      for (const message of value.messages ?? []) {
        const payload: NormalizedWhatsAppEvent = {
          kind: "message",
          wabaId: entry.id,
          phoneNumberId: value.metadata.phone_number_id,
          displayPhoneNumber: value.metadata.display_phone_number ?? null,
          providerMessageId: message.id,
          from: message.from,
          contactName: contactNames.get(message.from) ?? null,
          timestamp: message.timestamp ?? null,
          messageType: message.type,
          textBody: message.text?.body ?? message.image?.caption ?? message.video?.caption ?? message.document?.caption ?? null,
          content: contentFor(message),
          media: mediaFor(message),
          replyToProviderMessageId: message.context?.id ?? null,
          referral: message.referral ? {
            clickId: message.referral.ctwa_clid ?? null,
            sourceId: message.referral.source_id ?? null,
            sourceUrl: message.referral.source_url ?? null,
          } : null,
        };
        events.push({
          providerEventKey: `message:${message.id}`,
          providerMessageId: message.id,
          eventType: "MESSAGE",
          payload,
        });
      }

      for (const status of value.statuses ?? []) {
        const firstError = status.errors?.[0];
        const payload: NormalizedWhatsAppEvent = {
          kind: "status",
          wabaId: entry.id,
          phoneNumberId: value.metadata.phone_number_id,
          providerMessageId: status.id,
          status: status.status,
          timestamp: status.timestamp ?? null,
          recipientId: status.recipient_id ?? null,
          error: firstError ? {
            code: firstError.code?.toString() ?? null,
            title: firstError.title ?? null,
            message: firstError.message ?? null,
          } : null,
        };
        events.push({
          providerEventKey: `status:${status.id}:${status.status}:${status.timestamp ?? digest(payload)}`,
          providerMessageId: status.id,
          eventType: "MESSAGE_STATUS",
          payload,
        });
      }

      if (!(value.messages?.length || value.statuses?.length)) {
        const payload: NormalizedWhatsAppEvent = {
          kind: "unknown",
          wabaId: entry.id,
          phoneNumberId: value.metadata.phone_number_id,
          field: change.field,
        };
        events.push({
          providerEventKey: `unknown:${digest(payload)}`,
          providerMessageId: null,
          eventType: "UNKNOWN",
          payload,
        });
      }
    }
  }

  return { phoneNumberIds, events };
}
