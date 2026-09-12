"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { OrganizationRole } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";
import { getMetaAvailability } from "@/lib/meta/config";
import { getMetaAdsGateway } from "@/lib/meta/meta-ads-gateway";
import { getMetaPublishJobDispatcher } from "@/lib/meta/publish-dispatcher";
import { encryptMetaToken } from "@/lib/meta/token-cipher";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

import { recordMetaAuditEvent } from "./audit";
import { getMetaConnectionWithToken, syncMetaAssets } from "./connections";
import { buildMetaPublishSnapshot } from "./publishing-snapshot";
import {
  parseMetaAssetSelection,
  parseMetaCampaignConfiguration,
  targetingSearchSchema,
} from "./schema";
import { runRemoteMetaValidation, validateMetaSnapshot } from "./validation";
import {
  reconcileMetaPublishJob,
  synchronizeMetaPublicationStatus,
} from "./worker";

const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

function metaSettingsPath(organizationSlug: string) {
  return `/dashboard/${organizationSlug}/settings/integrations/meta`;
}

function metaCampaignPath(organizationSlug: string, campaignId: string) {
  return `/dashboard/${organizationSlug}/campaigns/${campaignId}/meta`;
}

function revalidateMeta(organizationSlug: string, campaignId?: string) {
  revalidatePath(metaSettingsPath(organizationSlug));
  revalidatePath(`${metaSettingsPath(organizationSlug)}/assets`);
  if (campaignId) revalidatePath(metaCampaignPath(organizationSlug, campaignId));
}

function errorState(message: string): ActionState {
  return { status: "error", message };
}

export async function syncMetaAssetsAction(
  organizationSlug: string,
  connectionId: string,
  previousState: ActionState,
): Promise<ActionState> {
  void previousState;
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  try {
    const result = await syncMetaAssets(tenant.organizationId, connectionId);
    await recordMetaAuditEvent({
      organizationId: tenant.organizationId,
      actorUserId: user.id,
      action: "META_ASSETS_SYNCED",
      entityType: "MetaConnection",
      entityId: connectionId,
      metadata: result,
    });
    revalidateMeta(organizationSlug);
    return { status: "idle", message: "Meta assets refreshed." };
  } catch {
    await getDatabase().metaConnection.updateMany({
      where: { id: connectionId, organizationId: tenant.organizationId },
      data: {
        status: "DEGRADED",
        lastErrorCode: "ASSET_SYNC_FAILED",
        lastErrorMessage: "Meta assets could not be refreshed.",
      },
    });
    revalidateMeta(organizationSlug);
    return errorState("Meta assets could not be refreshed. Check the connection and permissions.");
  }
}

export async function syncMetaAssetsFormAction(
  organizationSlug: string,
  connectionId: string,
) {
  await syncMetaAssetsAction(organizationSlug, connectionId, { status: "idle" });
}

export async function saveMetaAssetSelectionAction(
  organizationSlug: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const parsed = parseMetaAssetSelection(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the selected Meta assets.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const input = parsed.data;
  const database = getDatabase();
  const [connection, adAccount, page, instagram, dataset, business] = await Promise.all([
    database.metaConnection.findFirst({
      where: { id: input.connectionId, organizationId: tenant.organizationId, status: { in: ["CONNECTED", "DEGRADED"] } },
    }),
    database.metaAdAccount.findFirst({
      where: { id: input.adAccountId, organizationId: tenant.organizationId, connectionId: input.connectionId, accessStatus: "ACCESSIBLE" },
    }),
    database.metaPage.findFirst({
      where: { id: input.pageId, organizationId: tenant.organizationId, connectionId: input.connectionId, accessStatus: "ACCESSIBLE" },
    }),
    input.instagramAccountId
      ? database.metaInstagramAccount.findFirst({
          where: { id: input.instagramAccountId, organizationId: tenant.organizationId, connectionId: input.connectionId, pageId: input.pageId, accessStatus: "ACCESSIBLE" },
        })
      : null,
    input.datasetId
      ? database.metaDataset.findFirst({
          where: { id: input.datasetId, organizationId: tenant.organizationId, connectionId: input.connectionId, adAccountId: input.adAccountId, accessStatus: "ACCESSIBLE" },
        })
      : null,
    input.businessId
      ? database.metaBusiness.findFirst({
          where: { id: input.businessId, organizationId: tenant.organizationId, connectionId: input.connectionId, accessStatus: "ACCESSIBLE" },
        })
      : null,
  ]);
  if (!connection || !adAccount || !page || (input.instagramAccountId && !instagram) || (input.datasetId && !dataset) || (input.businessId && !business)) {
    return errorState("One or more Meta assets are unavailable to this organization.");
  }

  const publishingEnabled =
    formData.get("publishingEnabled") === "on" && getMetaAvailability().publishingEnabled;
  await database.organizationMetaSettings.upsert({
    where: { organizationId: tenant.organizationId },
    create: {
      organizationId: tenant.organizationId,
      publishingEnabled,
      defaultConnectionId: connection.id,
      defaultBusinessId: business?.id,
      defaultAdAccountId: adAccount.id,
      defaultPageId: page.id,
      defaultInstagramAccountId: instagram?.id,
      defaultDatasetId: dataset?.id,
    },
    update: {
      publishingEnabled,
      defaultConnectionId: connection.id,
      defaultBusinessId: business?.id,
      defaultAdAccountId: adAccount.id,
      defaultPageId: page.id,
      defaultInstagramAccountId: instagram?.id,
      defaultDatasetId: dataset?.id,
    },
  });
  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "META_ASSET_DEFAULTS_UPDATED",
    entityType: "OrganizationMetaSettings",
    metadata: { publishingEnabled },
  });
  revalidateMeta(organizationSlug);
  return { status: "idle", message: "Meta asset defaults saved." };
}

