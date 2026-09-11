"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import {
  CampaignCreativeSource,
  CampaignStatus,
  OrganizationRole,
  ProductStatus,
} from "@/generated/prisma/enums";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";
import { getBlobStore } from "@/lib/storage/r2-object-storage";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

import {
  getCampaignReadinessIssues,
  parseCampaignAudienceFormData,
  parseCampaignBudgetFormData,
  parseCampaignCreativeFormData,
  parseCampaignIdentityFormData,
  parseCampaignProductFormData,
  splitList,
} from "./schema";

const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

function campaignPath(organizationSlug: string, campaignId?: string) {
  const base = `/dashboard/${organizationSlug}/campaigns`;
  return campaignId ? `${base}/${campaignId}` : base;
}

function revalidateCampaigns(organizationSlug: string, campaignId?: string) {
  revalidatePath(`/dashboard/${organizationSlug}`);
  revalidatePath(campaignPath(organizationSlug));
  if (campaignId) revalidatePath(campaignPath(organizationSlug, campaignId));
}

function nextStepRedirect(
  organizationSlug: string,
  campaignId: string,
  currentStep: string,
  nextStep: string,
  formData: FormData,
): never {
  const step = formData.get("intent") === "continue" ? nextStep : currentStep;
  redirect(`${campaignPath(organizationSlug, campaignId)}?step=${step}`);
}

async function requireWritableCampaign(
  organizationId: string,
  campaignId: string,
) {
  return getDatabase().campaign.findFirst({
    where: {
      id: campaignId,
      organizationId,
      status: { not: CampaignStatus.ARCHIVED },
    },
    select: { id: true },
  });
}

function invalidCampaignState(message: string): ActionState {
  return { status: "error", message };
}

async function getCampaignReadinessRecord(
  organizationId: string,
  campaignId: string,
  status?: CampaignStatus,
) {
  return getDatabase().campaign.findFirst({
    where: {
      id: campaignId,
      organizationId,
      status: status ?? { not: CampaignStatus.ARCHIVED },
    },
    include: {
      products: {
        where: {
          product: { archivedAt: null, status: { not: ProductStatus.ARCHIVED } },
        },
        select: { id: true },
      },
      creatives: {
        where: {
          uploadStatus: "READY",
          OR: [
            { source: CampaignCreativeSource.MANUAL_UPLOAD },
            {
              source: CampaignCreativeSource.APPROVED_CREATIVE,
              creative: { status: "APPROVED", archivedAt: null },
            },
          ],
        },
        select: { id: true },
      },
      audience: true,
      budget: true,
    },
  });
}

function readinessIssues(
  campaign: NonNullable<Awaited<ReturnType<typeof getCampaignReadinessRecord>>>,
) {
  return getCampaignReadinessIssues({
    name: campaign.name,
    objective: campaign.objective,
    productCount: campaign.products.length,
    creativeCount: campaign.creatives.length,
    audience: campaign.audience,
    budget: campaign.budget,
  });
}

export async function createCampaignAction(
  organizationSlug: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseCampaignIdentityFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the campaign details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const user = await ensureCurrentUser();
  const campaign = await getDatabase().campaign.create({
    data: {
      organizationId: tenant.organizationId,
      createdById: user.id,
      name: parsed.data.name,
      objective: parsed.data.objective,
      notes: parsed.data.notes,
    },
    select: { id: true },
  });

  revalidateCampaigns(organizationSlug, campaign.id);
  redirect(`${campaignPath(organizationSlug, campaign.id)}?step=products`);
}

export async function updateCampaignObjectiveAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseCampaignIdentityFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the campaign details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const updated = await getDatabase().campaign.updateMany({
    where: {
      id: campaignId,
      organizationId: tenant.organizationId,
      status: { not: CampaignStatus.ARCHIVED },
    },
    data: {
      name: parsed.data.name,
      objective: parsed.data.objective ?? null,
      notes: parsed.data.notes ?? null,
      status: CampaignStatus.DRAFT,
    },
  });

  if (updated.count !== 1) return invalidCampaignState("Campaign not found.");
  revalidateCampaigns(organizationSlug, campaignId);
  nextStepRedirect(organizationSlug, campaignId, "objective", "products", formData);
}

