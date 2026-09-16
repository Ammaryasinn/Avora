import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  selectRelevantWhatsAppProducts,
  whatsappProductKeywords,
} from "../src/lib/whatsapp/ai-product-retrieval.mjs";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const product = (overrides = {}) => ({
  id: "product-1",
  name: "Linen Shirt",
  description: "Breathable linen shirt",
  category: "Shirts",
  price: "4500.00",
  status: "ACTIVE",
  archivedAt: null,
  variants: [{
    name: "Medium Blue",
    size: "M",
    color: "Blue",
    price: null,
    inventory: { quantityOnHand: 4, quantityReserved: 1 },
  }],
  ...overrides,
});

test("product retrieval caps relevant active products and handles stock safely", () => {
  const selected = selectRelevantWhatsAppProducts([
    product(),
    product({ id: "linked-out", name: "Linked Dress", variants: [{ name: "M", size: "M", color: null, price: null, inventory: { quantityOnHand: 0, quantityReserved: 0 } }] }),
    product({ id: "unlinked-out", name: "Blue Shoes", variants: [{ name: "Blue", size: null, color: "Blue", price: null, inventory: { quantityOnHand: 0, quantityReserved: 0 } }] }),
    product({ id: "archived", name: "Blue Archived", status: "ARCHIVED", archivedAt: new Date() }),
    product({ id: "other", name: "Unrelated Hat", category: "Hats", description: null, variants: [{ name: "Black Hat", size: "One size", color: "Black", price: null, inventory: null }] }),
  ], {
    customerQuestion: "Do you have the blue linen shirt in size M?",
    priorityProductIds: ["linked-out"],
    limit: 4,
  });
  assert.deepEqual(selected.map((item) => item.id), ["linked-out", "product-1"]);
  assert.equal(selected[0].availability, "OUT_OF_STOCK");
  assert.equal(selected[1].availability, "IN_STOCK");
  assert.equal(selected.some((item) => item.id === "unlinked-out"), false);
  assert.equal(selected.some((item) => item.id === "archived"), false);
  assert.ok(selected.length <= 4);
  assert.deepEqual(whatsappProductKeywords("How much is this price please?"), []);
});

test("AI generation is manager-only, tenant-scoped, and respects safety state", async () => {
  const actions = await read("src/features/whatsapp/server/ai-actions.ts");
  const context = await read("src/features/whatsapp/server/ai-context.ts");
  assert.match(actions, /requireTenantContext\(organizationSlug, managers\)/);
  assert.match(context, /membership\.role !== OrganizationRole\.OWNER/);
  assert.match(context, /membership\.role !== OrganizationRole\.ADMIN/);
  assert.match(context, /organizationId: input\.organizationId/);
  assert.match(context, /contact: \{ organizationId: input\.organizationId \}/);
  assert.match(context, /connection: \{ organizationId: input\.organizationId \}/);
  assert.match(context, /conversation\.contact\.status === "BLOCKED"/);
  assert.match(context, /consentStatus === "OPTED_OUT"/);
  assert.match(context, /conversation\.connection\.status !== "CONNECTED"/);
  assert.match(context, /currentAssignedOrganizationMemberId !== membership\.id/);
});

test("AI worker creates only an unsent AI draft and never calls Meta", async () => {
  const worker = await read("src/features/creative-studio/server/worker.ts");
  const start = worker.indexOf("async function createWhatsAppReplyDraft(");
  const end = worker.indexOf("async function createImageVariants(");
  const flow = worker.slice(start, end);
  assert.match(flow, /direction: "OUTBOUND"/);
  assert.match(flow, /authorType: "AI"/);
  assert.match(flow, /currentStatus: "DRAFT"/);
  assert.match(flow, /sourceAIJobId: job\.id/);
  assert.doesNotMatch(flow, /providerMessageId|messageDeliveryStatus|sendTextMessage|getWhatsAppCloudApiGateway|graph\.facebook/);
});

test("AI context uses normalized recent messages and only tenant catalogue facts", async () => {
  const context = await read("src/features/whatsapp/server/ai-context.ts");
  assert.match(context, /take: 16/);
  assert.match(context, /direction: "OUTBOUND", currentStatus: \{ in: \["SENT", "DELIVERED", "READ"\] \}/);
  assert.match(context, /organizationId: input\.organizationId,\s*status: "ACTIVE" as const,\s*archivedAt: null/);
  assert.match(context, /take: 12/);
  assert.match(context, /limit: 4/);
  assert.doesNotMatch(context, /tokenCiphertext|tokenAuthTag|accessToken|normalizedPayload|rawStorageKey/);
});

