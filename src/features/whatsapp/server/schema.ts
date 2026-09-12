import { z } from "zod";

import {
  FollowUpConsentStatus,
  LeadQualificationStage,
  LeadStatus,
} from "@/generated/prisma/enums";

const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || undefined);

export const whatsappConnectionSchema = z.object({
  wabaId: z.string().trim().regex(/^\d+$/, "Enter a valid WhatsApp Business Account ID."),
  phoneNumberId: z.string().trim().regex(/^\d+$/, "Enter a valid phone number ID."),
  accessToken: z.string().trim().min(20, "Enter a valid access token."),
});

export const assignmentSchema = z.object({
  assignedOrganizationMemberId: z.string().trim().min(1),
  reason: optionalText(500),
});

export const qualificationSchema = z.object({
  leadStatus: z.enum(LeadStatus),
  stage: z.enum(LeadQualificationStage),
  need: optionalText(500),
  budget: optionalText(200),
  timeline: optionalText(200),
  decisionMaker: optionalText(200),
  score: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.coerce.number().int().min(0).max(100).optional(),
  ),
  notes: optionalText(2_000),
});

export const consentSchema = z.object({
  consentStatus: z.enum(FollowUpConsentStatus),
  consentSource: optionalText(300),
}).superRefine((value, context) => {
  if (value.consentStatus === FollowUpConsentStatus.OPTED_IN && !value.consentSource) {
    context.addIssue({
      code: "custom",
      path: ["consentSource"],
      message: "Record how consent was obtained.",
    });
  }
});

export const manualDraftSchema = z.object({
  body: z.string().trim().min(1, "Write a reply first.").max(4_000),
});

export function parseForm<T extends z.ZodType>(schema: T, formData: FormData) {
  return schema.safeParse(Object.fromEntries(formData.entries()));
}
