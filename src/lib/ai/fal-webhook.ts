import "server-only";

import { createHash, createPublicKey, verify } from "node:crypto";

type FalJwk = {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid?: string;
};

let cachedKeys: { keys: FalJwk[]; expiresAt: number } | undefined;

async function getFalWebhookKeys() {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) {
    return cachedKeys.keys;
  }

  const response = await fetch("https://rest.fal.ai/.well-known/jwks.json", {
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error("fal.ai webhook keys could not be loaded.");
  }

  const value = (await response.json()) as { keys?: FalJwk[] };
  const keys = (value.keys ?? []).filter(
    (key) => key.kty === "OKP" && key.crv === "Ed25519" && Boolean(key.x),
  );

  if (keys.length === 0) {
    throw new Error("fal.ai returned no supported webhook keys.");
  }

  cachedKeys = { keys, expiresAt: Date.now() + 24 * 60 * 60_000 };
  return keys;
}

export async function verifyFalWebhook(request: Request, body: Uint8Array) {
  const requestId = request.headers.get("x-fal-webhook-request-id");
  const userId = request.headers.get("x-fal-webhook-user-id");
  const timestamp = request.headers.get("x-fal-webhook-timestamp");
  const signatureHex = request.headers.get("x-fal-webhook-signature");

  if (!requestId || !userId || !timestamp || !signatureHex) {
    return false;
  }

  const timestampSeconds = Number(timestamp);

  if (
    !Number.isInteger(timestampSeconds) ||
    Math.abs(Math.floor(Date.now() / 1_000) - timestampSeconds) > 300 ||
    !/^[a-f\d]+$/i.test(signatureHex)
  ) {
    return false;
  }

  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = Buffer.from(
    [requestId, userId, timestamp, bodyHash].join("\n"),
    "utf8",
  );
  const signature = Buffer.from(signatureHex, "hex");
  const keys = await getFalWebhookKeys();

  return keys.some((jwk) => {
    try {
      const publicKey = createPublicKey({ key: jwk, format: "jwk" });
      return verify(null, message, publicKey, signature);
    } catch {
      return false;
    }
  });
}
