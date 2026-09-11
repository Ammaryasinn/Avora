import { z } from "zod";

export const creativeTypes = [
  "PRODUCT_AD",
  "LIFESTYLE_IMAGE",
  "VIRTUAL_TRY_ON",
  "INSTAGRAM_POST",
  "STORY_STATUS",
  "AD_COPY_ONLY",
] as const;

export const createCreativeSchema = z.object({
  title: z.string().trim().min(2, "Add a title.").max(120),
  productId: z.string().trim().min(1, "Select a product."),
  type: z.enum(creativeTypes),
  objective: z.string().trim().min(5, "Describe the objective.").max(500),
  audience: z.string().trim().min(2, "Describe the audience.").max(300),
  tone: z.string().trim().min(2, "Describe the tone.").max(120),
});

export const generateCreativeSchema = z.object({
  requestNonce: z.uuid(),
  productMediaId: z.string().trim().min(1).optional(),
  personAssetId: z.string().trim().min(1).optional(),
  generationMode: z.enum(["REFERENCE_EDIT", "CONCEPT_IMAGE"]).default("REFERENCE_EDIT"),
  virtualTryOnCategory: z.enum(["tops", "bottoms", "one-pieces"]).default("tops"),
});

export const copyVariantSchema = z.object({
  headline: z.string().trim().min(1).max(120),
  primaryText: z.string().trim().min(1).max(2_200),
  callToAction: z.string().trim().min(1).max(80),
  caption: z.string().trim().min(1).max(2_200),
});

export const imageEditSchema = z.object({
  requestNonce: z.uuid(),
  prompt: z.string().trim().min(5).max(2_000),
});
