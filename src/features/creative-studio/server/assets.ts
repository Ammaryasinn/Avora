import "server-only";

import { randomUUID } from "node:crypto";

import {
  CreativeAssetKind,
  CreativeAssetRole,
  CreativeAssetStatus,
} from "@/generated/prisma/enums";
import { getAIConfiguration } from "@/lib/ai/config";
import { getDatabase } from "@/lib/db/database";
import { getBlobStore } from "@/lib/storage/r2-object-storage";
import {
  checksumSha256,
  extensionForContentType,
  isAcceptedImageType,
  maximumImageBytes,
  validateImageBytes,
} from "@/lib/storage/image-validation";

export async function createCreativeAssetUploadIntent(input: {
  organizationId: string;
  creativeId: string;
  role: "PERSON_REFERENCE";
  fileName: string;
  contentType: string;
  fileSize: number;
  consentAcknowledged: boolean;
}) {
  if (!input.consentAcknowledged) {
    throw new Error("Consent acknowledgement is required for person images.");
  }

  if (!isAcceptedImageType(input.contentType)) {
    throw new Error("Only JPEG, PNG, and WebP reference images are supported.");
  }

  if (input.fileSize <= 0 || input.fileSize > maximumImageBytes) {
    throw new Error("Reference images must be 10 MB or smaller.");
  }

  const database = getDatabase();
  const creative = await database.creative.findFirst({
    where: {
      id: input.creativeId,
      organizationId: input.organizationId,
      archivedAt: null,
    },
    select: { id: true, type: true },
  });

  if (!creative || creative.type !== "VIRTUAL_TRY_ON") {
    throw new Error("A virtual try-on creative was not found.");
  }

  const settings = await database.organizationAISettings.findUnique({
    where: { organizationId: input.organizationId },
    select: { personRetentionDays: true },
  });
  const retentionDays =
    settings?.personRetentionDays ??
    Math.floor(getAIConfiguration().defaults.personRetentionDays);
  const assetId = randomUUID();
  const extension = extensionForContentType(input.contentType);
  const storage = getBlobStore();
  const storageKey = `organizations/${input.organizationId}/creatives/${creative.id}/person-references/${assetId}.${extension}`;
  const expiresAt = new Date(Date.now() + retentionDays * 86_400_000);

  const asset = await database.creativeAsset.create({
    data: {
      id: assetId,
      organizationId: input.organizationId,
      creativeId: creative.id,
      kind: CreativeAssetKind.IMAGE,
      role: CreativeAssetRole.PERSON_REFERENCE,
      status: CreativeAssetStatus.PENDING_UPLOAD,
      storageProvider: storage.provider,
      bucket: storage.bucket,
      storageKey,
      originalFileName: input.fileName.slice(0, 240),
      mimeType: input.contentType,
      fileSizeBytes: BigInt(input.fileSize),
      expiresAt,
      metadata: {
        consentAcknowledged: true,
        consentAcknowledgedAt: new Date().toISOString(),
      },
    },
    select: { id: true, expiresAt: true },
  });
  const upload = await storage.createUploadIntent({
    key: storageKey,
    contentType: input.contentType,
    contentLength: input.fileSize,
    expiresInSeconds: 5 * 60,
  });

  return {
    assetId: asset.id,
    uploadUrl: upload.uploadUrl,
    headers: upload.headers,
    uploadExpiresAt: upload.expiresAt.toISOString(),
    retentionExpiresAt: asset.expiresAt?.toISOString(),
  };
}

export async function completeCreativeAssetUpload(input: {
  organizationId: string;
  assetId: string;
}) {
  const database = getDatabase();
  const asset = await database.creativeAsset.findFirst({
    where: {
      id: input.assetId,
      organizationId: input.organizationId,
      status: CreativeAssetStatus.PENDING_UPLOAD,
    },
    select: { id: true, storageKey: true, mimeType: true },
  });

  if (!asset?.mimeType) {
    throw new Error("Pending creative asset was not found.");
  }

  const storage = getBlobStore();

  try {
    const metadata = await storage.headObject(asset.storageKey);

    if (
      metadata.contentLength <= 0 ||
      metadata.contentLength > maximumImageBytes ||
      metadata.contentType !== asset.mimeType
    ) {
      throw new Error("Uploaded reference metadata is invalid.");
    }

    const bytes = await storage.readObject(asset.storageKey, maximumImageBytes);
    validateImageBytes(bytes, asset.mimeType);

    return database.creativeAsset.update({
      where: { id: asset.id },
      data: {
        status: CreativeAssetStatus.READY,
        fileSizeBytes: BigInt(bytes.byteLength),
        checksumSha256: checksumSha256(bytes),
      },
      select: { id: true, expiresAt: true },
    });
  } catch (error) {
    await database.creativeAsset.update({
      where: { id: asset.id },
      data: { status: CreativeAssetStatus.FAILED },
    });
    await storage.deleteObject(asset.storageKey).catch(() => undefined);
    throw error;
  }
}

export async function deleteExpiredPersonReferences(limit = 25) {
  const database = getDatabase();
  const expired = await database.creativeAsset.findMany({
    where: {
      role: CreativeAssetRole.PERSON_REFERENCE,
      status: { in: [CreativeAssetStatus.READY, CreativeAssetStatus.FAILED] },
      expiresAt: { lte: new Date() },
      deletedAt: null,
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { id: true, organizationId: true, storageKey: true },
  });
  const storage = getBlobStore();

  for (const asset of expired) {
    await storage.deleteObject(asset.storageKey).catch(() => undefined);
    await database.creativeAsset.updateMany({
      where: {
        id: asset.id,
        organizationId: asset.organizationId,
        deletedAt: null,
      },
      data: {
        status: CreativeAssetStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  }

  return expired.length;
}
