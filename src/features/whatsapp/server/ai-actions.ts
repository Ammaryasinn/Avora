"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AICapability, AIJobStatus, OrganizationRole } from "@/generated/prisma/enums";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getTextAIAvailability } from "@/lib/ai/config";
import { AIUsageLimitError } from "@/lib/ai/errors";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";
import { createAIJob } from "@/features/creative-studio/server/jobs";
import { aiDraftMetadataSchema } from "@/features/whatsapp/ai-draft-metadata";

import {
  buildWhatsAppAIReplyContext,
  getLatestWhatsAppInboundMessage,
  WhatsAppAIReplyPolicyError,
} from "./ai-context";

const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;
const activeAIStatuses = [
  AIJobStatus.PENDING,
  AIJobStatus.QUEUED,
  AIJobStatus.RUNNING,
  AIJobStatus.RETRY_SCHEDULED,
] as const;
const requestSchema = z.object({ requestNonce: z.string().uuid() });
const draftSchema = z.object({ body: z.string().trim().min(1).max(4_000) });

function refreshConversation(organizationSlug: string, conversationId: string, leadId?: string | null) {
  revalidatePath(`/dashboard/${organizationSlug}/conversations/${conversationId}`);
  revalidatePath(`/dashboard/${organizationSlug}/conversations`);
  if (leadId) revalidatePath(`/dashboard/${organizationSlug}/leads/${leadId}`);
}

function safeAIError(error: unknown): ActionState {
  if (error instanceof AIUsageLimitError || error instanceof WhatsAppAIReplyPolicyError) {
    return { status: "error", message: error.message };
  }
  if (error instanceof Error && error.message === "This AI capability is currently unavailable.") {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "Avora could not queue an AI reply draft." };
}

export async function generateWhatsAppAIReplyAction(
  organizationSlug: string,
  conversationId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void _previousState;
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Refresh the page and try again." };
  if (!getTextAIAvailability().available) {
    return { status: "error", message: "AI text generation is currently unavailable." };
  }
  const user = await ensureCurrentUser();
  const sourceMessage = await getLatestWhatsAppInboundMessage(tenant.organizationId, conversationId);
  if (!sourceMessage?.textBody) {
    return { status: "error", message: "A customer text message is required before generating a reply." };
  }

  try {
    await buildWhatsAppAIReplyContext({
      organizationId: tenant.organizationId,
      conversationId,
      requestingUserId: user.id,
      sourceMessageId: sourceMessage.id,
    });
    const database = getDatabase();
    const active = await database.aIJob.findFirst({
      where: {
        organizationId: tenant.organizationId,
        conversationId,
        promptTemplateKey: "whatsapp-sales-reply",
        status: { in: [...activeAIStatuses] },
      },
      select: { id: true },
    });
    if (active) return { status: "idle", message: "An AI reply is already being generated." };

    const job = await createAIJob({
      organizationId: tenant.organizationId,
      conversationId,
      createdById: user.id,
      capability: AICapability.GENERATE_TEXT,
      idempotencyKey: `whatsapp-reply:${conversationId}:${sourceMessage.id}:${parsed.data.requestNonce}`,
      promptTemplateKey: "whatsapp-sales-reply",
      promptTemplateVersion: 1,
      jobInput: {
        conversationId,
        sourceMessageId: sourceMessage.id,
        contextVersion: 1,
      },
      requestedVariantCount: 1,
      maxAttempts: 1,
    });
    await database.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "WHATSAPP_AI_REPLY_REQUESTED",
        entityType: "AIJob",
        entityId: job.id,
        correlationId: job.id,
        metadata: { conversationId, sourceMessageId: sourceMessage.id },
      },
    });
    refreshConversation(organizationSlug, conversationId);
    return { status: "idle", message: "AI reply generation queued. Review the draft before sending." };
  } catch (error) {
    return safeAIError(error);
  }
}