export async function disconnectMetaAction(
  organizationSlug: string,
  connectionId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const connectionWithToken = await getMetaConnectionWithToken(
    tenant.organizationId,
    connectionId,
  );
  let remoteRevoked = true;
  try {
    await getMetaAdsGateway().revokeToken(
      connectionWithToken.accessToken,
      connectionWithToken.connection.metaUserId,
    );
  } catch {
    remoteRevoked = false;
  }
  const encrypted = encryptMetaToken(
    `disconnected:${randomBytes(32).toString("base64url")}`,
    tenant.organizationId,
    connectionId,
  );
  await getDatabase().$transaction([
    getDatabase().metaConnection.updateMany({
      where: { id: connectionId, organizationId: tenant.organizationId },
      data: {
        status: "DISCONNECTED",
        disconnectedAt: new Date(),
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
      },
    }),
    getDatabase().campaignMetaConfiguration.updateMany({
      where: { organizationId: tenant.organizationId, connectionId },
      data: { status: "DISCONNECTED", lastApprovedHash: null, lastApprovedAt: null },
    }),
  ]);
  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "META_DISCONNECTED",
    entityType: "MetaConnection",
    entityId: connectionId,
    metadata: { remoteRevoked },
  });
  revalidateMeta(organizationSlug);
  redirect(metaSettingsPath(organizationSlug));
}

export async function approveManualCampaignCreativeAction(
  organizationSlug: string,
  campaignId: string,
  campaignCreativeId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const creative = await database.campaignCreative.findFirst({
    where: {
      id: campaignCreativeId,
      campaignId,
      organizationId: tenant.organizationId,
      source: "MANUAL_UPLOAD",
      uploadStatus: "READY",
      checksumSha256: { not: null },
      campaign: { status: { not: "ARCHIVED" } },
    },
    select: { id: true, checksumSha256: true },
  });
  if (!creative) return;
  const approvedAt = new Date();
  await database.$transaction([
    database.campaignCreativeApproval.updateMany({
      where: {
        organizationId: tenant.organizationId,
        campaignCreativeId: creative.id,
        supersededAt: null,
      },
      data: { supersededAt: approvedAt },
    }),
    database.campaignCreativeApproval.create({
      data: {
        organizationId: tenant.organizationId,
        campaignCreativeId: creative.id,
        approvedById: user.id,
        assetChecksum: creative.checksumSha256,
        approvedAt,
      },
    }),
  ]);
  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "CAMPAIGN_CREATIVE_APPROVED_FOR_META",
    entityType: "CampaignCreative",
    entityId: creative.id,
  });
  revalidateMeta(organizationSlug, campaignId);
  revalidatePath(`/dashboard/${organizationSlug}/campaigns/${campaignId}`);
}