export async function updateCampaignProductsAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseCampaignProductFormData(formData);

  if (!parsed.success) {
    return invalidCampaignState("The selected products are invalid.");
  }

  const campaign = await requireWritableCampaign(tenant.organizationId, campaignId);
  if (!campaign) return invalidCampaignState("Campaign not found.");

  const products = await getDatabase().product.findMany({
    where: {
      id: { in: parsed.data },
      organizationId: tenant.organizationId,
      archivedAt: null,
      status: { not: ProductStatus.ARCHIVED },
    },
    select: { id: true },
  });

  if (products.length !== parsed.data.length) {
    return invalidCampaignState("One or more selected products are unavailable.");
  }

  await getDatabase().$transaction(async (transaction) => {
    await transaction.campaignProduct.deleteMany({
      where: { organizationId: tenant.organizationId, campaignId: campaign.id },
    });
    if (products.length) {
      await transaction.campaignProduct.createMany({
        data: products.map((product, position) => ({
          organizationId: tenant.organizationId,
          campaignId: campaign.id,
          productId: product.id,
          position,
        })),
      });
    }
    await transaction.campaign.updateMany({
      where: { id: campaign.id, organizationId: tenant.organizationId },
      data: { status: CampaignStatus.DRAFT },
    });
  });

  revalidateCampaigns(organizationSlug, campaignId);
  nextStepRedirect(organizationSlug, campaignId, "products", "audience", formData);
}

export async function updateCampaignAudienceAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseCampaignAudienceFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the audience details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const campaign = await requireWritableCampaign(tenant.organizationId, campaignId);
  if (!campaign) return invalidCampaignState("Campaign not found.");

  const audienceData = {
    organizationId: tenant.organizationId,
    countryCode: parsed.data.countryCode ?? null,
    regions: splitList(parsed.data.regions),
    cities: splitList(parsed.data.cities),
    minimumAge: parsed.data.minimumAge ?? null,
    maximumAge: parsed.data.maximumAge ?? null,
    gender: parsed.data.gender ?? null,
    interests: splitList(parsed.data.interests),
    notes: parsed.data.notes ?? null,
    customAudienceDescription:
      parsed.data.customAudienceDescription ?? null,
  };

  await getDatabase().$transaction([
    getDatabase().campaignAudience.upsert({
      where: { campaignId: campaign.id },
      create: { campaignId: campaign.id, ...audienceData },
      update: audienceData,
    }),
    getDatabase().campaign.updateMany({
      where: { id: campaign.id, organizationId: tenant.organizationId },
      data: { status: CampaignStatus.DRAFT },
    }),
  ]);

  revalidateCampaigns(organizationSlug, campaignId);
  nextStepRedirect(organizationSlug, campaignId, "audience", "creatives", formData);
}