test("sales prompt forbids unsupported product, inventory, payment, and delivery claims", async () => {
  const context = await read("src/features/whatsapp/server/ai-context.ts");
  for (const rule of [
    "Never invent catalogue facts",
    "Never recommend an OUT_OF_STOCK product",
    "UNKNOWN availability is not confirmation of stock",
    "If facts are missing",
    "Qualification suggestions must use only facts the customer explicitly stated",
  ]) {
    assert.match(context, new RegExp(rule.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("provider kill switches and existing AI spending controls remain authoritative", async () => {
  const config = await read("src/lib/ai/config.ts");
  const actions = await read("src/features/whatsapp/server/ai-actions.ts");
  const jobs = await read("src/features/creative-studio/server/jobs.ts");
  assert.match(config, /enabled\("AI_TEXT_ENABLED"\) && enabled\("OPENAI_TEXT_ENABLED"\)/);
  assert.match(actions, /getTextAIAvailability\(\)\.available/);
  assert.match(jobs, /estimate\.greaterThan\(settings\.perJobLimit\)/);
  assert.match(jobs, /projected\.greaterThan\(usage\.budget\)/);
  assert.match(jobs, /recentJobs >= settings\.maxRequestsPerMinute/);
  assert.match(jobs, /concurrentJobs >= settings\.maxConcurrentJobs/);
  assert.match(jobs, /status: AIJobStatus\.RUNNING, leaseExpiresAt: \{ gt: new Date\(\) \}/);
  assert.match(actions, /maxAttempts: 1/);
});

test("qualification suggestions are inert until an explicit manager action", async () => {
  const worker = await read("src/features/creative-studio/server/worker.ts");
  const actions = await read("src/features/whatsapp/server/ai-actions.ts");
  const start = worker.indexOf("async function createWhatsAppReplyDraft(");
  const end = worker.indexOf("async function createImageVariants(");
  const generation = worker.slice(start, end);
  assert.match(generation, /qualificationSuggestions: result\.draft\.qualificationSuggestions/);
  assert.doesNotMatch(generation, /leadQualification\.(create|update|upsert)/);
  const applyStart = actions.indexOf("export async function applyAIQualificationSuggestionAction(");
  assert.match(actions.slice(applyStart), /leadQualification\.upsert\(/);
  assert.match(actions.slice(applyStart), /requireTenantContext\(organizationSlug, managers\)/);
});

test("editing or sending an AI draft records human approval before the WhatsApp gateway", async () => {
  const aiActions = await read("src/features/whatsapp/server/ai-actions.ts");
  const sendActions = await read("src/features/whatsapp/server/actions.ts");
  const updateStart = aiActions.indexOf("export async function updateWhatsAppDraftAction(");
  const updateEnd = aiActions.indexOf("export async function discardWhatsAppDraftAction(");
  const update = aiActions.slice(updateStart, updateEnd);
  assert.match(update, /authorType: "HUMAN"/);
  assert.match(update, /authoredByOrganizationMemberId: membership\.id/);
  const sendStart = sendActions.indexOf("export async function sendManualDraftAction(");
  const send = sendActions.slice(sendStart);
  assert.match(send, /message\.authorType !== "HUMAN" && message\.authorType !== "AI"/);
  assert.ok(send.indexOf('authorType: "HUMAN"') < send.indexOf(".sendTextMessage("));
  assert.ok(send.indexOf("currentStatus: \"QUEUED\"") < send.indexOf(".sendTextMessage("));
});

test("schema links one conversation AI job to at most one generated message", async () => {
  const schema = await read("prisma/schema.prisma");
  const migration = await read("prisma/migrations/20260915160000_milestone_3d_whatsapp_ai_drafts/migration.sql");
  assert.match(schema, /conversationId\s+String\?/);
  assert.match(schema, /sourceAIJobId\s+String\?\s+@unique/);
  assert.match(schema, /generatedMessage Message\?\s+@relation\("GeneratedWhatsAppReply"\)/);
  assert.match(migration, /ALTER COLUMN "creativeId" DROP NOT NULL/);
  assert.match(migration, /CREATE UNIQUE INDEX "Message_sourceAIJobId_key"/);
});
