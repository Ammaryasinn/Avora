import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

type EncryptedToken = {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
  keyVersion: string;
};

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function parseKey(value: string, name: string) {
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) {
    throw new Error(`${name} must be a base64-encoded 32-byte key.`);
  }
  return key;
}

function getKeyring() {
  const currentVersion = process.env.META_TOKEN_ENCRYPTION_KEY_VERSION?.trim();
  const currentValue = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  if (!currentVersion || !currentValue) {
    throw new Error("Meta token encryption configuration is incomplete.");
  }

  const keys = new Map<string, Buffer>([
    [currentVersion, parseKey(currentValue, "META_TOKEN_ENCRYPTION_KEY")],
  ]);
  const previous = process.env.META_TOKEN_ENCRYPTION_PREVIOUS_KEYS?.trim();
  if (previous) {
    const parsed = JSON.parse(previous) as Record<string, string>;
    for (const [version, value] of Object.entries(parsed)) {
      keys.set(version, parseKey(value, "META_TOKEN_ENCRYPTION_PREVIOUS_KEYS"));
    }
  }

  return { currentVersion, keys };
}

function aad(organizationId: string, connectionId: string, keyVersion: string) {
  return Buffer.from(`meta:${organizationId}:${connectionId}:${keyVersion}`, "utf8");
}

export function encryptMetaToken(
  token: string,
  organizationId: string,
  connectionId: string,
): EncryptedToken {
  const { currentVersion, keys } = getKeyring();
  const key = keys.get(currentVersion);
  if (!key) throw new Error("Current Meta token encryption key is unavailable.");

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(organizationId, connectionId, currentVersion));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);

  return {
    ciphertext: ownedBytes(ciphertext),
    iv: ownedBytes(iv),
    authTag: ownedBytes(cipher.getAuthTag()),
    keyVersion: currentVersion,
  };
}

export function decryptMetaToken(
  encrypted: EncryptedToken,
  organizationId: string,
  connectionId: string,
) {
  const key = getKeyring().keys.get(encrypted.keyVersion);
  if (!key) throw new Error("The required Meta token encryption key is unavailable.");

  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.iv);
  decipher.setAAD(aad(organizationId, connectionId, encrypted.keyVersion));
  decipher.setAuthTag(Buffer.from(encrypted.authTag));

  return Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
