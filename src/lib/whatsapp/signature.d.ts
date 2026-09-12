export function verifyWhatsAppChallengeToken(
  suppliedToken: string | null | undefined,
  configuredToken: string,
): boolean;

export function verifyWhatsAppSignature(
  body: Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean;