export async function updateWhatsAppDraftAction(
  organizationSlug: string,
  conversationId: string,
  messageId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void _previousState;
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Write a reply of up to 4,000 characters." };
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const membership = await database.organizationMember.findFirst({
    where: { organizationId: tenant.organizationId, userId: user.id },
    select: { id: true },
  });
  if (!membership) return { status: "error", message: "Your organization membership is unavailable." };
  const draft = await database.message.findFirst({
    where: {
      id: messageId,
      organizationId: tenant.organizationId,
      conversationId,
      direction: "OUTBOUND",
      currentStatus: "DRAFT",
      providerMessageId: null,
    },
    select: { id: true, conversation: { select: { leadId: true } } },
  });
  if (!draft) return { status: "error", message: "The draft is unavailable." };
  await database.$transaction([
    database.message.update({
      where: { id: draft.id },
      data: {
        textBody: parsed.data.body,
        authorType: "HUMAN",
        authoredByOrganizationMemberId: membership.id,
      },
    }),
    database.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "WHATSAPP_REPLY_DRAFT_UPDATED",
        entityType: "Message",
        entityId: draft.id,
      },
    }),
  ]);
  refreshConversation(organizationSlug, conversationId, draft.conversation.leadId);
  return { status: "idle", message: "Draft saved. Nothing was sent." };
}

export async function discardWhatsAppDraftAction(
  organizationSlug: string,
  conversationId: string,
  messageId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const draft = await database.message.findFirst({
    where: {
      id: messageId,
      organizationId: tenant.organizationId,
      conversationId,
      direction: "OUTBOUND",
      currentStatus: "DRAFT",
      providerMessageId: null,
    },
    select: { id: true, conversation: { select: { leadId: true } } },
  });
  if (!draft) return;
  await database.$transaction([
    database.message.delete({ where: { id: draft.id } }),
    database.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "WHATSAPP_REPLY_DRAFT_DISCARDED",
        entityType: "Message",
        entityId: draft.id,
      },
    }),
  ]);
  refreshConversation(organizationSlug, conversationId, draft.conversation.leadId);
}

export async function applyAIQualificationSuggestionAction(
  organizationSlug: string,
  conversationId: string,
  messageId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const draft = await database.message.findFirst({
    where: {
      id: messageId,
      organizationId: tenant.organizationId,
      conversationId,
      sourceAIJobId: { not: null },
      currentStatus: "DRAFT",
    },
    select: {
      id: true,
      content: true,
      conversation: { select: { leadId: true, contactId: true } },
    },
  });
  const parsed = aiDraftMetadataSchema.safeParse(draft?.content);
  if (!draft?.conversation.leadId || !parsed.success) return;
  const suggestions = parsed.data.qualificationSuggestions;
  if (!Object.values(suggestions).some(Boolean)) return;
  await database.$transaction([
    database.leadQualification.upsert({
      where: { leadId: draft.conversation.leadId },
      create: {
        organizationId: tenant.organizationId,
        leadId: draft.conversation.leadId,
        need: suggestions.need,
        budget: suggestions.budget,
        timeline: suggestions.timeline,
        decisionMaker: suggestions.decisionMaker,
        notes: "Applied from an explicitly reviewed AI suggestion.",
        updatedById: user.id,
      },
      update: {
        ...(suggestions.need ? { need: suggestions.need } : {}),
        ...(suggestions.budget ? { budget: suggestions.budget } : {}),
        ...(suggestions.timeline ? { timeline: suggestions.timeline } : {}),
        ...(suggestions.decisionMaker ? { decisionMaker: suggestions.decisionMaker } : {}),
        updatedById: user.id,
      },
    }),
    database.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "WHATSAPP_AI_QUALIFICATION_SUGGESTION_APPLIED",
        entityType: "Message",
        entityId: draft.id,
        metadata: { leadId: draft.conversation.leadId },
      },
    }),
  ]);
  refreshConversation(organizationSlug, conversationId, draft.conversation.leadId);
}
