import { z } from "zod";

export const whatsappAIReplyJobInputSchema = z.object({
  conversationId: z.string().trim().min(1).max(64),
  sourceMessageId: z.string().trim().min(1).max(64),
  contextVersion: z.literal(1),
});

export type WhatsAppAIReplyJobInput = z.infer<typeof whatsappAIReplyJobInputSchema>;
