import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { BlobStore, PutObjectInput } from "./contracts";

type R2Configuration = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

let cachedStore: BlobStore | undefined;

function requireEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for Cloudflare R2 storage.`);
  }

  return value;
}

function getR2Configuration(): R2Configuration {
  return {
    accountId: requireEnvironmentValue("R2_ACCOUNT_ID"),
    accessKeyId: requireEnvironmentValue("R2_ACCESS_KEY_ID"),
    secretAccessKey: requireEnvironmentValue("R2_SECRET_ACCESS_KEY"),
    bucket: requireEnvironmentValue("R2_BUCKET_NAME"),
  };
}

class R2BlobStore implements BlobStore {
  readonly provider = "cloudflare-r2";
  readonly bucket: string;
  private readonly client: S3Client;

  constructor(configuration: R2Configuration) {
    this.bucket = configuration.bucket;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: configuration.accessKeyId,
        secretAccessKey: configuration.secretAccessKey,
      },
    });
  }

  async createUploadIntent(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });

    return {
      uploadUrl: await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
      }),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000),
      headers: { "content-type": input.contentType },
    };
  }

  async createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
  }) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: input.key }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async headObject(key: string) {
    const result = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return {
      contentType: result.ContentType ?? null,
      contentLength: result.ContentLength ?? 0,
      checksumSha256: result.ChecksumSHA256 ?? null,
    };
  }

  async readObject(key: string, maximumBytes: number) {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const contentLength = result.ContentLength ?? 0;

    if (contentLength > maximumBytes) {
      throw new Error("Stored object exceeds the allowed size.");
    }

    if (!result.Body) {
      throw new Error("Stored object has no body.");
    }

    const bytes = await result.Body.transformToByteArray();

    if (bytes.byteLength > maximumBytes) {
      throw new Error("Stored object exceeds the allowed size.");
    }

    return bytes;
  }

  async putObject(input: PutObjectInput) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );
  }

  async deleteObject(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}

export function getBlobStore() {
  if (!cachedStore) {
    cachedStore = new R2BlobStore(getR2Configuration());
  }

  return cachedStore;
}
