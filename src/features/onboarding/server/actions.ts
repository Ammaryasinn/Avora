"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import { OrganizationRole } from "@/generated/prisma/enums";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";

import { onboardingSchema } from "./schema";

function createSlug(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);

  return slug || "organization";
}

async function getAvailableSlug(name: string) {
  const database = getDatabase();
  const baseSlug = createSlug(name);
  const existing = await database.organization.findUnique({
    where: { slug: baseSlug },
    select: { id: true },
  });

  return existing ? `${baseSlug}-${randomUUID().slice(0, 6)}` : baseSlug;
}

export async function createOrganizationAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = onboardingSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the highlighted onboarding fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const user = await ensureCurrentUser();
  const database = getDatabase();
  const existingMembership = await database.organizationMember.findFirst({
    where: { userId: user.id },
    select: { organization: { select: { slug: true } } },
  });

  if (existingMembership) {
    redirect(`/dashboard/${existingMembership.organization.slug}`);
  }

  let organizationSlug: string;

  try {
    organizationSlug = await getAvailableSlug(parsed.data.organizationName);
    await database.organization.create({
      data: {
        name: parsed.data.organizationName,
        slug: organizationSlug,
        createdById: user.id,
        members: {
          create: {
            userId: user.id,
            role: OrganizationRole.OWNER,
          },
        },
        businessProfile: {
          create: {
            displayName: parsed.data.businessName,
            industry: parsed.data.industry,
            countryCode: parsed.data.countryCode,
            currencyCode: parsed.data.currencyCode,
          },
        },
      },
    });
  } catch {
    return {
      status: "error",
      message: "We could not create the business. Please try again.",
    };
  }

  redirect(`/dashboard/${organizationSlug}`);
}
