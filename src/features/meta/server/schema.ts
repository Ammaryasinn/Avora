import { z } from "zod";

import {
  MetaCallToAction,
  MetaOptimizationGoal,
} from "@/generated/prisma/enums";

const optionalId = z.string().trim().max(100).transform((value) => value || null);
const safeUrl = z
  .url("Enter a valid HTTPS destination URL.")
  .refine((value) => new URL(value).protocol === "https:", "Destination URLs must use HTTPS.")
  .refine((value) => {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1";
  }, "Destination URLs must be publicly reachable.");

export const metaAssetSelectionSchema = z.object({
  connectionId: z.string().min(1).max(100),
  businessId: optionalId,
  adAccountId: z.string().min(1).max(100),
  pageId: z.string().min(1).max(100),
  instagramAccountId: optionalId,
  datasetId: optionalId,
});

const specialAdCategories = new Set([
  "HOUSING",
  "EMPLOYMENT",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
]);

export const metaCampaignConfigurationSchema = z.object({
  connectionId: z.string().min(1).max(100),
  adAccountId: z.string().min(1).max(100),
  pageId: z.string().min(1).max(100),
  instagramAccountId: optionalId,
  datasetId: optionalId,
  optimizationGoal: z.enum([
    MetaOptimizationGoal.REACH,
    MetaOptimizationGoal.IMPRESSIONS,
    MetaOptimizationGoal.LINK_CLICKS,
    MetaOptimizationGoal.LANDING_PAGE_VIEWS,
    MetaOptimizationGoal.OFFSITE_CONVERSIONS,
  ]),
  callToAction: z.enum([
    MetaCallToAction.SHOP_NOW,
    MetaCallToAction.LEARN_MORE,
    MetaCallToAction.SIGN_UP,
    MetaCallToAction.CONTACT_US,
  ]),
  specialAdCategories: z.array(z.string()).refine(
    (values) => values.every((value) => specialAdCategories.has(value)),
    "One or more special ad categories are unsupported.",
  ),
  beneficiaryName: z.string().trim().max(255).transform((value) => value || null),
  payorName: z.string().trim().max(255).transform((value) => value || null),
  ads: z.array(
    z.object({
      campaignCreativeId: z.string().min(1).max(100),
      campaignProductId: optionalId,
      destinationUrl: safeUrl,
      primaryText: z.string().trim().min(1).max(2200),
      headline: z.string().trim().max(255).transform((value) => value || null),
      description: z.string().trim().max(255).transform((value) => value || null),
    }),
  ).min(1, "Configure at least one ad."),
});

export const targetingSearchSchema = z.object({
  type: z.enum(["REGION", "CITY", "INTEREST"]),
  query: z.string().trim().min(2).max(100),
});

export function parseMetaAssetSelection(formData: FormData) {
  return metaAssetSelectionSchema.safeParse({
    connectionId: formData.get("connectionId"),
    businessId: formData.get("businessId") ?? "",
    adAccountId: formData.get("adAccountId"),
    pageId: formData.get("pageId"),
    instagramAccountId: formData.get("instagramAccountId") ?? "",
    datasetId: formData.get("datasetId") ?? "",
  });
}

export function parseMetaCampaignConfiguration(formData: FormData) {
  const creativeIds = formData.getAll("campaignCreativeId").map(String);
  return metaCampaignConfigurationSchema.safeParse({
    connectionId: formData.get("connectionId"),
    adAccountId: formData.get("adAccountId"),
    pageId: formData.get("pageId"),
    instagramAccountId: formData.get("instagramAccountId") ?? "",
    datasetId: formData.get("datasetId") ?? "",
    optimizationGoal: formData.get("optimizationGoal"),
    callToAction: formData.get("callToAction"),
    specialAdCategories: formData.getAll("specialAdCategories").map(String),
    beneficiaryName: formData.get("beneficiaryName") ?? "",
    payorName: formData.get("payorName") ?? "",
    ads: creativeIds.map((campaignCreativeId) => ({
      campaignCreativeId,
      campaignProductId: formData.get(`product:${campaignCreativeId}`) ?? "",
      destinationUrl: formData.get(`url:${campaignCreativeId}`),
      primaryText: formData.get(`text:${campaignCreativeId}`),
      headline: formData.get(`headline:${campaignCreativeId}`) ?? "",
      description: formData.get(`description:${campaignCreativeId}`) ?? "",
    })),
  });
}
