import "server-only";

import { randomUUID } from "node:crypto";

import {
  CampaignCreativeSource,
  CampaignStatus,
} from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";
import {
  checksumSha256,
  extensionForContentType,
  isAcceptedImageType,
  maximumImageBytes,
  validateImageBytes,
} from "@/lib/storage/image-validation";
import { getBlobStore } from "@/lib/storage/r2-object-storage";

export async function createCampaignAssetUploadIntent(input: {
  organizationId: string;
  campaignId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}) {
  if (!isAcceptedImageType(input.contentType)) {
    throw new Error("Only JPEG, PNG, and WebP campaign images are supported.");
  }
  if (input.fileSize <= 0 || input.fileSize > maximumImageBytes) {
    throw new Error("Campaign images must be 10 MB or smaller.");
  }

  const campaign = await getDatabase().campaign.findFirst({
    where: {
      id: input.campaignId,
      organizationId: input.organizationId,
      status: { not: CampaignStatus.ARCHIVED },
    },
    select: { id: true },
  });

  if (!campaign) throw new Error("Campaign not found.");

  const blobStore = getBlobStore();
  const assetId = randomUUID();
  const extension = extensionForContentType(input.contentType);
  const storageKey = `organizations/${input.organizationId}/campaigns/${campaign.id}/manual-assets/${assetId}.${extension}`;

  await getDatabase().$transaction([
    getDatabase().campaignCreative.create({
      data: {
        id: assetId,
        organizationId: input.organizationId,
        campaignId: campaign.id,
        source: CampaignCreativeSource.MANUAL_UPLOAD,
        label: input.fileName.slice(0, 240),
        storageProvider: blobStore.provider,
        bucket: blobStore.bucket,
        storageKey,
        originalFileName: input.fileName.slice(0, 240),
        mimeType: input.contentType,
        fileSizeBytes: BigInt(input.fileSize),
        altText: input.fileName.slice(0, 240),
        uploadStatus: "PENDING",
      },
    }),
    getDatabase().campaign.updateMany({
      where: { id: campaign.id, organizationId: input.organizationId },
      data: { status: CampaignStatus.DRAFT },
    }),
  ]);

  const upload = await blobStore.createUploadIntent({
    key: storageKey,
    contentType: input.contentType,
    contentLength: input.fileSize,
    expiresInSeconds: 5 * 60,
  });

  return {
    campaignCreativeId: assetId,
    uploadUrl: upload.uploadUrl,
    headers: upload.headers,
    expiresAt: upload.expiresAt.toISOString(),
  };
}

export async function completeCampaignAssetUpload(input: {
  organizationId: string;
  campaignId: string;
  campaignCreativeId: string;
}) {
  const database = getDatabase();
  const asset = await database.campaignCreative.findFirst({
    where: {
      id: input.campaignCreativeId,
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      source: CampaignCreativeSource.MANUAL_UPLOAD,
      uploadStatus: "PENDING",
    },
    select: { id: true, storageKey: true, mimeType: true },
  });

  if (!asset?.storageKey || !asset.mimeType) {
    throw new Error("Pending campaign asset was not found.");
  }

  const blobStore = getBlobStore();

  try {
    const metadata = await blobStore.headObject(asset.storageKey);
    if (
      metadata.contentLength <= 0 ||
      metadata.contentLength > maximumImageBytes ||
      metadata.contentType !== asset.mimeType
    ) {
      throw new Error("Uploaded campaign image metadata is invalid.");
    }

    const bytes = await blobStore.readObject(asset.storageKey, maximumImageBytes);
    validateImageBytes(bytes, asset.mimeType);

    return database.campaignCreative.update({
      where: { id: asset.id },
      data: {
        uploadStatus: "READY",
        fileSizeBytes: BigInt(bytes.byteLength),
        checksumSha256: checksumSha256(bytes),
      },
      select: { id: true },
    });
  } catch (error) {
    await database.campaignCreative.update({
      where: { id: asset.id },
      data: { uploadStatus: "FAILED" },
    });
    await blobStore.deleteObject(asset.storageKey).catch(() => undefined);
    throw error;
  }
}
