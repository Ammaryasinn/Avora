import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedWhatsAppToken = {
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
  const currentVersion = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY_VERSION?.trim();
  const currentValue = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim();
  if (!currentVersion || !currentValue) {
    throw new Error("WhatsApp token encryption configuration is incomplete.");
  }

  const keys = new Map<string, Buffer>([
    [currentVersion, parseKey(currentValue, "WHATSAPP_TOKEN_ENCRYPTION_KEY")],
  ]);
  const previous = process.env.WHATSAPP_TOKEN_ENCRYPTION_PREVIOUS_KEYS?.trim();
  if (previous) {
    const parsed = JSON.parse(previous) as Record<string, string>;
    for (const [version, value] of Object.entries(parsed)) {
      keys.set(version, parseKey(value, "WHATSAPP_TOKEN_ENCRYPTION_PREVIOUS_KEYS"));
    }
  }
  return { currentVersion, keys };
}

function aad(organizationId: string, connectionId: string, keyVersion: string) {
  return Buffer.from(`whatsapp:${organizationId}:${connectionId}:${keyVersion}`, "utf8");
}

export function encryptWhatsAppToken(
  token: string,
  organizationId: string,
  connectionId: string,
): EncryptedWhatsAppToken {
  const { currentVersion, keys } = getKeyring();
  const key = keys.get(currentVersion);
  if (!key) throw new Error("Current WhatsApp token encryption key is unavailable.");

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

export function decryptWhatsAppToken(
  encrypted: EncryptedWhatsAppToken,
  organizationId: string,
  connectionId: string,
) {
  const key = getKeyring().keys.get(encrypted.keyVersion);
  if (!key) throw new Error("The required WhatsApp token encryption key is unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.iv);
  decipher.setAAD(aad(organizationId, connectionId, encrypted.keyVersion));
  decipher.setAuthTag(Buffer.from(encrypted.authTag));
  return Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
