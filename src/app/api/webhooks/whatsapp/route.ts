import { getWhatsAppWebhookConfiguration } from "@/lib/whatsapp/config";
import {
  verifyWhatsAppChallengeToken,
  verifyWhatsAppSignature,
} from "@/lib/whatsapp/signature.mjs";
import {
  ingestWhatsAppWebhook,
  WhatsAppWebhookInputError,
} from "@/features/whatsapp/server/webhook-ingest";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const suppliedToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const { verifyToken } = getWhatsAppWebhookConfiguration();

  if (
    mode !== "subscribe" ||
    !challenge ||
    !verifyWhatsAppChallengeToken(suppliedToken, verifyToken)
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const body = new Uint8Array(await request.arrayBuffer());
  const { appSecret } = getWhatsAppWebhookConfiguration();
  if (!verifyWhatsAppSignature(body, request.headers.get("x-hub-signature-256"), appSecret)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    const result = await ingestWhatsAppWebhook(body);
    return Response.json({ received: true, outcome: result.outcome });
  } catch (error) {
    if (error instanceof WhatsAppWebhookInputError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Webhook ingestion failed." }, { status: 500 });
  }
}
