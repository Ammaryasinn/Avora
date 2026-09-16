import { z } from "zod";

export const aiDraftMetadataSchema = z.object({
  kind: z.literal("AI_SALES_REPLY"),
  schemaVersion: z.literal(1),
  productNames: z.array(z.string().min(1).max(200)).max(4),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  handoffSuggested: z.boolean(),
  qualificationSuggestions: z.object({
    need: z.string().max(500).nullable(),
    budget: z.string().max(200).nullable(),
    timeline: z.string().max(200).nullable(),
    decisionMaker: z.string().max(200).nullable(),
  }),
});

export function parseAIDraftMetadata(value: unknown) {
  const parsed = aiDraftMetadataSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
