import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveWhatsAppWebhookChallenge,
  verifyWhatsAppSignature,
} from "../src/lib/whatsapp/signature.mjs";
import { createWhatsAppWebhookVerificationResponse } from "../src/lib/whatsapp/webhook-verification.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("successful webhook GET verification returns the supplied challenge", async () => {
  const response = createWhatsAppWebhookVerificationResponse(
    "https://example.com/webhook?hub.mode=subscribe&hub.verify_token=known-token&hub.challenge=challenge-123",
    "known-token",
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "challenge-123");
});

test("webhook GET verification rejects an invalid token or mode", async () => {
  const response = createWhatsAppWebhookVerificationResponse(
    "https://example.com/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123",
    "known-token",
  );
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "Forbidden");
  assert.equal(resolveWhatsAppWebhookChallenge("subscribe", "wrong", "challenge-123", "known-token"), null);
  assert.equal(resolveWhatsAppWebhookChallenge("unsubscribe", "known-token", "challenge-123", "known-token"), null);
});

test("valid webhook signatures pass and invalid signatures fail", () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = "test-app-secret";
  const valid = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  assert.equal(verifyWhatsAppSignature(body, valid, secret), true);
  assert.equal(verifyWhatsAppSignature(body, `${valid.slice(0, -1)}0`, secret), false);
  assert.equal(verifyWhatsAppSignature(body, null, secret), false);
});

test("webhook route authenticates raw bytes before parsing and dispatches after response", async () => {
  const route = await read("src/app/api/webhooks/whatsapp/route.ts");
  const rawBody = route.indexOf("request.arrayBuffer()");
  const signature = route.indexOf("verifyWhatsAppSignature(body");
  const ingestion = route.indexOf("ingestWhatsAppWebhook(body)");
  assert.ok(rawBody >= 0 && rawBody < signature && signature < ingestion);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /processWhatsAppWebhookDelivery\(result\.deliveryId, result\.organizationId\)/);
});

test("unknown phone number payloads are acknowledged without durable retention", async () => {
  const ingestion = await read("src/features/whatsapp/server/webhook-ingest.ts");
  const unknown = ingestion.indexOf('if (!connection) return { outcome: "unknown_connection" as const };');
  const storage = ingestion.indexOf("const blobStore = getBlobStore()");
  assert.ok(unknown >= 0 && storage > unknown);
});

