import { createHmac, timingSafeEqual } from "node:crypto";

function equalText(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyWhatsAppChallengeToken(suppliedToken, configuredToken) {
  if (!suppliedToken || !configuredToken) return false;
  return equalText(suppliedToken, configuredToken);
}

export function resolveWhatsAppWebhookChallenge(
  mode,
  suppliedToken,
  challenge,
  configuredToken,
) {
  if (
    mode !== "subscribe" ||
    !challenge ||
    !verifyWhatsAppChallengeToken(suppliedToken, configuredToken)
  ) {
    return null;
  }
  return challenge;
}

export function verifyWhatsAppSignature(body, signatureHeader, appSecret) {
  if (!signatureHeader || !appSecret || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  return equalText(signatureHeader, expected);
}
