import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveWhatsAppWebhookChallenge,
  verifyWhatsAppSignature,
} from "../src/lib/whatsapp/signature.mjs";
import { createWhatsAppWebhookVerificationResponse } from "../src/lib/whatsapp/webhook-verification.mjs";
import {
  evaluateWhatsAppOutboundEligibility,
  getWhatsAppCustomerServiceWindow,
  resolveLatestInboundAt,
} from "../src/lib/whatsapp/outbound-policy.mjs";

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

test("draft replies remain local regardless of the outbound kill switch", async () => {
  const actions = await read("src/features/whatsapp/server/actions.ts");
  const start = actions.indexOf("export async function createManualDraftAction(");
  const end = actions.indexOf("export async function sendManualDraftAction(");
  const draft = actions.slice(start, end);
  assert.match(draft, /direction: "OUTBOUND"/);
  assert.match(draft, /currentStatus: "DRAFT"/);
  assert.doesNotMatch(draft, /fetch\(|getWhatsAppCloudApiGateway|sendTextMessage/);
  assert.doesNotMatch(draft, /isWhatsAppOutboundEnabled/);
});

const eligibleOutboundInput = {
  featureEnabled: true,
  role: "OWNER",
  conversationArchived: false,
  connectionStatus: "CONNECTED",
  connectionDisconnected: false,
  hasUsableToken: true,
  contactStatus: "ACTIVE",
  consentStatus: "UNKNOWN",
  latestInboundAt: new Date("2026-09-15T09:00:00.000Z"),
  now: new Date("2026-09-15T10:00:00.000Z"),
};

test("outbound policy enforces kill switch, manager role, connection, contact, and opt-out", () => {
  assert.equal(evaluateWhatsAppOutboundEligibility(eligibleOutboundInput).canSend, true);
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, consentStatus: "NO_CONSENT" }).canSend, true);
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, featureEnabled: false }).reason, "FEATURE_DISABLED");
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, role: "MEMBER" }).reason, "ROLE_NOT_ALLOWED");
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, connectionStatus: "DISCONNECTED" }).reason, "CONNECTION_INACTIVE");
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, connectionDisconnected: true }).reason, "CONNECTION_INACTIVE");
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, hasUsableToken: false }).reason, "CONNECTION_CREDENTIALS_MISSING");
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, contactStatus: "BLOCKED" }).reason, "CONTACT_BLOCKED");
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, consentStatus: "OPTED_OUT" }).reason, "CONTACT_OPTED_OUT");
});

test("customer service window uses persisted inbound fallback order and closes at 24 hours", () => {
  const latest = resolveLatestInboundAt([
    {
      providerTimestamp: new Date("2026-09-14T09:00:00.000Z"),
      receivedAt: new Date("2026-09-15T12:00:00.000Z"),
      createdAt: new Date("2026-09-15T12:00:00.000Z"),
    },
    {
      providerTimestamp: null,
      receivedAt: new Date("2026-09-15T08:00:00.000Z"),
      createdAt: new Date("2026-09-15T08:01:00.000Z"),
    },
  ]);
  assert.equal(latest?.toISOString(), "2026-09-15T08:00:00.000Z");
  assert.equal(getWhatsAppCustomerServiceWindow(latest, new Date("2026-09-16T07:59:59.999Z")).isOpen, true);
  assert.equal(getWhatsAppCustomerServiceWindow(latest, new Date("2026-09-16T08:00:00.000Z")).isOpen, false);
  assert.equal(evaluateWhatsAppOutboundEligibility({ ...eligibleOutboundInput, latestInboundAt: null }).reason, "CUSTOMER_SERVICE_WINDOW_CLOSED");
});

test("send action is tenant-scoped and atomically claims a draft exactly once", async () => {
  const actions = await read("src/features/whatsapp/server/actions.ts");
  const start = actions.indexOf("export async function sendManualDraftAction(");
  const end = actions.indexOf("export async function markConversationReadAction(");
  const send = actions.slice(start, end);
  assert.match(send, /requireTenantContext\(organizationSlug, managers\)/);
  assert.match(send, /organizationId: tenant\.organizationId,\s*conversationId,/);
  assert.match(send, /contact: \{ organizationId: tenant\.organizationId \}/);
  assert.match(send, /connection: \{ organizationId: tenant\.organizationId \}/);
  assert.match(send, /currentStatus: "DRAFT"/);
  assert.match(send, /currentStatus: "QUEUED"/);
  assert.match(send, /if \(claim\.count !== 1\)/);
  assert.equal(send.match(/\.sendTextMessage\(/g)?.length, 1);
  assert.ok(send.indexOf("claim.count !== 1") < send.indexOf(".sendTextMessage("));
  assert.match(send, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
});

test("successful sends persist provider identity, sent state, and delivery history", async () => {
  const actions = await read("src/features/whatsapp/server/actions.ts");
  const send = actions.slice(actions.indexOf("export async function sendManualDraftAction("));
  assert.match(send, /providerMessageId: result\.providerMessageId/);
  assert.match(send, /currentStatus: "SENT"/);
  assert.match(send, /transaction\.messageDeliveryStatus\.create\(/);
  assert.match(send, /providerEventKey: `outbound:\$\{claimed\.messageId\}:sent`/);
  assert.match(send, /lastOutboundAt: sentAt/);
  assert.match(send, /SEND_OUTCOME_UNKNOWN/);
  assert.match(send, /Do not retry this draft/);
});

test("conversation UI shows safe failed and ambiguous outbound states", async () => {
  const queries = await read("src/features/whatsapp/server/queries.ts");
  const page = await read("src/app/dashboard/[organizationSlug]/conversations/[conversationId]/page.tsx");
  assert.match(queries, /lastErrorMessage: true/);
  assert.match(page, /message\.currentStatus === "FAILED" && message\.lastErrorMessage/);
  assert.match(page, /SEND_OUTCOME_UNKNOWN/);
  assert.match(page, /Do not retry this draft/);
});

test("status webhooks apply delivered, read, and failed once without regressing state", async () => {
  const worker = await read("src/features/whatsapp/server/worker.ts");
  assert.match(worker, /delivered: MessageDeliveryState\.DELIVERED/);
  assert.match(worker, /read: MessageDeliveryState\.READ/);
  assert.match(worker, /failed: MessageDeliveryState\.FAILED/);
  assert.match(worker, /messageDeliveryStatus\.upsert\(/);
  assert.match(worker, /organizationId_providerEventKey/);
  assert.match(worker, /statusRank\[nextStatus\] >= statusRank\[message\.currentStatus\]/);
});

test("outbound token remains server-only and is never logged or returned to the UI", async () => {
  const gateway = await read("src/lib/whatsapp/cloud-api-gateway.ts");
  const actions = await read("src/features/whatsapp/server/actions.ts");
  const queries = await read("src/features/whatsapp/server/queries.ts");
  const page = await read("src/app/dashboard/[organizationSlug]/conversations/[conversationId]/page.tsx");
  assert.doesNotMatch(gateway, /console\./);
  assert.doesNotMatch(actions, /console\./);
  assert.match(actions, /decryptWhatsAppToken\(/);
  assert.match(queries, /hasUsableToken: Boolean\(/);
  assert.doesNotMatch(page, /tokenCiphertext|tokenIv|tokenAuthTag|tokenKeyVersion|accessToken/);
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
