import "server-only";

import { randomUUID } from "node:crypto";

import { ProductMediaType } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";
import { getBlobStore } from "@/lib/storage/r2-object-storage";
import {
  checksumSha256,
  extensionForContentType,
  isAcceptedImageType,
  maximumImageBytes,
  validateImageBytes,
} from "@/lib/storage/image-validation";

export async function createProductMediaUploadIntent(input: {
  organizationId: string;
  productId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}) {
  if (!isAcceptedImageType(input.contentType)) {
    throw new Error("Only JPEG, PNG, and WebP product images are supported.");
  }

  if (input.fileSize <= 0 || input.fileSize > maximumImageBytes) {
    throw new Error("Product images must be 10 MB or smaller.");
  }

  const product = await getDatabase().product.findFirst({
    where: {
      id: input.productId,
      organizationId: input.organizationId,
      archivedAt: null,
    },
    select: { id: true },
  });

  if (!product) {
    throw new Error("Product not found.");
  }

  const blobStore = getBlobStore();
  const mediaId = randomUUID();
  const extension = extensionForContentType(input.contentType);
  const storageKey = `organizations/${input.organizationId}/products/${product.id}/media/${mediaId}.${extension}`;

  const media = await getDatabase().productMedia.create({
    data: {
      id: mediaId,
      organizationId: input.organizationId,
      productId: product.id,
      type: ProductMediaType.IMAGE,
      storageProvider: blobStore.provider,
      bucket: blobStore.bucket,
      storageKey,
      mimeType: input.contentType,
      fileSizeBytes: BigInt(input.fileSize),
      altText: input.fileName.slice(0, 240),
    },
    select: { id: true },
  });

  const upload = await blobStore.createUploadIntent({
    key: storageKey,
    contentType: input.contentType,
    contentLength: input.fileSize,
    expiresInSeconds: 5 * 60,
  });

  return {
    mediaId: media.id,
    uploadUrl: upload.uploadUrl,
    headers: upload.headers,
    expiresAt: upload.expiresAt.toISOString(),
  };
}

export async function completeProductMediaUpload(input: {
  organizationId: string;
  mediaId: string;
}) {
  const database = getDatabase();
  const media = await database.productMedia.findFirst({
    where: {
      id: input.mediaId,
      organizationId: input.organizationId,
      uploadStatus: "PENDING",
    },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
    },
  });

  if (!media?.storageKey || !media.mimeType) {
    throw new Error("Pending product media was not found.");
  }

  const blobStore = getBlobStore();

  try {
    const metadata = await blobStore.headObject(media.storageKey);

    if (
      metadata.contentLength <= 0 ||
      metadata.contentLength > maximumImageBytes ||
      metadata.contentType !== media.mimeType
    ) {
      throw new Error("Uploaded product image metadata is invalid.");
    }

    const bytes = await blobStore.readObject(media.storageKey, maximumImageBytes);
    validateImageBytes(bytes, media.mimeType);

    return database.productMedia.update({
      where: { id: media.id },
      data: {
        uploadStatus: "READY",
        fileSizeBytes: BigInt(bytes.byteLength),
        checksumSha256: checksumSha256(bytes),
      },
      select: { id: true },
    });
  } catch (error) {
    await database.productMedia.update({
      where: { id: media.id },
      data: { uploadStatus: "FAILED" },
    });
    await blobStore.deleteObject(media.storageKey).catch(() => undefined);
    throw error;
  }
}

export async function getProductMedia(
  organizationId: string,
  productId: string,
) {
  return getDatabase().productMedia.findMany({
    where: {
      organizationId,
      productId,
      uploadStatus: "READY",
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      altText: true,
      mimeType: true,
      fileSizeBytes: true,
    },
  });
}
