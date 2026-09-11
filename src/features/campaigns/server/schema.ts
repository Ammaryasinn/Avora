import { z } from "zod";

import {
  CampaignAudienceGender,
  CampaignBudgetType,
  CampaignObjective,
} from "@/generated/prisma/enums";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum, `Must be ${maximum} characters or fewer.`)
    .transform((value) => value || undefined);

const optionalMoney = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
    "Use a non-negative amount with no more than two decimal places.",
  )
  .transform((value) => value || undefined);

const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Use a valid date.",
  )
  .transform((value) => value || undefined);

const optionalAge = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().int().min(13).max(100).optional(),
);

const identifierListSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(100)
  .transform((values) => [...new Set(values)]);

export const campaignIdentitySchema = z.object({
  name: z
    .string()
    .trim()
    .max(160, "Campaign names must be 160 characters or fewer.")
    .transform((value) => value || "Untitled campaign"),
  objective: z
    .enum([
      CampaignObjective.SALES,
      CampaignObjective.LEADS,
      CampaignObjective.TRAFFIC,
      CampaignObjective.AWARENESS,
    ])
    .optional(),
  notes: optionalText(2_000),
});

export const campaignAudienceSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine(
        (value) => value === "" || /^[A-Z]{2}$/.test(value),
        "Use a two-letter country code.",
      )
      .transform((value) => value || undefined),
    regions: optionalText(1_000),
    cities: optionalText(1_000),
    minimumAge: optionalAge,
    maximumAge: optionalAge,
    gender: z
      .enum([
        CampaignAudienceGender.ALL,
        CampaignAudienceGender.WOMEN,
        CampaignAudienceGender.MEN,
      ])
      .optional(),
    interests: optionalText(2_000),
    notes: optionalText(2_000),
    customAudienceDescription: optionalText(3_000),
  })
  .superRefine((value, context) => {
    if (
      value.minimumAge !== undefined &&
      value.maximumAge !== undefined &&
      value.minimumAge > value.maximumAge
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumAge"],
        message: "Maximum age must be greater than or equal to minimum age.",
      });
    }
  });

export const campaignBudgetSchema = z
  .object({
    type: z
      .enum([CampaignBudgetType.DAILY, CampaignBudgetType.LIFETIME])
      .optional(),
    dailyBudget: optionalMoney,
    lifetimeBudget: optionalMoney,
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .superRefine((value, context) => {
    if (
      value.startDate &&
      value.endDate &&
      value.startDate > value.endDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after the start date.",
      });
    }
  });

export function parseCampaignIdentityFormData(formData: FormData) {
  const objective = String(formData.get("objective") ?? "");

  return campaignIdentitySchema.safeParse({
    name: formData.get("name"),
    objective: objective || undefined,
    notes: formData.get("notes"),
  });
}

export function parseCampaignProductFormData(formData: FormData) {
  return identifierListSchema.safeParse(formData.getAll("productIds"));
}

export function parseCampaignCreativeFormData(formData: FormData) {
  return identifierListSchema.safeParse(formData.getAll("creativeIds"));
}

export function parseCampaignAudienceFormData(formData: FormData) {
  const gender = String(formData.get("gender") ?? "");

  return campaignAudienceSchema.safeParse({
    countryCode: formData.get("countryCode"),
    regions: formData.get("regions"),
    cities: formData.get("cities"),
    minimumAge: formData.get("minimumAge"),
    maximumAge: formData.get("maximumAge"),
    gender: gender || undefined,
    interests: formData.get("interests"),
    notes: formData.get("notes"),
    customAudienceDescription: formData.get("customAudienceDescription"),
  });
}

export function parseCampaignBudgetFormData(formData: FormData) {
  const type = String(formData.get("type") ?? "");

  return campaignBudgetSchema.safeParse({
    type: type || undefined,
    dailyBudget: formData.get("dailyBudget"),
    lifetimeBudget: formData.get("lifetimeBudget"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
}

export function splitList(value?: string) {
  if (!value) return [];

  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 50);
}

export type CampaignReadinessInput = {
  name: string;
  objective: CampaignObjective | null;
  productCount: number;
  creativeCount: number;
  audience: {
    countryCode: string | null;
    minimumAge: number | null;
    maximumAge: number | null;
  } | null;
  budget: {
    type: CampaignBudgetType | null;
    dailyBudget: { greaterThan(value: number): boolean } | null;
    lifetimeBudget: { greaterThan(value: number): boolean } | null;
    startDate: Date | null;
    endDate: Date | null;
  } | null;
};

export function getCampaignReadinessIssues(input: CampaignReadinessInput) {
  const issues: string[] = [];

  if (!input.name.trim()) issues.push("Add a campaign name.");
  if (!input.objective) issues.push("Choose a campaign objective.");
  if (input.productCount === 0) issues.push("Select at least one active product.");
  if (input.creativeCount === 0) {
    issues.push("Select an approved creative or upload a manual asset.");
  }
  if (!input.audience?.countryCode) issues.push("Add an audience country.");
  if (
    input.audience?.minimumAge !== null &&
    input.audience?.minimumAge !== undefined &&
    input.audience?.maximumAge !== null &&
    input.audience?.maximumAge !== undefined &&
    input.audience.minimumAge > input.audience.maximumAge
  ) {
    issues.push("Correct the audience age range.");
  }
  if (!input.budget?.type) issues.push("Choose a budget type.");
  if (
    input.budget?.type === CampaignBudgetType.DAILY &&
    !input.budget.dailyBudget?.greaterThan(0)
  ) {
    issues.push("Add a daily budget greater than zero.");
  }
  if (
    input.budget?.type === CampaignBudgetType.LIFETIME &&
    !input.budget.lifetimeBudget?.greaterThan(0)
  ) {
    issues.push("Add a lifetime budget greater than zero.");
  }
  if (!input.budget?.startDate || !input.budget.endDate) {
    issues.push("Add campaign start and end dates.");
  } else if (input.budget.startDate > input.budget.endDate) {
    issues.push("Correct the campaign schedule.");
  }

  return issues;
}