test("delivery, inbound message, and status duplicates have durable uniqueness guards", async () => {
  const schema = await read("prisma/schema.prisma");
  const contracts = await read("src/lib/whatsapp/contracts.ts");
  const worker = await read("src/features/whatsapp/server/worker.ts");
  assert.match(schema, /@@unique\(\[connectionId, payloadSha256\]\)/);
  assert.match(schema, /@@unique\(\[connectionId, providerEventKey\]\)/);
  assert.match(schema, /@@unique\(\[connectionId, providerMessageId\]\)/);
  assert.match(schema, /@@unique\(\[organizationId, providerEventKey\]\)/);
  assert.match(contracts, /providerEventKey: `message:\$\{message\.id\}`/);
  assert.match(contracts, /providerEventKey: `status:\$\{status\.id\}:\$\{status\.status\}:/);
  assert.match(worker, /transaction\.messageDeliveryStatus\.upsert\(/);
});

test("tenant isolation is applied to browser actions and provider processing", async () => {
  const actions = await read("src/features/whatsapp/server/actions.ts");
  const worker = await read("src/features/whatsapp/server/worker.ts");
  const queries = await read("src/features/whatsapp/server/queries.ts");
  assert.match(actions, /requireTenantContext\(organizationSlug, managers\)/);
  assert.match(actions, /where: \{ id: parsed\.data\.connectionId, organizationId: tenant\.organizationId \}/);
  assert.match(worker, /where: \{ id: eventId,\s*organizationId,/);
  assert.match(worker, /connection: \{ phoneNumberId: payload\.phoneNumberId \}/);
  assert.match(queries, /where: \{ id: conversationId, organizationId, archivedAt: null \}/);
  assert.match(queries, /where: \{ id: leadId, organizationId, archivedAt: null \}/);
});

test("worker claims use atomic lease guards with serializable transactions", async () => {
  const worker = await read("src/features/whatsapp/server/worker.ts");
  assert.match(worker, /transaction\.whatsAppWebhookEvent\.updateMany\(/);
  assert.match(worker, /leaseToken = `\$\{workerId\}:\$\{randomUUID\(\)\}`/);
  assert.match(worker, /leaseExpiresAt: \{ lte: now \}/);
  assert.match(worker, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(worker, /if \(claimed\.count !== 1\) return null/);
});

test("inbound text processing creates the contact, lead, conversation, and message in order", async () => {
  const worker = await read("src/features/whatsapp/server/worker.ts");
  const start = worker.indexOf("async function processMessageEvent(");
  const end = worker.indexOf("async function processStatusEvent(");
  const flow = worker.slice(start, end);
  const contact = flow.indexOf("transaction.contact.upsert(");
  const lead = flow.indexOf("transaction.lead.create(");
  const conversation = flow.indexOf("transaction.conversation.upsert(");
  const message = flow.indexOf("transaction.message.create(");
  assert.ok(contact >= 0 && contact < lead && lead < conversation && conversation < message);
  assert.match(flow, /direction: "INBOUND"/);
  assert.match(flow, /currentStatus: "RECEIVED"/);
  assert.match(flow, /unreadCount: \{ increment: 1 \}/);
});

test("connection tests are read-only and connection saves encrypt credentials", async () => {
  const actions = await read("src/features/whatsapp/server/actions.ts");
  const start = actions.indexOf("export async function saveWhatsAppConnectionAction(");
  const end = actions.indexOf("export async function disconnectWhatsAppAction(");
  const connection = actions.slice(start, end);
  assert.ok(connection.indexOf("gateway.inspectPhoneNumber(") < connection.indexOf('parsed.data.intent === "test"'));
  assert.ok(connection.indexOf("gateway.verifyPhoneNumberOwnership(") < connection.indexOf('parsed.data.intent === "test"'));
  assert.ok(connection.indexOf('parsed.data.intent === "test"') < connection.indexOf("gateway.subscribeWaba("));
  assert.ok(connection.indexOf("gateway.subscribeWaba(") < connection.indexOf("encryptWhatsAppToken("));
  assert.doesNotMatch(connection.slice(0, connection.indexOf("gateway.subscribeWaba(")), /tokenCiphertext:/);
});

test("draft replies cannot call Meta and require explicit outbound disablement", async () => {
  const actions = await read("src/features/whatsapp/server/actions.ts");
  const config = await read("src/lib/whatsapp/config.ts");
  const start = actions.indexOf("export async function createManualDraftAction(");
  const end = actions.indexOf("export async function markConversationReadAction(");
  const draft = actions.slice(start, end);
  assert.ok(draft.indexOf("assertWhatsAppOutboundDisabled();") < draft.indexOf("database.message.create("));
  assert.match(draft, /direction: "OUTBOUND"/);
  assert.match(draft, /currentStatus: "DRAFT"/);
  assert.doesNotMatch(draft, /fetch\(|getWhatsAppCloudApiGateway|graphRequest|subscribeWaba/);
  assert.match(config, /WHATSAPP_OUTBOUND_ENABLED\?\.trim\(\)\.toLowerCase\(\) === "false"/);
});

test("required WhatsApp environment controls are documented", async () => {
  const template = await read(".env.example");
  for (const name of [
    "WHATSAPP_META_APP_ID",
    "WHATSAPP_META_APP_SECRET",
    "WHATSAPP_GRAPH_API_VERSION",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "WHATSAPP_TOKEN_ENCRYPTION_KEY",
    "WHATSAPP_TOKEN_ENCRYPTION_KEY_VERSION",
    "WHATSAPP_TOKEN_ENCRYPTION_PREVIOUS_KEYS",
    "WHATSAPP_WEBHOOK_WORKER_SECRET",
    "WHATSAPP_RAW_EVENT_RETENTION_DAYS",
    "WHATSAPP_WEBHOOK_MAX_ATTEMPTS",
    "WHATSAPP_INBOUND_ENABLED",
    "WHATSAPP_OUTBOUND_ENABLED",
  ]) {
    assert.match(template, new RegExp(`^${name}=$`, "m"));
  }
});
