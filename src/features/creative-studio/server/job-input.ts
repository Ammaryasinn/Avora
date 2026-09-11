import { z } from "zod";

export const creativeJobInputSchema = z.object({
  prompt: z.string().trim().min(1).max(12_000),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).default("1:1"),
  productMediaId: z.string().trim().min(1).optional(),
  personAssetId: z.string().trim().min(1).optional(),
  sourceAssetId: z.string().trim().min(1).optional(),
  virtualTryOnCategory: z.enum(["tops", "bottoms", "one-pieces"]).optional(),
});

export type CreativeJobInput = z.infer<typeof creativeJobInputSchema>;
