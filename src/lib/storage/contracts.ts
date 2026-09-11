export type UploadIntent = {
  uploadUrl: string;
  expiresAt: Date;
  headers: Record<string, string>;
};

export type StoredObjectMetadata = {
  contentType: string | null;
  contentLength: number;
  checksumSha256: string | null;
};

export type PutObjectInput = {
  key: string;
  body: Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
};

export interface BlobStore {
  readonly provider: string;
  readonly bucket: string;
  createUploadIntent(input: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<UploadIntent>;
  createDownloadUrl(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<string>;
  headObject(key: string): Promise<StoredObjectMetadata>;
  readObject(key: string, maximumBytes: number): Promise<Uint8Array>;
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
}
