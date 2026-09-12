import { after } from "next/server";

import { getWhatsAppWebhookConfiguration } from "@/lib/whatsapp/config";
import { verifyWhatsAppSignature } from "@/lib/whatsapp/signature.mjs";
import { createWhatsAppWebhookVerificationResponse } from "@/lib/whatsapp/webhook-verification.mjs";
import {
  ingestWhatsAppWebhook,
  WhatsAppWebhookInputError,
} from "@/features/whatsapp/server/webhook-ingest";
import { processWhatsAppWebhookDelivery } from "@/features/whatsapp/server/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const { verifyToken } = getWhatsAppWebhookConfiguration();
  return createWhatsAppWebhookVerificationResponse(request.url, verifyToken);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_048_576) {
    return Response.json({ error: "Webhook body is too large." }, { status: 413 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  const { appSecret } = getWhatsAppWebhookConfiguration();
  if (!verifyWhatsAppSignature(body, request.headers.get("x-hub-signature-256"), appSecret)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  try {
    const result = await ingestWhatsAppWebhook(body);
    if (result.outcome === "accepted") {
      after(async () => {
        await processWhatsAppWebhookDelivery(result.deliveryId, result.organizationId);
      });
    }
    return Response.json({ received: true, outcome: result.outcome });
  } catch (error) {
    if (error instanceof WhatsAppWebhookInputError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Webhook ingestion failed." }, { status: 500 });
  }
}
