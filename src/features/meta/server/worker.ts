import "server-only";

import { randomUUID } from "node:crypto";

import {
  MetaPublishJobStatus,
  MetaPublishStepStatus,
  MetaPublishStepType,
  OrganizationRole,
} from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/lib/db/database";
import { getMetaAvailability } from "@/lib/meta/config";
import { MetaApiError } from "@/lib/meta/errors";
import { getMetaAdsGateway } from "@/lib/meta/meta-ads-gateway";
import { getBlobStore } from "@/lib/storage/r2-object-storage";

import { recordMetaAuditEvent } from "./audit";
import { getMetaConnectionWithToken } from "./connections";
import { buildMetaPublishSnapshot, type MetaPublishSnapshot } from "./publishing-snapshot";

const leaseMilliseconds = 5 * 60 * 1_000;
const maximumMediaBytes = 10 * 1024 * 1024;

type LoadedJob = NonNullable<Awaited<ReturnType<typeof loadJob>>>;
type LoadedStep = LoadedJob["steps"][number];

async function claimNextJob(workerId: string) {
  const database = getDatabase();
  const now = new Date();
  const running = await database.metaPublishJob.count({
    where: {
      status: MetaPublishJobStatus.RUNNING,
      leaseExpiresAt: { gt: now },
    },
  });
  const maximum = Number.parseInt(process.env.META_MAX_PUBLISH_CONCURRENCY ?? "1", 10) || 1;
  if (running >= Math.max(1, maximum)) return null;

  const candidate = await database.metaPublishJob.findFirst({
    where: {
      status: { in: [MetaPublishJobStatus.QUEUED, MetaPublishJobStatus.RETRY_SCHEDULED] },
      availableAt: { lte: now },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, organizationId: true },
  });
  if (!candidate) return null;

  const claimed = await database.metaPublishJob.updateMany({
    where: {
      id: candidate.id,
      organizationId: candidate.organizationId,
      status: { in: [MetaPublishJobStatus.QUEUED, MetaPublishJobStatus.RETRY_SCHEDULED] },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    data: {
      status: MetaPublishJobStatus.RUNNING,
      lockedAt: now,
      lockedBy: workerId,
      leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds),
      startedAt: now,
      attemptCount: { increment: 1 },
      errorCode: null,
      errorMessage: null,
    },
  });
  return claimed.count === 1 ? candidate : null;
}