export async function revokeManualCampaignCreativeApprovalAction(
  organizationSlug: string,
  campaignId: string,
  campaignCreativeId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const creative = await database.campaignCreative.findFirst({
    where: {
      id: campaignCreativeId,
      campaignId,
      organizationId: tenant.organizationId,
      source: "MANUAL_UPLOAD",
      campaign: { status: { not: "ARCHIVED" } },
    },
    select: { id: true },
  });
  if (!creative) return;

  const revoked = await database.campaignCreativeApproval.updateMany({
    where: {
      organizationId: tenant.organizationId,
      campaignCreativeId: creative.id,
      supersededAt: null,
    },
    data: { supersededAt: new Date() },
  });
  if (!revoked.count) return;

  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "CAMPAIGN_CREATIVE_META_APPROVAL_REVOKED",
    entityType: "CampaignCreative",
    entityId: creative.id,
  });
  revalidateMeta(organizationSlug, campaignId);
  revalidatePath(`/dashboard/${organizationSlug}/campaigns/${campaignId}`);
}

export async function saveCampaignMetaConfigurationAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const parsed = parseMetaCampaignConfiguration(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the Meta campaign configuration.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  const input = parsed.data;
  const database = getDatabase();
  const campaign = await database.campaign.findFirst({
    where: { id: campaignId, organizationId: tenant.organizationId, status: "APPROVED" },
    include: { audience: true },
  });
  if (!campaign) return errorState("Approve the Avora campaign before configuring Meta.");

  const [connection, adAccount, page, instagram, dataset, creatives, products] = await Promise.all([
    database.metaConnection.findFirst({
      where: { id: input.connectionId, organizationId: tenant.organizationId, status: "CONNECTED" },
    }),
    database.metaAdAccount.findFirst({
      where: { id: input.adAccountId, organizationId: tenant.organizationId, connectionId: input.connectionId, accessStatus: "ACCESSIBLE" },
    }),
    database.metaPage.findFirst({
      where: { id: input.pageId, organizationId: tenant.organizationId, connectionId: input.connectionId, accessStatus: "ACCESSIBLE" },
    }),
    input.instagramAccountId
      ? database.metaInstagramAccount.findFirst({
          where: { id: input.instagramAccountId, organizationId: tenant.organizationId, pageId: input.pageId, accessStatus: "ACCESSIBLE" },
        })
      : null,
    input.datasetId
      ? database.metaDataset.findFirst({
          where: { id: input.datasetId, organizationId: tenant.organizationId, adAccountId: input.adAccountId, accessStatus: "ACCESSIBLE" },
        })
      : null,
    database.campaignCreative.findMany({
      where: {
        organizationId: tenant.organizationId,
        campaignId,
        id: { in: input.ads.map((ad) => ad.campaignCreativeId) },
        uploadStatus: "READY",
      },
    }),
    database.campaignProduct.findMany({
      where: {
        organizationId: tenant.organizationId,
        campaignId,
        id: { in: input.ads.flatMap((ad) => ad.campaignProductId ? [ad.campaignProductId] : []) },
      },
    }),
  ]);
  const creativeIds = new Set(creatives.map((item) => item.id));
  const productIds = new Set(products.map((item) => item.id));
  if (
    !connection ||
    !adAccount ||
    !page ||
    (input.instagramAccountId && !instagram) ||
    (input.datasetId && !dataset) ||
    input.ads.some((ad) => !creativeIds.has(ad.campaignCreativeId)) ||
    input.ads.some((ad) => ad.campaignProductId && !productIds.has(ad.campaignProductId))
  ) {
    return errorState("One or more selected campaign or Meta assets are unavailable.");
  }

  const configuration = await database.$transaction(async (transaction) => {
    const stored = await transaction.campaignMetaConfiguration.upsert({
      where: { campaignId },
      create: {
        organizationId: tenant.organizationId,
        campaignId,
        connectionId: connection.id,
        adAccountId: adAccount.id,
        pageId: page.id,
        instagramAccountId: instagram?.id,
        datasetId: dataset?.id,
        optimizationGoal: input.optimizationGoal,
        callToAction: input.callToAction,
        specialAdCategories: input.specialAdCategories,
        beneficiaryName: input.beneficiaryName,
        payorName: input.payorName,
        status: "CONFIGURING",
      },
      update: {
        connectionId: connection.id,
        adAccountId: adAccount.id,
        pageId: page.id,
        instagramAccountId: instagram?.id,
        datasetId: dataset?.id,
        optimizationGoal: input.optimizationGoal,
        callToAction: input.callToAction,
        specialAdCategories: input.specialAdCategories,
        beneficiaryName: input.beneficiaryName,
        payorName: input.payorName,
        status: "CONFIGURING",
        configurationVersion: { increment: 1 },
        lastValidatedHash: null,
        lastValidatedAt: null,
        lastApprovedHash: null,
        lastApprovedAt: null,
      },
    });
    await transaction.metaPublishApproval.updateMany({
      where: { organizationId: tenant.organizationId, configurationId: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await transaction.campaignMetaAd.deleteMany({
      where: { organizationId: tenant.organizationId, configurationId: stored.id },
    });
    await transaction.campaignMetaAd.createMany({
      data: input.ads.map((ad, position) => ({
        organizationId: tenant.organizationId,
        configurationId: stored.id,
        campaignCreativeId: ad.campaignCreativeId,
        campaignProductId: ad.campaignProductId,
        destinationUrl: ad.destinationUrl,
        primaryText: ad.primaryText,
        headline: ad.headline,
        description: ad.description,
        callToAction: input.callToAction,
        position,
      })),
    });
    if (campaign.audience?.countryCode) {
      await transaction.campaignMetaAudienceTarget.upsert({
        where: {
          configurationId_type_externalKey: {
            configurationId: stored.id,
            type: "COUNTRY",
            externalKey: campaign.audience.countryCode,
          },
        },
        create: {
          organizationId: tenant.organizationId,
          configurationId: stored.id,
          type: "COUNTRY",
          sourceValue: campaign.audience.countryCode,
          externalKey: campaign.audience.countryCode,
          externalName: campaign.audience.countryCode,
          countryCode: campaign.audience.countryCode,
        },
        update: { isValid: true, invalidReason: null },
      });
    }
    return stored;
  });
  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "META_CAMPAIGN_CONFIGURED",
    entityType: "CampaignMetaConfiguration",
    entityId: configuration.id,
    metadata: { adCount: input.ads.length },
  });
  revalidateMeta(organizationSlug, campaignId);
  return { status: "idle", message: "Meta campaign configuration saved." };
}

export async function resolveMetaTargetAction(
  organizationSlug: string,
  campaignId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = targetingSearchSchema.safeParse({
    type: formData.get("type"),
    query: formData.get("query"),
  });
  if (!parsed.success) return errorState("Enter a region, city, or interest to resolve.");
  const configuration = await getDatabase().campaignMetaConfiguration.findFirst({
    where: { campaignId, organizationId: tenant.organizationId },
  });
  if (!configuration) return errorState("Save the Meta campaign configuration first.");
  const { accessToken } = await getMetaConnectionWithToken(
    tenant.organizationId,
    configuration.connectionId,
  );
  const gateway = getMetaAdsGateway();
  const results = parsed.data.type === "INTEREST"
    ? await gateway.searchInterests(accessToken, parsed.data.query)
    : await gateway.searchLocations(accessToken, parsed.data.query);
  const selected = results[0];
  if (!selected) return errorState("Meta did not return a supported targeting match.");

  await getDatabase().$transaction([
    getDatabase().campaignMetaAudienceTarget.upsert({
      where: {
        configurationId_type_externalKey: {
          configurationId: configuration.id,
          type: parsed.data.type,
          externalKey: selected.id,
        },
      },
      create: {
        organizationId: tenant.organizationId,
        configurationId: configuration.id,
        type: parsed.data.type,
        sourceValue: parsed.data.query,
        externalKey: selected.id,
        externalName: selected.name,
        countryCode: selected.countryCode,
      },
      update: {
        sourceValue: parsed.data.query,
        externalName: selected.name,
        countryCode: selected.countryCode,
        isValid: true,
        invalidReason: null,
        resolvedAt: new Date(),
      },
    }),
    getDatabase().campaignMetaConfiguration.update({
      where: { id: configuration.id },
      data: {
        status: "CONFIGURING",
        configurationVersion: { increment: 1 },
        lastValidatedHash: null,
        lastValidatedAt: null,
        lastApprovedHash: null,
        lastApprovedAt: null,
      },
    }),
    getDatabase().metaPublishApproval.updateMany({
      where: { organizationId: tenant.organizationId, configurationId: configuration.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  revalidateMeta(organizationSlug, campaignId);
  return { status: "idle", message: `Resolved to ${selected.name}.` };
}

export async function removeMetaTargetAction(
  organizationSlug: string,
  campaignId: string,
  targetId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const target = await getDatabase().campaignMetaAudienceTarget.findFirst({
    where: { id: targetId, organizationId: tenant.organizationId, configuration: { campaignId } },
  });
  if (!target || target.type === "COUNTRY") return;
  await getDatabase().campaignMetaAudienceTarget.delete({ where: { id: target.id } });
  await getDatabase().campaignMetaConfiguration.updateMany({
    where: { id: target.configurationId, organizationId: tenant.organizationId },
    data: {
      status: "CONFIGURING",
      configurationVersion: { increment: 1 },
      lastValidatedHash: null,
      lastApprovedHash: null,
    },
  });
  revalidateMeta(organizationSlug, campaignId);
}

export async function validateMetaCampaignAction(
  organizationSlug: string,
  campaignId: string,
  previousState: ActionState,
): Promise<ActionState> {
  void previousState;
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const configuration = await database.campaignMetaConfiguration.findFirst({
    where: { campaignId, organizationId: tenant.organizationId },
  });
  if (!configuration) return errorState("Configure the Meta campaign first.");
  await database.campaignMetaConfiguration.updateMany({
    where: { id: configuration.id, organizationId: tenant.organizationId },
    data: { status: "VALIDATING" },
  });

  const built = await buildMetaPublishSnapshot(tenant.organizationId, campaignId);
  const local = validateMetaSnapshot(built.snapshot);
  let remoteErrors: typeof local.errors = [];
  let providerMetadata: Prisma.InputJsonValue | undefined;
  if (!local.errors.length) {
    try {
      const remote = await runRemoteMetaValidation(built.snapshot);
      remoteErrors = remote.errors;
      providerMetadata = { checkedAt: remote.checkedAt };
    } catch {
      remoteErrors = [{
        code: "REMOTE_VALIDATION_UNAVAILABLE",
        message: "Meta could not complete remote validation. No publishing action was taken.",
      }];
    }
  }
  const errors = [...local.errors, ...remoteErrors];
  const validation = await database.metaCampaignValidation.create({
    data: {
      organizationId: tenant.organizationId,
      configurationId: configuration.id,
      validatedById: user.id,
      snapshotHash: built.hash,
      status: errors.length ? "FAILED" : "PASSED",
      errors,
      warnings: local.warnings,
      providerMetadata,
      expiresAt: new Date(Date.now() + 15 * 60 * 1_000),
    },
  });
  await database.campaignMetaConfiguration.updateMany({
    where: { id: configuration.id, organizationId: tenant.organizationId },
    data: {
      status: errors.length ? "INVALID" : "READY_FOR_APPROVAL",
      lastValidatedHash: built.hash,
      lastValidatedAt: new Date(),
      lastApprovedHash: null,
      lastApprovedAt: null,
    },
  });
  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "META_CAMPAIGN_VALIDATED",
    entityType: "MetaCampaignValidation",
    entityId: validation.id,
    metadata: { status: validation.status, errorCount: errors.length, warningCount: local.warnings.length },
  });
  revalidateMeta(organizationSlug, campaignId);
  return errors.length
    ? errorState("Meta validation found blocking issues.")
    : { status: "idle", message: "Validation passed. Review the immutable publishing summary." };
}

export async function publishMetaCampaignAsPausedAction(
  organizationSlug: string,
  campaignId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const availability = getMetaAvailability();
  if (!availability.configured || !availability.publishingEnabled) {
    redirect(`${metaCampaignPath(organizationSlug, campaignId)}/review?publish=disabled`);
  }
  const database = getDatabase();
  const settings = await database.organizationMetaSettings.findUnique({
    where: { organizationId: tenant.organizationId },
  });
  if (!settings?.publishingEnabled) {
    redirect(`${metaCampaignPath(organizationSlug, campaignId)}/review?publish=disabled`);
  }
  const built = await buildMetaPublishSnapshot(tenant.organizationId, campaignId);
  const validation = await database.metaCampaignValidation.findFirst({
    where: {
      organizationId: tenant.organizationId,
      configurationId: built.snapshot.configuration.id,
      snapshotHash: built.hash,
      status: "PASSED",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!validation) {
    redirect(`${metaCampaignPath(organizationSlug, campaignId)}/review?publish=validation_required`);
  }
  const configuration = await database.campaignMetaConfiguration.findFirst({
    where: {
      id: built.snapshot.configuration.id,
      organizationId: tenant.organizationId,
      status: "READY_FOR_APPROVAL",
      lastValidatedHash: built.hash,
    },
  });
  if (!configuration) {
    redirect(`${metaCampaignPath(organizationSlug, campaignId)}/review?publish=configuration_changed`);
  }

  const idempotencyKey = createHash("sha256")
    .update(`${tenant.organizationId}:${campaignId}:${built.hash}`)
    .digest("hex");
  const existing = await database.metaPublishJob.findUnique({
    where: {
      organizationId_idempotencyKey: {
        organizationId: tenant.organizationId,
        idempotencyKey,
      },
    },
  });
  if (existing) {
    redirect(`${metaCampaignPath(organizationSlug, campaignId)}/publishing/${existing.id}`);
  }

  const approvalId = randomUUID();
  const jobId = randomUUID();
  const markerBase = `AVORA-${jobId.slice(0, 12)}`;
  const stepInputs = [
    { type: "CAMPAIGN" as const, localKey: campaignId },
    ...built.snapshot.ads.map((ad) => ({ type: "MEDIA" as const, localKey: ad.id })),
    { type: "AD_SET" as const, localKey: "primary" },
    ...built.snapshot.ads.map((ad) => ({ type: "CREATIVE" as const, localKey: ad.id })),
    ...built.snapshot.ads.map((ad) => ({ type: "AD" as const, localKey: ad.id })),
  ];
  const job = await database.$transaction(async (transaction) => {
    await transaction.metaPublishApproval.create({
      data: {
        id: approvalId,
        organizationId: tenant.organizationId,
        campaignId,
        configurationId: configuration.id,
        validationId: validation.id,
        approvedById: user.id,
        snapshotHash: built.hash,
      },
    });
    const created = await transaction.metaPublishJob.create({
      data: {
        id: jobId,
        organizationId: tenant.organizationId,
        campaignId,
        configurationId: configuration.id,
        approvalId,
        initiatedById: user.id,
        idempotencyKey,
        snapshotHash: built.hash,
        snapshot: built.snapshot as Prisma.InputJsonValue,
      },
    });
    await transaction.metaPublishStep.createMany({
      data: stepInputs.map((step, index) => ({
        organizationId: tenant.organizationId,
        jobId,
        type: step.type,
        localKey: step.localKey,
        requestFingerprint: createHash("sha256")
          .update(`${built.hash}:${step.type}:${step.localKey}`)
          .digest("hex"),
        publicationMarker: `${markerBase}-${String(index + 1).padStart(2, "0")}`,
      })),
    });
    await transaction.campaignMetaConfiguration.update({
      where: { id: configuration.id },
      data: {
        status: "QUEUED",
        lastApprovedHash: built.hash,
        lastApprovedAt: new Date(),
      },
    });
    return created;
  });
  await getMetaPublishJobDispatcher().enqueue(job.id, tenant.organizationId);
  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "META_PUBLISH_APPROVED",
    entityType: "MetaPublishJob",
    entityId: job.id,
    metadata: { mode: "PAUSED", snapshotHash: built.hash },
  });
  revalidateMeta(organizationSlug, campaignId);
  redirect(`${metaCampaignPath(organizationSlug, campaignId)}/publishing/${job.id}`);
}

export async function reconcileMetaPublishJobAction(
  organizationSlug: string,
  campaignId: string,
  jobId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const job = await getDatabase().metaPublishJob.findFirst({
    where: { id: jobId, campaignId, organizationId: tenant.organizationId },
    select: { id: true },
  });
  if (!job) return;
  const reconciled = await reconcileMetaPublishJob(tenant.organizationId, job.id);
  await recordMetaAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "META_PUBLISH_RECONCILIATION_REQUESTED",
    entityType: "MetaPublishJob",
    entityId: job.id,
    metadata: { remoteObjectFound: reconciled },
  });
  revalidateMeta(organizationSlug, campaignId);
}

export async function synchronizeMetaPublicationStatusAction(
  organizationSlug: string,
  campaignId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const synchronized = await synchronizeMetaPublicationStatus(
    tenant.organizationId,
    campaignId,
  );
  if (synchronized) {
    await recordMetaAuditEvent({
      organizationId: tenant.organizationId,
      actorUserId: user.id,
      action: "META_REMOTE_STATUS_SYNCHRONIZED",
      entityType: "Campaign",
      entityId: campaignId,
    });
  }
  revalidateMeta(organizationSlug, campaignId);
}
