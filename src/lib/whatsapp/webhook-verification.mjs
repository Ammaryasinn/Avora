import { resolveWhatsAppWebhookChallenge } from "./signature.mjs";

export function createWhatsAppWebhookVerificationResponse(requestUrl, configuredToken) {
  const url = new URL(requestUrl);
  const challenge = resolveWhatsAppWebhookChallenge(
    url.searchParams.get("hub.mode"),
    url.searchParams.get("hub.verify_token"),
    url.searchParams.get("hub.challenge"),
    configuredToken,
  );
  if (!challenge) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