export async function updateCampaignCreativesAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseCampaignCreativeFormData(formData);

  if (!parsed.success) {
    return invalidCampaignState("The selected creatives are invalid.");
  }

  const campaign = await requireWritableCampaign(tenant.organizationId, campaignId);
  if (!campaign) return invalidCampaignState("Campaign not found.");

  const creatives = await getDatabase().creative.findMany({
    where: {
      id: { in: parsed.data },
      organizationId: tenant.organizationId,
      status: "APPROVED",
      archivedAt: null,
      selectedVariantId: { not: null },
    },
    select: {
      id: true,
      selectedVariantId: true,
      selectedVariant: {
        select: {
          assets: {
            where: { status: "READY", deletedAt: null },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });

  if (creatives.length !== parsed.data.length) {
    return invalidCampaignState("One or more selected creatives are no longer approved.");
  }

  const byId = new Map(creatives.map((creative) => [creative.id, creative]));

  await getDatabase().$transaction(async (transaction) => {
    await transaction.campaignCreative.deleteMany({
      where: {
        organizationId: tenant.organizationId,
        campaignId: campaign.id,
        source: CampaignCreativeSource.APPROVED_CREATIVE,
      },
    });
    if (parsed.data.length) {
      await transaction.campaignCreative.createMany({
        data: parsed.data.map((creativeId, position) => {
          const creative = byId.get(creativeId);
          if (!creative?.selectedVariantId) {
            throw new Error("Approved creative variant not found.");
          }
          return {
            organizationId: tenant.organizationId,
            campaignId: campaign.id,
            source: CampaignCreativeSource.APPROVED_CREATIVE,
            creativeId: creative.id,
            variantId: creative.selectedVariantId,
            creativeAssetId: creative.selectedVariant?.assets[0]?.id,
            position,
          };
        }),
      });
    }
    await transaction.campaign.updateMany({
      where: { id: campaign.id, organizationId: tenant.organizationId },
      data: { status: CampaignStatus.DRAFT },
    });
  });

  revalidateCampaigns(organizationSlug, campaignId);
  nextStepRedirect(organizationSlug, campaignId, "creatives", "budget", formData);
}

export async function updateCampaignBudgetAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseCampaignBudgetFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the budget and schedule.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const campaign = await requireWritableCampaign(tenant.organizationId, campaignId);
  if (!campaign) return invalidCampaignState("Campaign not found.");

  const budgetData = {
    organizationId: tenant.organizationId,
    type: parsed.data.type ?? null,
    dailyBudget:
      parsed.data.type === "DAILY" && parsed.data.dailyBudget
        ? new Prisma.Decimal(parsed.data.dailyBudget)
        : null,
    lifetimeBudget:
      parsed.data.type === "LIFETIME" && parsed.data.lifetimeBudget
        ? new Prisma.Decimal(parsed.data.lifetimeBudget)
        : null,
    currencyCode:
      tenant.organization.businessProfile?.currencyCode ?? "USD",
    startDate: parsed.data.startDate
      ? new Date(`${parsed.data.startDate}T00:00:00.000Z`)
      : null,
    endDate: parsed.data.endDate
      ? new Date(`${parsed.data.endDate}T00:00:00.000Z`)
      : null,
  };

  await getDatabase().$transaction([
    getDatabase().campaignBudget.upsert({
      where: { campaignId: campaign.id },
      create: { campaignId: campaign.id, ...budgetData },
      update: budgetData,
    }),
    getDatabase().campaign.updateMany({
      where: { id: campaign.id, organizationId: tenant.organizationId },
      data: { status: CampaignStatus.DRAFT },
    }),
  ]);

  revalidateCampaigns(organizationSlug, campaignId);
  nextStepRedirect(organizationSlug, campaignId, "budget", "review", formData);
}

export async function markCampaignReadyAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  void _previousState;
  void _formData;
  const tenant = await requireTenantContext(organizationSlug, managers);
  const campaign = await getCampaignReadinessRecord(
    tenant.organizationId,
    campaignId,
  );

  if (!campaign) return invalidCampaignState("Campaign not found.");

  const issues = readinessIssues(campaign);

  if (issues.length) {
    return {
      status: "error",
      message: "Complete the campaign before marking it ready for review.",
      fieldErrors: { review: issues },
    };
  }

  await getDatabase().campaign.updateMany({
    where: { id: campaign.id, organizationId: tenant.organizationId },
    data: { status: CampaignStatus.READY_FOR_REVIEW },
  });
  revalidateCampaigns(organizationSlug, campaignId);
  redirect(campaignPath(organizationSlug, campaignId));
}

export async function approveCampaignAction(
  organizationSlug: string,
  campaignId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const campaign = await getCampaignReadinessRecord(
    tenant.organizationId,
    campaignId,
    CampaignStatus.READY_FOR_REVIEW,
  );

  if (!campaign || readinessIssues(campaign).length) {
    await getDatabase().campaign.updateMany({
      where: { id: campaignId, organizationId: tenant.organizationId },
      data: { status: CampaignStatus.DRAFT },
    });
    revalidateCampaigns(organizationSlug, campaignId);
    return;
  }

  await getDatabase().campaign.updateMany({
    where: {
      id: campaignId,
      organizationId: tenant.organizationId,
      status: CampaignStatus.READY_FOR_REVIEW,
    },
    data: { status: CampaignStatus.APPROVED },
  });
  revalidateCampaigns(organizationSlug, campaignId);
}

export async function returnCampaignToDraftAction(
  organizationSlug: string,
  campaignId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  await getDatabase().campaign.updateMany({
    where: {
      id: campaignId,
      organizationId: tenant.organizationId,
      status: { in: [CampaignStatus.READY_FOR_REVIEW, CampaignStatus.APPROVED] },
    },
    data: { status: CampaignStatus.DRAFT },
  });
  revalidateCampaigns(organizationSlug, campaignId);
}

export async function archiveCampaignAction(
  organizationSlug: string,
  campaignId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  await getDatabase().campaign.updateMany({
    where: {
      id: campaignId,
      organizationId: tenant.organizationId,
      status: { not: CampaignStatus.ARCHIVED },
    },
    data: { status: CampaignStatus.ARCHIVED, archivedAt: new Date() },
  });
  revalidateCampaigns(organizationSlug, campaignId);
  redirect(campaignPath(organizationSlug));
}

export async function removeManualCampaignAssetAction(
  organizationSlug: string,
  campaignId: string,
  campaignCreativeId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const asset = await getDatabase().campaignCreative.findFirst({
    where: {
      id: campaignCreativeId,
      campaignId,
      organizationId: tenant.organizationId,
      source: CampaignCreativeSource.MANUAL_UPLOAD,
    },
    select: { id: true, storageKey: true },
  });

  if (!asset) return;
  if (asset.storageKey) {
    await getBlobStore().deleteObject(asset.storageKey).catch(() => undefined);
  }
  await getDatabase().campaignCreative.deleteMany({
    where: {
      id: asset.id,
      campaignId,
      organizationId: tenant.organizationId,
    },
  });
  await getDatabase().campaign.updateMany({
    where: { id: campaignId, organizationId: tenant.organizationId },
    data: { status: CampaignStatus.DRAFT },
  });
  revalidateCampaigns(organizationSlug, campaignId);
}
