import { z } from "zod";

export const onboardingSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters.")
    .max(80, "Organization name must be 80 characters or fewer."),
  businessName: z
    .string()
    .trim()
    .min(2, "Business name must be at least 2 characters.")
    .max(120, "Business name must be 120 characters or fewer."),
  industry: z
    .string()
    .trim()
    .max(120, "Industry must be 120 characters or fewer.")
    .transform((value) => value || undefined),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter ISO country code."),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter ISO currency code."),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
