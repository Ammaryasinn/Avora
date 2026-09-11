import "server-only";

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import {
  AICapability,
  AIJobAttemptStatus,
  AIJobStatus,
  CreativeAssetKind,
  CreativeAssetRole,
  CreativeAssetStatus,
  CreativeStatus,
  CreativeVariantOrigin,
  CreativeVariantStatus,
  ModerationStatus,
} from "@/generated/prisma/enums";
import type { GeneratedImage } from "@/lib/ai/contracts";
import { FalVirtualTryOnProvider } from "@/lib/ai/fal-provider";
import { OpenAIProvider, createSafetyIdentifier } from "@/lib/ai/openai-provider";
import { getDatabase } from "@/lib/db/database";
import {
  checksumSha256,
  maximumImageBytes,
  validateImageBytes,
} from "@/lib/storage/image-validation";
import { getBlobStore } from "@/lib/storage/r2-object-storage";

import { deleteExpiredPersonReferences } from "./assets";
import { creativeJobInputSchema } from "./job-input";
import { reconcileJobBudget } from "./jobs";

const leaseDurationMs = 2 * 60_000;
const openAI = new OpenAIProvider();
const falVirtualTryOn = new FalVirtualTryOnProvider();

function retryDelay(attempt: number) {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

async function claimNextJob(workerId: string) {
  const database = getDatabase();

  return database.$transaction(
    async (transaction) => {
      const now = new Date();
      const candidate = await transaction.aIJob.findFirst({
        where: {
          status: {
            in: [
              AIJobStatus.QUEUED,
              AIJobStatus.PENDING,
              AIJobStatus.RETRY_SCHEDULED,
              AIJobStatus.RUNNING,
            ],
          },
          availableAt: { lte: now },
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, organizationId: true, status: true },
      });

      if (!candidate) {
        return null;
      }

      const claimed = await transaction.aIJob.updateMany({
        where: {
          id: candidate.id,
          organizationId: candidate.organizationId,
          status: candidate.status,
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          status: AIJobStatus.RUNNING,
          lockedAt: now,
          lockedBy: workerId,
          leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
          startedAt: now,
        },
      });

      return claimed.count === 1
        ? { id: candidate.id, organizationId: candidate.organizationId }
        : null;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function getSourceImage(input: {
  organizationId: string;
  productMediaId?: string;
  sourceAssetId?: string;
}) {
  const database = getDatabase();

  if (input.sourceAssetId) {
    const asset = await database.creativeAsset.findFirst({
      where: {
        id: input.sourceAssetId,
        organizationId: input.organizationId,
        status: CreativeAssetStatus.READY,
        deletedAt: null,
      },
      select: { storageKey: true, mimeType: true },
    });

    if (!asset?.mimeType) {
      throw new Error("The source creative asset is unavailable.");
    }

    const bytes = await getBlobStore().readObject(asset.storageKey, maximumImageBytes);
    validateImageBytes(bytes, asset.mimeType);
    return {
      image: { bytes, contentType: asset.mimeType as GeneratedImage["contentType"] },
      moderationUrl: await getBlobStore().createDownloadUrl({ key: asset.storageKey, expiresInSeconds: 5 * 60 }),
    };
  }

  if (!input.productMediaId) {
    throw new Error("A ready product image is required.");
  }

  const media = await database.productMedia.findFirst({
    where: {
      id: input.productMediaId,
      organizationId: input.organizationId,
      uploadStatus: "READY",
    },
    select: { storageKey: true, mimeType: true },
  });

  if (!media?.storageKey || !media.mimeType) {
    throw new Error("The product image is unavailable.");
  }

  const bytes = await getBlobStore().readObject(media.storageKey, maximumImageBytes);
  validateImageBytes(bytes, media.mimeType);
  return {
    image: { bytes, contentType: media.mimeType as GeneratedImage["contentType"] },
    moderationUrl: await getBlobStore().createDownloadUrl({ key: media.storageKey, expiresInSeconds: 5 * 60 }),
  };
}

function assertFalMediaUrl(value: string) {
  const url = new URL(value);
  const allowed =
    url.protocol === "https:" &&
    (url.hostname === "fal.media" ||
      url.hostname.endsWith(".fal.media") ||
      url.hostname.endsWith(".fal.ai") ||
      url.hostname.endsWith(".fal.run"));

  if (!allowed) {
    throw new Error("The provider returned an unsupported asset URL.");
  }

  return url.toString();
}

async function downloadProviderImage(value: string): Promise<GeneratedImage> {
  const response = await fetch(assertFalMediaUrl(value), {
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error("The provider output could not be downloaded.");
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);

  if (contentLength > maximumImageBytes) {
    throw new Error("The provider output exceeds Avora's size limit.");
  }

  const contentType = response.headers.get("content-type")?.split(";")[0];

  if (
    contentType !== "image/jpeg" &&
    contentType !== "image/png" &&
    contentType !== "image/webp"
  ) {
    throw new Error("The provider output has an unsupported image type.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  validateImageBytes(bytes, contentType);
  return { bytes, contentType };
}

async function storeGeneratedImage(input: {
  job: { id: string; organizationId: string; creativeId: string };
  attemptId: string;
  variantId: string;
  image: GeneratedImage;
  position: number;
}) {
  const storage = getBlobStore();
  const assetId = randomUUID();
  const extension = input.image.contentType === "image/png" ? "png" : input.image.contentType === "image/jpeg" ? "jpg" : "webp";
  const storageKey = `organizations/${input.job.organizationId}/creatives/${input.job.creativeId}/generated/${assetId}.${extension}`;

  await storage.putObject({
    key: storageKey,
    body: input.image.bytes,
    contentType: input.image.contentType,
    metadata: { "avora-job-id": input.job.id },
  });

  const asset = await getDatabase().creativeAsset.create({
    data: {
      id: assetId,
      organizationId: input.job.organizationId,
      creativeId: input.job.creativeId,
      variantId: input.variantId,
      generatedByAttemptId: input.attemptId,
      kind: CreativeAssetKind.IMAGE,
      role: CreativeAssetRole.GENERATED,
      status: CreativeAssetStatus.PROCESSING,
      storageProvider: storage.provider,
      bucket: storage.bucket,
      storageKey,
      mimeType: input.image.contentType,
      fileSizeBytes: BigInt(input.image.bytes.byteLength),
      checksumSha256: checksumSha256(input.image.bytes),
      metadata: input.image.revisedPrompt
        ? { revisedPrompt: input.image.revisedPrompt, position: input.position }
        : { position: input.position },
    },
  });

  try {
    const signedUrl = await storage.createDownloadUrl({ key: storageKey, expiresInSeconds: 5 * 60 });
    const moderation = await openAI.moderateImage(signedUrl);

    if (!moderation.allowed) {
      await storage.deleteObject(storageKey).catch(() => undefined);
      await getDatabase().creativeAsset.update({
        where: { id: asset.id },
        data: { status: CreativeAssetStatus.QUARANTINED, deletedAt: new Date() },
      });
      return null;
    }

    return getDatabase().creativeAsset.update({
      where: { id: asset.id },
      data: { status: CreativeAssetStatus.READY },
    });
  } catch (error) {
    await storage.deleteObject(storageKey).catch(() => undefined);
    await getDatabase().creativeAsset.update({
      where: { id: asset.id },
      data: { status: CreativeAssetStatus.FAILED, deletedAt: new Date() },
    });
    throw error;
  }
}

async function createTextVariants(job: Awaited<ReturnType<typeof loadJob>>, attemptId: string) {
  if (!job) return;
  const input = creativeJobInputSchema.parse(job.input);
  const moderation = await openAI.moderateText(input.prompt);

  if (!moderation.allowed) {
    await getDatabase().aIJob.update({ where: { id: job.id }, data: { moderationStatus: ModerationStatus.BLOCKED } });
    throw new Error("The request was blocked by content safety checks.");
  }

  const result = await openAI.generateText({
    prompt: input.prompt,
    safetyIdentifier: createSafetyIdentifier(job.organizationId, job.createdById),
    variantCount: job.requestedVariantCount,
  });

  await getDatabase().$transaction(async (transaction) => {
    for (const [position, content] of result.variants.entries()) {
      await transaction.creativeVariant.create({
        data: {
          organizationId: job.organizationId,
          creativeId: job.creativeId,
          sourceJobId: job.id,
          createdById: job.createdById,
          name: `Copy ${position + 1}`,
          origin: CreativeVariantOrigin.AI_GENERATED,
          status: CreativeVariantStatus.READY,
          position,
          content,
        },
      });
    }
    await transaction.aIJobAttempt.update({
      where: { id: attemptId },
      data: {
        status: AIJobAttemptStatus.SUCCEEDED,
        providerRequestId: result.providerRequestId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        usage: result.usage as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    await transaction.aIJob.update({ where: { id: job.id }, data: { moderationStatus: ModerationStatus.PASSED } });
  });
}

async function createImageVariants(job: NonNullable<Awaited<ReturnType<typeof loadJob>>>, attemptId: string) {
  const input = creativeJobInputSchema.parse(job.input);
  const promptModeration = await openAI.moderateText(input.prompt);

  if (!promptModeration.allowed) {
    await getDatabase().aIJob.update({ where: { id: job.id }, data: { moderationStatus: ModerationStatus.BLOCKED } });
    throw new Error("The request was blocked by content safety checks.");
  }

  const safetyIdentifier = createSafetyIdentifier(job.organizationId, job.createdById);
  let result;

  if (job.capability === AICapability.EDIT_IMAGE) {
    const source = await getSourceImage({
      organizationId: job.organizationId,
      productMediaId: input.productMediaId,
      sourceAssetId: input.sourceAssetId,
    });
    const sourceModeration = await openAI.moderateImage(source.moderationUrl);

    if (!sourceModeration.allowed) {
      await getDatabase().aIJob.update({ where: { id: job.id }, data: { moderationStatus: ModerationStatus.BLOCKED } });
      throw new Error("The source image was blocked by content safety checks.");
    }

    result = await openAI.editImage({
      prompt: input.prompt,
      safetyIdentifier,
      source: source.image,
      variantCount: job.requestedVariantCount,
      aspectRatio: input.aspectRatio,
    });
  } else {
    result = await openAI.generateImage({
      prompt: input.prompt,
      safetyIdentifier,
      variantCount: job.requestedVariantCount,
      aspectRatio: input.aspectRatio,
    });
  }

  let storedCount = 0;
  for (const [position, image] of result.images.entries()) {
    const variant = await getDatabase().creativeVariant.create({
      data: {
        organizationId: job.organizationId,
        creativeId: job.creativeId,
        sourceJobId: job.id,
        createdById: job.createdById,
        name: `Visual ${position + 1}`,
        origin: CreativeVariantOrigin.AI_GENERATED,
        status: CreativeVariantStatus.DRAFT,
        position,
        content: { prompt: input.prompt },
      },
    });
    const asset = await storeGeneratedImage({ job, attemptId, variantId: variant.id, image, position });

    if (asset) {
      storedCount += 1;
      await getDatabase().creativeVariant.update({
        where: { id: variant.id },
        data: { status: CreativeVariantStatus.READY },
      });
    } else {
      await getDatabase().creativeVariant.update({
        where: { id: variant.id },
        data: { status: CreativeVariantStatus.REJECTED },
      });
    }
  }

  if (storedCount === 0) {
    throw new Error("No generated images passed content safety checks.");
  }

  await getDatabase().aIJobAttempt.update({
    where: { id: attemptId },
    data: {
      status: AIJobAttemptStatus.SUCCEEDED,
      imageCount: storedCount,
      usage: result.usage as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
  await getDatabase().aIJob.update({ where: { id: job.id }, data: { moderationStatus: ModerationStatus.PASSED } });
}

async function getVirtualTryOnUrls(job: NonNullable<Awaited<ReturnType<typeof loadJob>>>) {
  const input = creativeJobInputSchema.parse(job.input);

  if (!input.productMediaId || !input.personAssetId) {
    throw new Error("Product and consented person images are required for virtual try-on.");
  }

  const [product, person] = await Promise.all([
    getDatabase().productMedia.findFirst({
      where: { id: input.productMediaId, organizationId: job.organizationId, uploadStatus: "READY" },
      select: { storageKey: true },
    }),
    getDatabase().creativeAsset.findFirst({
      where: {
        id: input.personAssetId,
        organizationId: job.organizationId,
        creativeId: job.creativeId,
        role: CreativeAssetRole.PERSON_REFERENCE,
        status: CreativeAssetStatus.READY,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { storageKey: true },
    }),
  ]);

  if (!product?.storageKey || !person) {
    throw new Error("A required virtual try-on reference is unavailable.");
  }

  const storage = getBlobStore();
  return {
    input,
    productImageUrl: await storage.createDownloadUrl({ key: product.storageKey, expiresInSeconds: 10 * 60 }),
    personImageUrl: await storage.createDownloadUrl({ key: person.storageKey, expiresInSeconds: 10 * 60 }),
  };
}

async function processVirtualTryOn(job: NonNullable<Awaited<ReturnType<typeof loadJob>>>, attemptId: string) {
  const attempt = job.attempts.find((item) => item.id === attemptId);

  if (attempt?.providerRequestId) {
    const result = await falVirtualTryOn.pollVirtualTryOn(attempt.providerRequestId);

    if (result.state !== "completed") {
      await releaseForProviderPolling(job.id, attemptId, result.providerStatus);
      return false;
    }

    if (result.outputUrls.length === 0) {
      throw new Error("fal.ai completed without a usable output image.");
    }

    let storedCount = 0;
    for (const [position, outputUrl] of result.outputUrls.entries()) {
      const image = await downloadProviderImage(outputUrl);
      const variant = await getDatabase().creativeVariant.create({
        data: {
          organizationId: job.organizationId,
          creativeId: job.creativeId,
          sourceJobId: job.id,
          createdById: job.createdById,
          name: `Try-on ${position + 1}`,
          origin: CreativeVariantOrigin.AI_GENERATED,
          status: CreativeVariantStatus.DRAFT,
          position,
          content: { provider: "fal", requestId: attempt.providerRequestId },
        },
      });
      const asset = await storeGeneratedImage({ job, attemptId, variantId: variant.id, image, position });
      await getDatabase().creativeVariant.update({
        where: { id: variant.id },
        data: { status: asset ? CreativeVariantStatus.READY : CreativeVariantStatus.REJECTED },
      });
      if (asset) storedCount += 1;
    }

    if (storedCount === 0) {
      throw new Error("No virtual try-on images passed content safety checks.");
    }

    await getDatabase().aIJobAttempt.update({
      where: { id: attemptId },
      data: { status: AIJobAttemptStatus.SUCCEEDED, providerStatus: result.providerStatus, imageCount: storedCount, completedAt: new Date() },
    });
    await getDatabase().aIJob.update({ where: { id: job.id }, data: { moderationStatus: ModerationStatus.PASSED } });
    return true;
  }

  const urls = await getVirtualTryOnUrls(job);
  const moderation = await Promise.all([
    openAI.moderateImage(urls.productImageUrl),
    openAI.moderateImage(urls.personImageUrl),
  ]);

  if (moderation.some((result) => !result.allowed)) {
    await getDatabase().aIJob.update({ where: { id: job.id }, data: { moderationStatus: ModerationStatus.BLOCKED } });
    throw new Error("A virtual try-on reference was blocked by content safety checks.");
  }

  const request = await falVirtualTryOn.generateVirtualTryOn({
    productImageUrl: urls.productImageUrl,
    personImageUrl: urls.personImageUrl,
    category: urls.input.virtualTryOnCategory ?? "tops",
    webhookUrl: process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, "")}/api/webhooks/fal`
      : undefined,
  });
  await getDatabase().aIJobAttempt.update({
    where: { id: attemptId },
    data: {
      providerRequestId: request.providerRequestId,
      providerStatus: request.providerStatus,
      status: AIJobAttemptStatus.QUEUED,
    },
  });
  await releaseForProviderPolling(job.id, attemptId, request.providerStatus);
  return false;
}

async function releaseForProviderPolling(jobId: string, attemptId: string, providerStatus: string) {
  await getDatabase().$transaction([
    getDatabase().aIJob.update({
      where: { id: jobId },
      data: {
        status: AIJobStatus.QUEUED,
        availableAt: new Date(Date.now() + 15_000),
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
      },
    }),
    getDatabase().aIJobAttempt.update({
      where: { id: attemptId },
      data: { providerStatus, status: AIJobAttemptStatus.QUEUED },
    }),
  ]);
}

async function loadJob(jobId: string, organizationId: string) {
  return getDatabase().aIJob.findFirst({
    where: { id: jobId, organizationId },
    include: { attempts: { orderBy: { attemptNumber: "desc" } } },
  });
}

async function getOrCreateAttempt(job: NonNullable<Awaited<ReturnType<typeof loadJob>>>) {
  const queued = job.attempts.find(
    (attempt) => attempt.status === AIJobAttemptStatus.QUEUED && attempt.providerRequestId,
  );

  if (queued) return queued;

  if (job.attemptCount >= job.maxAttempts) {
    throw new Error("The AI job exhausted its retry limit.");
  }

  const provider = job.capability === AICapability.GENERATE_VIRTUAL_TRY_ON ? falVirtualTryOn : openAI;
  const attemptNumber = job.attemptCount + 1;

  return getDatabase().$transaction(async (transaction) => {
    await transaction.aIJob.update({ where: { id: job.id }, data: { attemptCount: attemptNumber } });
    return transaction.aIJobAttempt.create({
      data: {
        organizationId: job.organizationId,
        jobId: job.id,
        attemptNumber,
        providerKey: provider.providerKey,
        modelId: provider.modelId,
        requestMetadata: {
          capability: job.capability,
          promptTemplateKey: job.promptTemplateKey,
          promptTemplateVersion: job.promptTemplateVersion,
        },
      },
    });
  });
}

async function markSuccess(job: NonNullable<Awaited<ReturnType<typeof loadJob>>>) {
  await getDatabase().aIJobAttempt.updateMany({
    where: {
      jobId: job.id,
      organizationId: job.organizationId,
      status: AIJobAttemptStatus.SUCCEEDED,
      cost: new Prisma.Decimal(0),
    },
    data: {
      cost: job.reservedCost,
      costSource: "AVORA_ESTIMATED",
    },
  });
  await reconcileJobBudget({
    jobId: job.id,
    organizationId: job.organizationId,
    actualCost: job.reservedCost,
    terminalStatus: AIJobStatus.SUCCEEDED,
  });
  await getDatabase().creative.updateMany({
    where: { id: job.creativeId, organizationId: job.organizationId },
    data: { status: CreativeStatus.IN_REVIEW },
  });
}

async function handleFailure(job: NonNullable<Awaited<ReturnType<typeof loadJob>>>, attemptId: string | undefined, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 1_000) : "AI generation failed.";

  if (attemptId) {
    await getDatabase().aIJobAttempt.update({
      where: { id: attemptId },
      data: { status: AIJobAttemptStatus.FAILED, errorCode: "PROVIDER_FAILURE", errorMessage: message, completedAt: new Date() },
    }).catch(() => undefined);
  }

  const current = await getDatabase().aIJob.findFirst({
    where: { id: job.id, organizationId: job.organizationId },
    select: { attemptCount: true, maxAttempts: true, moderationStatus: true },
  });
  const terminal = !current || current.attemptCount >= current.maxAttempts || current.moderationStatus === ModerationStatus.BLOCKED;

  if (terminal) {
    await reconcileJobBudget({
      jobId: job.id,
      organizationId: job.organizationId,
      actualCost: new Prisma.Decimal(0),
      terminalStatus: AIJobStatus.FAILED,
      errorCode: current?.moderationStatus === ModerationStatus.BLOCKED ? "MODERATION_BLOCKED" : "PROVIDER_FAILURE",
      errorMessage: message,
    });
    await getDatabase().creative.updateMany({
      where: { id: job.creativeId, organizationId: job.organizationId },
      data: { status: CreativeStatus.DRAFT },
    });
    return;
  }

  await getDatabase().aIJob.updateMany({
    where: { id: job.id, organizationId: job.organizationId },
    data: {
      status: AIJobStatus.RETRY_SCHEDULED,
      availableAt: new Date(Date.now() + retryDelay(current.attemptCount)),
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      errorCode: "RETRY_SCHEDULED",
      errorMessage: message,
    },
  });
}

export async function processNextAIJob(workerId = `web-${randomUUID()}`) {
  await deleteExpiredPersonReferences().catch(() => undefined);
  const claim = await claimNextJob(workerId);

  if (!claim) return { processed: false as const };

  const job = await loadJob(claim.id, claim.organizationId);

  if (!job) return { processed: false as const };

  let attemptId: string | undefined;

  try {
    const attempt = await getOrCreateAttempt(job);
    attemptId = attempt.id;
    const refreshedJob = await loadJob(job.id, job.organizationId);

    if (!refreshedJob) throw new Error("The claimed AI job no longer exists.");

    let completed = true;
    switch (refreshedJob.capability) {
      case AICapability.GENERATE_TEXT:
        await createTextVariants(refreshedJob, attempt.id);
        break;
      case AICapability.GENERATE_IMAGE:
      case AICapability.EDIT_IMAGE:
        await createImageVariants(refreshedJob, attempt.id);
        break;
      case AICapability.GENERATE_VIRTUAL_TRY_ON:
        completed = await processVirtualTryOn(refreshedJob, attempt.id);
        break;
      case AICapability.GENERATE_VIDEO:
        throw new Error("Video generation is not enabled in Milestone 2A.");
    }

    if (completed) await markSuccess(refreshedJob);
    return { processed: true as const, jobId: job.id, completed };
  } catch (error) {
    await handleFailure(job, attemptId, error);
    return { processed: true as const, jobId: job.id, completed: false };
  }
}
