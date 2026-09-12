export function verifyWhatsAppChallengeToken(
  suppliedToken: string | null | undefined,
  configuredToken: string,
): boolean;

export function resolveWhatsAppWebhookChallenge(
  mode: string | null | undefined,
  suppliedToken: string | null | undefined,
  challenge: string | null | undefined,
  configuredToken: string,
): string | null;

export function verifyWhatsAppSignature(
  body: Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean;
