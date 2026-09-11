"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import {
  AICapability,
  AIJobStatus,
  CreativeStatus,
  CreativeType,
  CreativeVariantOrigin,
  CreativeVariantStatus,
  OrganizationRole,
} from "@/generated/prisma/enums";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { AIUsageLimitError } from "@/lib/ai/errors";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";
import { getBlobStore } from "@/lib/storage/r2-object-storage";

import { createAIJob } from "./jobs";
import {
  copyVariantSchema,
  createCreativeSchema,
  generateCreativeSchema,
  imageEditSchema,
} from "./schema";

const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

function errorState(error: unknown): ActionState {
  return {
    status: "error",
    message:
      error instanceof AIUsageLimitError
        ? error.message
        : "The Creative Studio request could not be completed. Please try again.",
  };
}

function briefRecord(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function creativePrompt(input: {
  type: CreativeType;
  product: { name: string; description: string | null; category: string | null; price: Prisma.Decimal };
  currency: string;
  brief: Prisma.JsonValue;
}) {
  const brief = briefRecord(input.brief);
  const typeLabel = input.type.replaceAll("_", " ").toLowerCase();

  return [
    `Create a premium ${typeLabel} for the business product below.`,
    `Product: ${input.product.name}`,
    input.product.description ? `Product description: ${input.product.description}` : null,
    input.product.category ? `Category: ${input.product.category}` : null,
    `Price: ${input.currency} ${input.product.price.toFixed(2)}`,
    `Objective: ${String(brief.objective ?? "Present the product clearly")}`,
    `Audience: ${String(brief.audience ?? "Prospective customers")}`,
    `Tone: ${String(brief.tone ?? "Clear and premium")}`,
    "Do not invent product claims, discounts, testimonials, performance metrics, or availability.",
  ].filter(Boolean).join("\n");
}

export async function createCreativeAction(
  organizationSlug: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = createCreativeSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the creative brief.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const user = await ensureCurrentUser();
  const product = await getDatabase().product.findFirst({
    where: {
      id: parsed.data.productId,
      organizationId: tenant.organizationId,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!product) {
    return { status: "error", message: "Select an available product." };
  }

  const creative = await getDatabase().creative.create({
    data: {
      organizationId: tenant.organizationId,
      productId: product.id,
      title: parsed.data.title,
      type: parsed.data.type,
      brief: {
        objective: parsed.data.objective,
        audience: parsed.data.audience,
        tone: parsed.data.tone,
      },
      createdById: user.id,
    },
  });

  redirect(`/dashboard/${organizationSlug}/creative-studio/${creative.id}/configure`);
}

export async function generateCreativeAction(
  organizationSlug: string,
  creativeId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = generateCreativeSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", message: "Select the required generation inputs." };
  }

  const user = await ensureCurrentUser();
  const creative = await getDatabase().creative.findFirst({
    where: { id: creativeId, organizationId: tenant.organizationId, archivedAt: null },
    include: { product: true },
  });

  if (!creative?.product) {
    return { status: "error", message: "Creative or product not found." };
  }

  const requiresImage = creative.type !== CreativeType.AD_COPY_ONLY;

  if (requiresImage && !parsed.data.productMediaId) {
    return { status: "error", message: "Upload and select a product image first." };
  }

  if (parsed.data.productMediaId) {
    const media = await getDatabase().productMedia.findFirst({
      where: {
        id: parsed.data.productMediaId,
        productId: creative.product.id,
        organizationId: tenant.organizationId,
        uploadStatus: "READY",
      },
      select: { id: true },
    });

    if (!media) return { status: "error", message: "The selected product image is unavailable." };
  }

  if (creative.type === CreativeType.VIRTUAL_TRY_ON) {
    const person = parsed.data.personAssetId
      ? await getDatabase().creativeAsset.findFirst({
          where: {
            id: parsed.data.personAssetId,
            creativeId: creative.id,
            organizationId: tenant.organizationId,
            role: "PERSON_REFERENCE",
            status: "READY",
            deletedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        })
      : null;

    if (!person) return { status: "error", message: "Upload a consented person reference first." };
  }

  const prompt = creativePrompt({
    type: creative.type,
    product: creative.product,
    currency: tenant.organization.businessProfile?.currencyCode ?? "USD",
    brief: creative.brief,
  });
  const baseInput = {
    prompt,
    aspectRatio:
      creative.type === CreativeType.STORY_STATUS ? "9:16" as const
      : creative.type === CreativeType.INSTAGRAM_POST ? "4:5" as const
      : "1:1" as const,
    productMediaId: parsed.data.productMediaId,
    personAssetId: parsed.data.personAssetId,
    virtualTryOnCategory: parsed.data.virtualTryOnCategory,
  };

  try {
    const capabilities: AICapability[] = [AICapability.GENERATE_TEXT];

    if (creative.type === CreativeType.VIRTUAL_TRY_ON) {
      capabilities.push(AICapability.GENERATE_VIRTUAL_TRY_ON);
    } else if (requiresImage) {
      capabilities.push(
        creative.type === CreativeType.LIFESTYLE_IMAGE && parsed.data.generationMode === "CONCEPT_IMAGE"
          ? AICapability.GENERATE_IMAGE
          : AICapability.EDIT_IMAGE,
      );
    }

    for (const capability of capabilities) {
      await createAIJob({
        organizationId: tenant.organizationId,
        creativeId: creative.id,
        createdById: user.id,
        capability,
        idempotencyKey: `${creative.id}:${parsed.data.requestNonce}:${capability}`,
        promptTemplateKey: `creative-${creative.type.toLowerCase()}`,
        jobInput: baseInput,
        requestedVariantCount: capability === AICapability.GENERATE_TEXT ? 2 : 1,
      });
    }
  } catch (error) {
    return errorState(error);
  }

  revalidatePath(`/dashboard/${organizationSlug}/creative-studio`);
  redirect(`/dashboard/${organizationSlug}/creative-studio/${creative.id}`);
}

export async function retryAIJobAction(organizationSlug: string, jobId: string) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const job = await getDatabase().aIJob.findFirst({
    where: { id: jobId, organizationId: tenant.organizationId, status: AIJobStatus.FAILED },
  });

  if (!job) return;

  await createAIJob({
    organizationId: tenant.organizationId,
    creativeId: job.creativeId,
    createdById: user.id,
    capability: job.capability,
    idempotencyKey: `${job.id}:manual-retry`,
    promptTemplateKey: job.promptTemplateKey,
    promptTemplateVersion: job.promptTemplateVersion,
    jobInput: job.input as Prisma.InputJsonValue,
    requestedVariantCount: job.requestedVariantCount,
  });
  revalidatePath(`/dashboard/${organizationSlug}/creative-studio/${job.creativeId}`);
}

export async function updateCopyVariantAction(
  organizationSlug: string,
  creativeId: string,
  variantId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = copyVariantSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { status: "error", message: "Review the copy fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const user = await ensureCurrentUser();
  const source = await getDatabase().creativeVariant.findFirst({
    where: { id: variantId, creativeId, organizationId: tenant.organizationId },
    select: { id: true, position: true },
  });

  if (!source) return { status: "error", message: "Creative variant not found." };

  const edited = await getDatabase().creativeVariant.create({
    data: {
      organizationId: tenant.organizationId,
      creativeId,
      parentVariantId: source.id,
      createdById: user.id,
      name: "Edited copy",
      origin: CreativeVariantOrigin.USER_EDITED,
      status: CreativeVariantStatus.READY,
      position: source.position,
      content: parsed.data,
    },
  });
  await getDatabase().creative.updateMany({
    where: { id: creativeId, organizationId: tenant.organizationId },
    data: { selectedVariantId: edited.id, status: CreativeStatus.IN_REVIEW },
  });
  redirect(`/dashboard/${organizationSlug}/creative-studio/${creativeId}`);
}

export async function requestImageEditAction(
  organizationSlug: string,
  creativeId: string,
  variantId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = imageEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Describe the image edit." };
  const user = await ensureCurrentUser();
  const source = await getDatabase().creativeAsset.findFirst({
    where: { organizationId: tenant.organizationId, creativeId, variantId, status: "READY", deletedAt: null },
    select: { id: true },
  });
  if (!source) return { status: "error", message: "A source image was not found." };

  try {
    await createAIJob({
      organizationId: tenant.organizationId,
      creativeId,
      createdById: user.id,
      capability: AICapability.EDIT_IMAGE,
      idempotencyKey: `${creativeId}:${parsed.data.requestNonce}:EDIT_IMAGE`,
      promptTemplateKey: "creative-image-edit",
      jobInput: { prompt: parsed.data.prompt, aspectRatio: "1:1", sourceAssetId: source.id },
      requestedVariantCount: 1,
    });
  } catch (error) {
    return errorState(error);
  }
  redirect(`/dashboard/${organizationSlug}/creative-studio/${creativeId}`);
}

export async function selectCreativeVariantAction(organizationSlug: string, creativeId: string, variantId: string) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const variant = await getDatabase().creativeVariant.findFirst({
    where: { id: variantId, creativeId, organizationId: tenant.organizationId, status: "READY" },
    select: { id: true },
  });
  if (!variant) return;
  await getDatabase().creative.updateMany({
    where: { id: creativeId, organizationId: tenant.organizationId },
    data: { selectedVariantId: variant.id },
  });
  revalidatePath(`/dashboard/${organizationSlug}/creative-studio/${creativeId}`);
}

export async function approveCreativeVariantAction(organizationSlug: string, creativeId: string, variantId: string) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const variant = await getDatabase().creativeVariant.findFirst({
    where: { id: variantId, creativeId, organizationId: tenant.organizationId, status: "READY" },
    select: { id: true },
  });
  if (!variant) return;

  await getDatabase().$transaction(async (transaction) => {
    await transaction.creativeApproval.updateMany({
      where: { organizationId: tenant.organizationId, creativeId, supersededAt: null },
      data: { supersededAt: new Date() },
    });
    await transaction.creativeApproval.create({
      data: {
        organizationId: tenant.organizationId,
        creativeId,
        variantId: variant.id,
        approvedById: user.id,
      },
    });
    await transaction.creative.updateMany({
      where: { id: creativeId, organizationId: tenant.organizationId },
      data: { selectedVariantId: variant.id, status: CreativeStatus.APPROVED },
    });
  });
  revalidatePath(`/dashboard/${organizationSlug}/creative-studio/${creativeId}`);
  revalidatePath(`/dashboard/${organizationSlug}/creative-studio/library`);
}

export async function deletePersonReferenceAction(
  organizationSlug: string,
  creativeId: string,
  assetId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const asset = await getDatabase().creativeAsset.findFirst({
    where: {
      id: assetId,
      creativeId,
      organizationId: tenant.organizationId,
      role: "PERSON_REFERENCE",
      deletedAt: null,
    },
    select: { id: true, storageKey: true },
  });

  if (!asset) return;
  await getBlobStore().deleteObject(asset.storageKey).catch(() => undefined);
  await getDatabase().creativeAsset.updateMany({
    where: { id: asset.id, organizationId: tenant.organizationId, deletedAt: null },
    data: { status: "DELETED", deletedAt: new Date() },
  });
  revalidatePath(`/dashboard/${organizationSlug}/creative-studio/${creativeId}/configure`);
}
