import { createHash } from "node:crypto";

export const acceptedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const maximumImageBytes = 10 * 1024 * 1024;

export function isAcceptedImageType(
  contentType: string,
): contentType is (typeof acceptedImageTypes)[number] {
  return acceptedImageTypes.includes(
    contentType as (typeof acceptedImageTypes)[number],
  );
}

export function validateImageBytes(bytes: Uint8Array, contentType: string) {
  const isJpeg =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isWebp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

  const matchesContentType =
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/png" && isPng) ||
    (contentType === "image/webp" && isWebp);

  if (!matchesContentType) {
    throw new Error("Uploaded file content does not match its image type.");
  }
}

export function checksumSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function extensionForContentType(contentType: string) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }[contentType];
}