function loadJob(jobId: string, organizationId: string) {
  return getDatabase().metaPublishJob.findFirst({
    where: { id: jobId, organizationId },
    include: {
      configuration: {
        include: {
          adAccount: true,
          page: true,
          instagramAccount: true,
          dataset: true,
          audienceTargets: { orderBy: [{ type: "asc" }, { externalKey: "asc" }] },
          ads: { orderBy: { position: "asc" } },
        },
      },
      campaign: { include: { audience: true, budget: true } },
      steps: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function assertPublishAuthorization(job: LoadedJob) {
  const availability = getMetaAvailability();
  if (!availability.configured || !availability.publishingEnabled) {
    throw new Error("Meta publishing is disabled by server configuration.");
  }
  const [membership, settings, approval, current] = await Promise.all([
    getDatabase().organizationMember.findFirst({
      where: {
        organizationId: job.organizationId,
        userId: job.initiatedById,
        role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] },
      },
      select: { id: true },
    }),
    getDatabase().organizationMetaSettings.findUnique({
      where: { organizationId: job.organizationId },
      select: { publishingEnabled: true },
    }),
    getDatabase().metaPublishApproval.findFirst({
      where: {
        id: job.approvalId,
        organizationId: job.organizationId,
        snapshotHash: job.snapshotHash,
        revokedAt: null,
      },
      select: { id: true },
    }),
    buildMetaPublishSnapshot(job.organizationId, job.campaignId),
  ]);
  if (!membership || !settings?.publishingEnabled || !approval) {
    throw new Error("Publish authorization is no longer valid.");
  }
  if (current.hash !== job.snapshotHash) {
    throw new Error("Campaign configuration changed after approval.");
  }
  return current.snapshot;
}

function objectiveForMeta(objective: MetaPublishSnapshot["campaign"]["objective"]) {
  const objectives = {
    SALES: "OUTCOME_SALES",
    LEADS: "OUTCOME_LEADS",
    TRAFFIC: "OUTCOME_TRAFFIC",
    AWARENESS: "OUTCOME_AWARENESS",
  } as const;
  if (!objective) throw new Error("Campaign objective is missing.");
  return objectives[objective];
}

function budgetForMeta(snapshot: MetaPublishSnapshot) {
  const budget = snapshot.campaign.budget;
  if (!budget?.type) throw new Error("Campaign budget is missing.");
  const amount = budget.type === "DAILY" ? budget.dailyBudget : budget.lifetimeBudget;
  if (!amount) throw new Error("Campaign budget amount is missing.");
  return {
    type: budget.type,
    minorUnits: new Prisma.Decimal(amount).mul(100).toDecimalPlaces(0).toString(),
    startTime: budget.startDate ?? undefined,
    endTime: budget.endDate ?? undefined,
  };
}

function targetingForMeta(snapshot: MetaPublishSnapshot) {
  const countries = snapshot.targets.filter((item) => item.type === "COUNTRY").map((item) => item.externalKey);
  const regions = snapshot.targets.filter((item) => item.type === "REGION").map((item) => ({ key: item.externalKey }));
  const cities = snapshot.targets.filter((item) => item.type === "CITY").map((item) => ({ key: item.externalKey }));
  const interests = snapshot.targets.filter((item) => item.type === "INTEREST").map((item) => ({ id: item.externalKey, name: item.externalName }));
  const targeting: Record<string, unknown> = {
    geo_locations: { countries, regions, cities },
  };
  if (snapshot.campaign.audience?.minimumAge) targeting.age_min = snapshot.campaign.audience.minimumAge;
  if (snapshot.campaign.audience?.maximumAge) targeting.age_max = snapshot.campaign.audience.maximumAge;
  if (snapshot.campaign.audience?.gender === "WOMEN") targeting.genders = [1];
  if (snapshot.campaign.audience?.gender === "MEN") targeting.genders = [2];
  if (interests.length) targeting.flexible_spec = [{ interests }];
  return targeting;
}

function promotedObject(snapshot: MetaPublishSnapshot) {
  if (!snapshot.dataset) return undefined;
  if (snapshot.campaign.objective === "SALES") {
    return { pixel_id: snapshot.dataset.externalId, custom_event_type: "PURCHASE" };
  }
  if (snapshot.campaign.objective === "LEADS") {
    return { pixel_id: snapshot.dataset.externalId, custom_event_type: "LEAD" };
  }
  return undefined;
}

async function beginStep(step: LoadedStep) {
  const attemptNumber = step.attemptCount + 1;
  await getDatabase().metaPublishStep.update({
    where: { id: step.id },
    data: {
      status: MetaPublishStepStatus.RUNNING,
      attemptCount: attemptNumber,
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });
  return getDatabase().metaPublishAttempt.create({
    data: {
      organizationId: step.organizationId,
      stepId: step.id,
      attemptNumber,
      status: MetaPublishStepStatus.RUNNING,
    },
  });
}

async function completeStep(step: LoadedStep, attemptId: string, externalId?: string) {
  const completedAt = new Date();
  await getDatabase().$transaction([
    getDatabase().metaPublishStep.update({
      where: { id: step.id },
      data: { status: MetaPublishStepStatus.SUCCEEDED, externalId, completedAt },
    }),
    getDatabase().metaPublishAttempt.update({
      where: { id: attemptId },
      data: { status: MetaPublishStepStatus.SUCCEEDED, completedAt },
    }),
  ]);
}

async function processCampaignStep(job: LoadedJob, step: LoadedStep, snapshot: MetaPublishSnapshot, accessToken: string) {
  const gateway = getMetaAdsGateway();
  const existing = await getDatabase().metaCampaignMapping.findFirst({
    where: { organizationId: job.organizationId, campaignId: job.campaignId },
  });
  const attempt = await beginStep(step);
  if (existing) {
    await completeStep(step, attempt.id, existing.externalCampaignId);
    return;
  }
  const reconciled = await gateway.findObjectByMarker({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    type: "campaigns",
    marker: step.publicationMarker,
  });
  const externalId = reconciled ?? await gateway.createCampaign({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    name: `${snapshot.campaign.name} [${step.publicationMarker}]`,
    objective: objectiveForMeta(snapshot.campaign.objective),
    specialAdCategories: snapshot.configuration.specialAdCategories,
  });
  await getDatabase().metaCampaignMapping.create({
    data: {
      organizationId: job.organizationId,
      campaignId: job.campaignId,
      configurationId: job.configurationId,
      publishJobId: job.id,
      adAccountId: job.configuration.adAccountId,
      externalCampaignId: externalId,
    },
  });
  await completeStep(step, attempt.id, externalId);
}

async function loadCampaignCreativeAsset(job: LoadedJob, campaignMetaAdId: string) {
  const ad = await getDatabase().campaignMetaAd.findFirst({
    where: { id: campaignMetaAdId, organizationId: job.organizationId, configurationId: job.configurationId },
    include: { campaignCreative: { include: { creativeAsset: true } } },
  });
  if (!ad) throw new Error("The configured Meta ad is unavailable.");
  const source = ad.campaignCreative;
  const asset = source.source === "MANUAL_UPLOAD" ? source : source.creativeAsset;
  if (!asset?.storageKey || !asset.mimeType || !asset.checksumSha256) {
    throw new Error("The canonical campaign image is unavailable.");
  }
  return {
    ad,
    source,
    asset: {
      storageKey: asset.storageKey,
      mimeType: asset.mimeType,
      checksumSha256: asset.checksumSha256,
    },
  };
}

async function processMediaStep(job: LoadedJob, step: LoadedStep, snapshot: MetaPublishSnapshot, accessToken: string) {
  const { source, asset } = await loadCampaignCreativeAsset(job, step.localKey);
  const existing = await getDatabase().metaMediaMapping.findFirst({
    where: {
      organizationId: job.organizationId,
      adAccountId: job.configuration.adAccountId,
      campaignCreativeId: source.id,
      assetChecksum: asset.checksumSha256,
    },
  });
  const attempt = await beginStep(step);
  if (existing) {
    await completeStep(step, attempt.id, existing.externalImageHash);
    return;
  }
  const bytes = await getBlobStore().readObject(asset.storageKey, maximumMediaBytes);
  const uploaded = await getMetaAdsGateway().uploadImage({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    bytes,
    filename: source.originalFileName ?? `${source.id}.jpg`,
    mimeType: asset.mimeType,
  });
  await getDatabase().metaMediaMapping.create({
    data: {
      organizationId: job.organizationId,
      adAccountId: job.configuration.adAccountId,
      campaignCreativeId: source.id,
      assetChecksum: asset.checksumSha256,
      externalImageHash: uploaded.hash,
      externalImageId: uploaded.id,
    },
  });
  await completeStep(step, attempt.id, uploaded.hash);
}

async function processAdSetStep(job: LoadedJob, step: LoadedStep, snapshot: MetaPublishSnapshot, accessToken: string) {
  const campaignMapping = await getDatabase().metaCampaignMapping.findFirst({
    where: { organizationId: job.organizationId, campaignId: job.campaignId },
  });
  if (!campaignMapping) throw new Error("Meta campaign mapping is unavailable.");
  const existing = await getDatabase().metaAdSetMapping.findFirst({
    where: { organizationId: job.organizationId, campaignMappingId: campaignMapping.id, localKey: step.localKey },
  });
  const attempt = await beginStep(step);
  if (existing) {
    await completeStep(step, attempt.id, existing.externalAdSetId);
    return;
  }
  const gateway = getMetaAdsGateway();
  const reconciled = await gateway.findObjectByMarker({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    type: "adsets",
    marker: step.publicationMarker,
  });
  const budget = budgetForMeta(snapshot);
  const externalId = reconciled ?? await gateway.createAdSet({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    name: `${snapshot.campaign.name} audience [${step.publicationMarker}]`,
    campaignExternalId: campaignMapping.externalCampaignId,
    budgetType: budget.type,
    budgetMinorUnits: budget.minorUnits,
    startTime: budget.startTime,
    endTime: budget.endTime,
    targeting: targetingForMeta(snapshot),
    optimizationGoal: snapshot.configuration.optimizationGoal ?? "IMPRESSIONS",
    promotedObject: promotedObject(snapshot),
  });
  await getDatabase().metaAdSetMapping.create({
    data: {
      organizationId: job.organizationId,
      campaignMappingId: campaignMapping.id,
      localKey: step.localKey,
      externalAdSetId: externalId,
    },
  });
  await completeStep(step, attempt.id, externalId);
}

async function processCreativeStep(job: LoadedJob, step: LoadedStep, snapshot: MetaPublishSnapshot, accessToken: string) {
  const { ad, source, asset } = await loadCampaignCreativeAsset(job, step.localKey);
  const media = await getDatabase().metaMediaMapping.findFirst({
    where: {
      organizationId: job.organizationId,
      adAccountId: job.configuration.adAccountId,
      campaignCreativeId: source.id,
      assetChecksum: asset.checksumSha256,
    },
  });
  if (!media) throw new Error("Meta image mapping is unavailable.");
  const existing = await getDatabase().metaCreativeMapping.findFirst({
    where: { organizationId: job.organizationId, campaignMetaAdId: ad.id },
  });
  const attempt = await beginStep(step);
  if (existing) {
    await completeStep(step, attempt.id, existing.externalCreativeId);
    return;
  }
  const gateway = getMetaAdsGateway();
  const reconciled = await gateway.findObjectByMarker({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    type: "adcreatives",
    marker: step.publicationMarker,
  });
  const externalId = reconciled ?? await gateway.createCreative({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    name: `${snapshot.campaign.name} creative [${step.publicationMarker}]`,
    pageExternalId: snapshot.page.externalId,
    instagramExternalId: snapshot.instagramAccount?.externalId,
    imageHash: media.externalImageHash,
    message: ad.primaryText,
    headline: ad.headline ?? undefined,
    description: ad.description ?? undefined,
    destinationUrl: ad.destinationUrl,
    callToAction: ad.callToAction,
  });
  await getDatabase().metaCreativeMapping.create({
    data: {
      organizationId: job.organizationId,
      campaignMetaAdId: ad.id,
      mediaMappingId: media.id,
      externalCreativeId: externalId,
    },
  });
  await completeStep(step, attempt.id, externalId);
}

async function processAdStep(job: LoadedJob, step: LoadedStep, snapshot: MetaPublishSnapshot, accessToken: string) {
  const ad = await getDatabase().campaignMetaAd.findFirst({
    where: { id: step.localKey, organizationId: job.organizationId, configurationId: job.configurationId },
  });
  if (!ad) throw new Error("The configured Meta ad is unavailable.");
  const campaignMapping = await getDatabase().metaCampaignMapping.findFirst({
    where: { organizationId: job.organizationId, campaignId: job.campaignId },
    include: { adSets: { where: { localKey: "primary" }, take: 1 } },
  });
  const creative = await getDatabase().metaCreativeMapping.findFirst({
    where: { organizationId: job.organizationId, campaignMetaAdId: ad.id },
  });
  if (!campaignMapping?.adSets[0] || !creative) throw new Error("Meta ad dependencies are unavailable.");
  const existing = await getDatabase().metaAdMapping.findFirst({
    where: { organizationId: job.organizationId, campaignMetaAdId: ad.id },
  });
  const attempt = await beginStep(step);
  if (existing) {
    await completeStep(step, attempt.id, existing.externalAdId);
    return;
  }
  const gateway = getMetaAdsGateway();
  const reconciled = await gateway.findObjectByMarker({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    type: "ads",
    marker: step.publicationMarker,
  });
  const externalId = reconciled ?? await gateway.createAd({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    name: `${snapshot.campaign.name} ad ${ad.position + 1} [${step.publicationMarker}]`,
    adSetExternalId: campaignMapping.adSets[0].externalAdSetId,
    creativeExternalId: creative.externalCreativeId,
  });
  await getDatabase().metaAdMapping.create({
    data: {
      organizationId: job.organizationId,
      campaignMetaAdId: ad.id,
      adSetMappingId: campaignMapping.adSets[0].id,
      creativeMappingId: creative.id,
      externalAdId: externalId,
    },
  });
  await completeStep(step, attempt.id, externalId);
}

async function processStep(job: LoadedJob, step: LoadedStep, snapshot: MetaPublishSnapshot, accessToken: string) {
  switch (step.type) {
    case MetaPublishStepType.CAMPAIGN:
      return processCampaignStep(job, step, snapshot, accessToken);
    case MetaPublishStepType.MEDIA:
      return processMediaStep(job, step, snapshot, accessToken);
    case MetaPublishStepType.AD_SET:
      return processAdSetStep(job, step, snapshot, accessToken);
    case MetaPublishStepType.CREATIVE:
      return processCreativeStep(job, step, snapshot, accessToken);
    case MetaPublishStepType.AD:
      return processAdStep(job, step, snapshot, accessToken);
    case MetaPublishStepType.STATUS_SYNC:
      return;
  }
}

function safeFailure(error: unknown) {
  if (error instanceof MetaApiError) {
    return {
      code: error.code ?? (error.ambiguous ? "AMBIGUOUS_META_CREATE" : "META_API_FAILURE"),
      message: error.ambiguous
        ? "Meta may have accepted the request; reconciliation is required before retrying."
        : "Meta could not complete the publishing step.",
      traceId: error.traceId,
      subcode: error.subcode,
      httpStatus: error.httpStatus,
      retryAfterSeconds: error.retryAfterSeconds,
      retryable: error.retryable,
      ambiguous: error.ambiguous,
    };
  }
  return {
    code: "PUBLISH_SAFETY_FAILURE",
    message: error instanceof Error ? error.message.slice(0, 500) : "Meta publishing stopped safely.",
    retryable: false,
    ambiguous: false,
  };
}

async function failStepAndJob(job: LoadedJob, step: LoadedStep, error: unknown) {
  const failure = safeFailure(error);
  const status = failure.ambiguous
    ? MetaPublishStepStatus.AMBIGUOUS
    : failure.retryable
      ? MetaPublishStepStatus.RETRYABLE_FAILED
      : MetaPublishStepStatus.TERMINAL_FAILED;
  const attempt = await getDatabase().metaPublishAttempt.findFirst({
    where: { stepId: step.id, organizationId: job.organizationId },
    orderBy: { attemptNumber: "desc" },
  });
  const now = new Date();
  await getDatabase().$transaction([
    getDatabase().metaPublishStep.update({
      where: { id: step.id },
      data: { status, errorCode: failure.code, errorMessage: failure.message },
    }),
    ...(attempt ? [getDatabase().metaPublishAttempt.update({
      where: { id: attempt.id },
      data: {
        status,
        providerTraceId: failure.traceId,
        httpStatus: failure.httpStatus,
        errorCode: failure.code,
        errorSubcode: failure.subcode,
        errorMessage: failure.message,
        retryAfterSeconds: failure.retryAfterSeconds,
        completedAt: now,
      },
    })] : []),
    getDatabase().metaPublishJob.update({
      where: { id: job.id },
      data: failure.ambiguous
        ? {
            status: MetaPublishJobStatus.RECONCILIATION_REQUIRED,
            errorCode: failure.code,
            errorMessage: failure.message,
            lockedAt: null,
            lockedBy: null,
            leaseExpiresAt: null,
          }
        : failure.retryable && job.attemptCount < job.maxAttempts
          ? {
              status: MetaPublishJobStatus.RETRY_SCHEDULED,
              availableAt: new Date(now.getTime() + (failure.retryAfterSeconds ?? 30) * 1_000),
              errorCode: failure.code,
              errorMessage: failure.message,
              lockedAt: null,
              lockedBy: null,
              leaseExpiresAt: null,
            }
          : {
              status: MetaPublishJobStatus.FAILED,
              failedAt: now,
              errorCode: failure.code,
              errorMessage: failure.message,
              lockedAt: null,
              lockedBy: null,
              leaseExpiresAt: null,
            },
    }),
    getDatabase().campaignMetaConfiguration.update({
      where: { id: job.configurationId },
      data: {
        status: failure.ambiguous
          ? "RECONCILIATION_REQUIRED"
          : failure.retryable && job.attemptCount < job.maxAttempts
            ? "QUEUED"
            : "PARTIALLY_PUBLISHED",
      },
    }),
  ]);
}

export async function processNextMetaPublishJob(workerId = `meta-${randomUUID()}`) {
  const claim = await claimNextJob(workerId);
  if (!claim) return { processed: false as const };
  const job = await loadJob(claim.id, claim.organizationId);
  if (!job) return { processed: false as const };

  try {
    const snapshot = await assertPublishAuthorization(job);
    const { accessToken } = await getMetaConnectionWithToken(job.organizationId, job.configuration.connectionId);
    await getDatabase().campaignMetaConfiguration.update({
      where: { id: job.configurationId },
      data: { status: "PUBLISHING" },
    });
    for (const step of job.steps) {
      if (step.status === MetaPublishStepStatus.SUCCEEDED) continue;
      if (step.status === MetaPublishStepStatus.AMBIGUOUS) {
        throw new MetaApiError({ message: "Reconciliation is required.", ambiguous: true });
      }
      try {
        await processStep(job, step, snapshot, accessToken);
      } catch (error) {
        await failStepAndJob(job, step, error);
        return { processed: true as const, jobId: job.id, completed: false };
      }
    }
    const now = new Date();
    await getDatabase().$transaction([
      getDatabase().metaPublishJob.update({
        where: { id: job.id },
        data: {
          status: MetaPublishJobStatus.SUCCEEDED,
          completedAt: now,
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
        },
      }),
      getDatabase().campaignMetaConfiguration.update({
        where: { id: job.configurationId },
        data: { status: "PUBLISHED_PAUSED", lastPublishedAt: now },
      }),
    ]);
    await recordMetaAuditEvent({
      organizationId: job.organizationId,
      actorUserId: job.initiatedById,
      action: "META_PUBLISHED_PAUSED",
      entityType: "MetaPublishJob",
      entityId: job.id,
      metadata: { mode: "PAUSED" },
    });
    return { processed: true as const, jobId: job.id, completed: true };
  } catch (error) {
    const pending = job.steps.find((step) => step.status !== MetaPublishStepStatus.SUCCEEDED);
    if (pending) await failStepAndJob(job, pending, error);
    return { processed: true as const, jobId: job.id, completed: false };
  }
}

export async function reconcileMetaPublishJob(organizationId: string, jobId: string) {
  const job = await loadJob(jobId, organizationId);
  if (!job || job.status !== MetaPublishJobStatus.RECONCILIATION_REQUIRED) return false;
  const snapshot = await assertPublishAuthorization(job);
  const { accessToken } = await getMetaConnectionWithToken(organizationId, job.configuration.connectionId);
  const step = job.steps.find((item) => item.status === MetaPublishStepStatus.AMBIGUOUS);
  if (!step || step.type === MetaPublishStepType.MEDIA) return false;
  let type: "campaigns" | "adsets" | "adcreatives" | "ads" | undefined;
  if (step.type === MetaPublishStepType.CAMPAIGN) type = "campaigns";
  if (step.type === MetaPublishStepType.AD_SET) type = "adsets";
  if (step.type === MetaPublishStepType.CREATIVE) type = "adcreatives";
  if (step.type === MetaPublishStepType.AD) type = "ads";
  if (!type) return false;
  const externalId = await getMetaAdsGateway().findObjectByMarker({
    accessToken,
    adAccountExternalId: snapshot.adAccount.externalId,
    type,
    marker: step.publicationMarker,
  });
  if (!externalId) return false;
  await getDatabase().metaPublishStep.update({
    where: { id: step.id },
    data: { status: MetaPublishStepStatus.PENDING, externalId, errorCode: null, errorMessage: null },
  });
  await getDatabase().metaPublishJob.update({
    where: { id: job.id },
    data: { status: MetaPublishJobStatus.QUEUED, availableAt: new Date(), errorCode: null, errorMessage: null },
  });
  return true;
}

export async function synchronizeMetaPublicationStatus(organizationId: string, campaignId: string) {
  const mapping = await getDatabase().metaCampaignMapping.findFirst({
    where: { organizationId, campaignId },
    include: { configuration: true, adSets: { include: { ads: true } } },
  });
  if (!mapping) return false;
  const { accessToken } = await getMetaConnectionWithToken(organizationId, mapping.configuration.connectionId);
  const gateway = getMetaAdsGateway();
  const now = new Date();
  const campaignStatus = await gateway.getObjectStatus({ accessToken, externalId: mapping.externalCampaignId });
  await getDatabase().metaCampaignMapping.update({
    where: { id: mapping.id },
    data: {
      configuredStatus: campaignStatus.configuredStatus,
      effectiveStatus: campaignStatus.effectiveStatus,
      lastSyncedAt: now,
    },
  });
  for (const adSet of mapping.adSets) {
    const status = await gateway.getObjectStatus({ accessToken, externalId: adSet.externalAdSetId });
    await getDatabase().metaAdSetMapping.update({
      where: { id: adSet.id },
      data: { configuredStatus: status.configuredStatus, effectiveStatus: status.effectiveStatus, lastSyncedAt: now },
    });
    for (const ad of adSet.ads) {
      const adStatus = await gateway.getObjectStatus({ accessToken, externalId: ad.externalAdId });
      await getDatabase().metaAdMapping.update({
        where: { id: ad.id },
        data: {
          configuredStatus: adStatus.configuredStatus,
          effectiveStatus: adStatus.effectiveStatus,
          reviewFeedback: adStatus.reviewFeedback as Prisma.InputJsonValue | undefined,
          lastSyncedAt: now,
        },
      });
    }
  }
  return true;
}
