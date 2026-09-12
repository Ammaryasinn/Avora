"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  FollowUpConsentStatus,
  LeadQualificationStage,
  OrganizationRole,
} from "@/generated/prisma/enums";
import { ensureCurrentUser } from "@/lib/auth/current-user";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";
import { assertWhatsAppOutboundDisabled } from "@/lib/whatsapp/config";
import { getWhatsAppCloudApiGateway } from "@/lib/whatsapp/cloud-api-gateway";
import { encryptWhatsAppToken } from "@/lib/whatsapp/token-cipher";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

import { recordAuditEvent } from "./audit";
import {
  assignmentSchema,
  consentSchema,
  manualDraftSchema,
  parseForm,
  qualificationSchema,
  whatsappConnectionSchema,
} from "./schema";

const managers = [OrganizationRole.OWNER, OrganizationRole.ADMIN] as const;

function paths(organizationSlug: string, conversationId?: string, leadId?: string) {
  const dashboard = `/dashboard/${organizationSlug}`;
  revalidatePath(`${dashboard}/settings/integrations/whatsapp`);
  revalidatePath(`${dashboard}/conversations`);
  revalidatePath(`${dashboard}/leads`);
  if (conversationId) revalidatePath(`${dashboard}/conversations/${conversationId}`);
  if (leadId) revalidatePath(`${dashboard}/leads/${leadId}`);
}

function invalid(message: string, error?: z.ZodError): ActionState {
  return {
    status: "error",
    message,
    fieldErrors: error ? z.flattenError(error).fieldErrors : undefined,
  };
}

export async function saveWhatsAppConnectionAction(
  organizationSlug: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(whatsappConnectionSchema, formData);
  if (!parsed.success) return invalid("Review the WhatsApp connection details.", parsed.error);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const existing = await database.whatsAppConnection.findUnique({
    where: { phoneNumberId: parsed.data.phoneNumberId },
    select: { id: true, organizationId: true },
  });
  if (existing && existing.organizationId !== tenant.organizationId) {
    return invalid("That WhatsApp phone number is already connected to another Avora organization.");
  }

  const connectionId = existing?.id ?? randomUUID();
  try {
    const gateway = getWhatsAppCloudApiGateway();
    const phone = await gateway.inspectPhoneNumber(parsed.data.phoneNumberId, parsed.data.accessToken);
    if (phone.id !== parsed.data.phoneNumberId) {
      return invalid("Meta returned a different WhatsApp phone number identity.");
    }
    await gateway.subscribeWaba(parsed.data.wabaId, parsed.data.accessToken);
    const encrypted = encryptWhatsAppToken(
      parsed.data.accessToken,
      tenant.organizationId,
      connectionId,
    );
    const connection = await database.whatsAppConnection.upsert({
      where: { phoneNumberId: parsed.data.phoneNumberId },
      create: {
        id: connectionId,
        organizationId: tenant.organizationId,
        configuredById: user.id,
        status: "CONNECTED",
        wabaId: parsed.data.wabaId,
        phoneNumberId: parsed.data.phoneNumberId,
        displayPhoneNumber: phone.displayPhoneNumber,
        verifiedName: phone.verifiedName,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
        webhookSubscribedAt: new Date(),
        lastValidatedAt: new Date(),
      },
      update: {
        configuredById: user.id,
        status: "CONNECTED",
        wabaId: parsed.data.wabaId,
        displayPhoneNumber: phone.displayPhoneNumber,
        verifiedName: phone.verifiedName,
        tokenCiphertext: encrypted.ciphertext,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
        webhookSubscribedAt: new Date(),
        lastValidatedAt: new Date(),
        disconnectedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      select: { id: true },
    });
    await recordAuditEvent({
      organizationId: tenant.organizationId,
      actorUserId: user.id,
      action: existing ? "WHATSAPP_CONNECTION_RECONNECTED" : "WHATSAPP_CONNECTION_CREATED",
      entityType: "WhatsAppConnection",
      entityId: connection.id,
      metadata: { phoneNumberId: parsed.data.phoneNumberId, wabaId: parsed.data.wabaId },
    });
    paths(organizationSlug);
    return { status: "idle", message: "WhatsApp connection verified and saved." };
  } catch {
    return invalid("Avora could not verify and save this WhatsApp connection.");
  }
}

export async function disconnectWhatsAppAction(
  organizationSlug: string,
  connectionId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const updated = await getDatabase().whatsAppConnection.updateMany({
    where: { id: connectionId, organizationId: tenant.organizationId },
    data: {
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      tokenCiphertext: null,
      tokenIv: null,
      tokenAuthTag: null,
      tokenKeyVersion: null,
      tokenExpiresAt: null,
    },
  });
  if (updated.count === 1) {
    await recordAuditEvent({
      organizationId: tenant.organizationId,
      actorUserId: user.id,
      action: "WHATSAPP_CONNECTION_DISCONNECTED",
      entityType: "WhatsAppConnection",
      entityId: connectionId,
    });
  }
  paths(organizationSlug);
}

export async function assignConversationAction(
  organizationSlug: string,
  conversationId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(assignmentSchema, formData);
  if (!parsed.success) return invalid("Choose a valid organization member.", parsed.error);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const [conversation, member] = await Promise.all([
    database.conversation.findFirst({
      where: { id: conversationId, organizationId: tenant.organizationId, archivedAt: null },
      select: { id: true, leadId: true },
    }),
    database.organizationMember.findFirst({
      where: { id: parsed.data.assignedOrganizationMemberId, organizationId: tenant.organizationId },
      select: { id: true },
    }),
  ]);
  if (!conversation || !member) return invalid("The conversation or assignee is unavailable.");

  await database.$transaction(async (transaction) => {
    await transaction.conversationAssignment.updateMany({
      where: { organizationId: tenant.organizationId, conversationId, status: "ACTIVE" },
      data: { status: "RELEASED", releasedAt: new Date(), releasedById: user.id },
    });
    await transaction.conversationAssignment.create({
      data: {
        organizationId: tenant.organizationId,
        conversationId,
        assignedOrganizationMemberId: member.id,
        assignedById: user.id,
        reason: parsed.data.reason,
      },
    });
    await transaction.conversation.update({
      where: { id: conversationId },
      data: {
        status: "HANDOFF",
        currentAssignedOrganizationMemberId: member.id,
        handedOffAt: new Date(),
        automationSuppressedAt: new Date(),
        automationSuppressionReason: "Human handoff",
      },
    });
    const participant = await transaction.conversationParticipant.findFirst({
      where: {
        organizationId: tenant.organizationId,
        conversationId,
        organizationMemberId: member.id,
        leftAt: null,
      },
      select: { id: true },
    });
    if (!participant) {
      await transaction.conversationParticipant.create({
        data: {
          organizationId: tenant.organizationId,
          conversationId,
          participantType: "ORGANIZATION_MEMBER",
          role: "ASSIGNEE",
          organizationMemberId: member.id,
        },
      });
    }
    await transaction.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "CONVERSATION_ASSIGNED",
        entityType: "Conversation",
        entityId: conversationId,
        metadata: { assignedOrganizationMemberId: member.id },
      },
    });
  });
  paths(organizationSlug, conversationId, conversation.leadId ?? undefined);
  return { status: "idle", message: "Conversation handed off and assigned." };
}

export async function releaseConversationAssignmentAction(
  organizationSlug: string,
  conversationId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const user = await ensureCurrentUser();
  const conversation = await getDatabase().conversation.findFirst({
    where: { id: conversationId, organizationId: tenant.organizationId },
    select: { id: true, leadId: true, currentAssignedOrganizationMemberId: true },
  });
  if (!conversation) return;
  await getDatabase().$transaction(async (transaction) => {
    await transaction.conversationAssignment.updateMany({
      where: { organizationId: tenant.organizationId, conversationId, status: "ACTIVE" },
      data: { status: "RELEASED", releasedAt: new Date(), releasedById: user.id },
    });
    if (conversation.currentAssignedOrganizationMemberId) {
      await transaction.conversationParticipant.updateMany({
        where: {
          organizationId: tenant.organizationId,
          conversationId,
          organizationMemberId: conversation.currentAssignedOrganizationMemberId,
          leftAt: null,
        },
        data: { leftAt: new Date() },
      });
    }
    await transaction.conversation.update({
      where: { id: conversationId },
      data: { status: "OPEN", currentAssignedOrganizationMemberId: null },
    });
    await transaction.auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "CONVERSATION_ASSIGNMENT_RELEASED",
        entityType: "Conversation",
        entityId: conversationId,
      },
    });
  });
  paths(organizationSlug, conversationId, conversation.leadId ?? undefined);
}

export async function updateLeadQualificationAction(
  organizationSlug: string,
  leadId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(qualificationSchema, formData);
  if (!parsed.success) return invalid("Review the qualification details.", parsed.error);
  const user = await ensureCurrentUser();
  const lead = await getDatabase().lead.findFirst({
    where: { id: leadId, organizationId: tenant.organizationId, archivedAt: null },
    select: { id: true, conversations: { select: { id: true }, take: 1 } },
  });
  if (!lead) return invalid("The lead is unavailable.");
  const now = new Date();
  await getDatabase().$transaction([
    getDatabase().lead.update({
      where: { id: lead.id },
      data: { status: parsed.data.leadStatus, lastActivityAt: now },
    }),
    getDatabase().leadQualification.upsert({
      where: { leadId: lead.id },
      create: {
        organizationId: tenant.organizationId,
        leadId: lead.id,
        stage: parsed.data.stage,
        need: parsed.data.need,
        budget: parsed.data.budget,
        timeline: parsed.data.timeline,
        decisionMaker: parsed.data.decisionMaker,
        score: parsed.data.score,
        notes: parsed.data.notes,
        updatedById: user.id,
        qualifiedAt: parsed.data.stage === LeadQualificationStage.QUALIFIED ? now : null,
        disqualifiedAt: parsed.data.stage === LeadQualificationStage.DISQUALIFIED ? now : null,
      },
      update: {
        stage: parsed.data.stage,
        need: parsed.data.need ?? null,
        budget: parsed.data.budget ?? null,
        timeline: parsed.data.timeline ?? null,
        decisionMaker: parsed.data.decisionMaker ?? null,
        score: parsed.data.score ?? null,
        notes: parsed.data.notes ?? null,
        updatedById: user.id,
        qualifiedAt: parsed.data.stage === LeadQualificationStage.QUALIFIED ? now : null,
        disqualifiedAt: parsed.data.stage === LeadQualificationStage.DISQUALIFIED ? now : null,
      },
    }),
    getDatabase().auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "LEAD_QUALIFICATION_UPDATED",
        entityType: "Lead",
        entityId: lead.id,
        metadata: { status: parsed.data.leadStatus, stage: parsed.data.stage },
      },
    }),
  ]);
  paths(organizationSlug, lead.conversations[0]?.id, lead.id);
  return { status: "idle", message: "Lead qualification updated." };
}

function canTransitionConsent(
  current: FollowUpConsentStatus,
  next: FollowUpConsentStatus,
) {
  if (current === next) return true;
  const transitions: Record<FollowUpConsentStatus, FollowUpConsentStatus[]> = {
    UNKNOWN: [FollowUpConsentStatus.NO_CONSENT, FollowUpConsentStatus.OPTED_IN, FollowUpConsentStatus.OPTED_OUT],
    NO_CONSENT: [FollowUpConsentStatus.OPTED_IN, FollowUpConsentStatus.OPTED_OUT],
    OPTED_IN: [FollowUpConsentStatus.OPTED_OUT],
    OPTED_OUT: [FollowUpConsentStatus.OPTED_IN],
  };
  return transitions[current].includes(next);
}

export async function updateFollowUpConsentAction(
  organizationSlug: string,
  leadId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  const parsed = parseForm(consentSchema, formData);
  if (!parsed.success) return invalid("Review the consent record.", parsed.error);
  const user = await ensureCurrentUser();
  const lead = await getDatabase().lead.findFirst({
    where: { id: leadId, organizationId: tenant.organizationId },
    select: {
      id: true,
      contactId: true,
      followUpState: { select: { consentStatus: true } },
      conversations: { where: { archivedAt: null }, select: { id: true }, take: 1 },
    },
  });
  if (!lead) return invalid("The lead is unavailable.");
  const current = lead.followUpState?.consentStatus ?? FollowUpConsentStatus.UNKNOWN;
  if (!canTransitionConsent(current, parsed.data.consentStatus)) {
    return invalid(`Consent cannot move directly from ${current} to ${parsed.data.consentStatus}.`);
  }
  const now = new Date();
  const pausesFollowUp = parsed.data.consentStatus !== FollowUpConsentStatus.OPTED_IN;
  await getDatabase().$transaction([
    getDatabase().followUpState.upsert({
      where: { leadId: lead.id },
      create: {
        organizationId: tenant.organizationId,
        contactId: lead.contactId,
        leadId: lead.id,
        conversationId: lead.conversations[0]?.id,
        consentStatus: parsed.data.consentStatus,
        consentSource: parsed.data.consentSource,
        consentCapturedAt: parsed.data.consentStatus === FollowUpConsentStatus.UNKNOWN ? null : now,
        optedOutAt: parsed.data.consentStatus === FollowUpConsentStatus.OPTED_OUT ? now : null,
        status: pausesFollowUp ? "PAUSED" : "NOT_SCHEDULED",
        pausedReason: pausesFollowUp ? "Follow-up consent is unavailable." : null,
        updatedById: user.id,
      },
      update: {
        consentStatus: parsed.data.consentStatus,
        consentSource: parsed.data.consentSource ?? null,
        consentCapturedAt: parsed.data.consentStatus === FollowUpConsentStatus.UNKNOWN ? null : now,
        optedOutAt: parsed.data.consentStatus === FollowUpConsentStatus.OPTED_OUT ? now : null,
        status: pausesFollowUp ? "PAUSED" : "NOT_SCHEDULED",
        nextFollowUpAt: null,
        pausedReason: pausesFollowUp ? "Follow-up consent is unavailable." : null,
        updatedById: user.id,
      },
    }),
    getDatabase().auditEvent.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: user.id,
        action: "FOLLOW_UP_CONSENT_UPDATED",
        entityType: "Lead",
        entityId: lead.id,
        metadata: { previous: current, current: parsed.data.consentStatus },
      },
    }),
  ]);
  paths(organizationSlug, lead.conversations[0]?.id, lead.id);
  return { status: "idle", message: "Follow-up consent updated." };
}

export async function createManualDraftAction(
  organizationSlug: string,
  conversationId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, managers);
  assertWhatsAppOutboundDisabled();
  const parsed = parseForm(manualDraftSchema, formData);
  if (!parsed.success) return invalid("Review the reply draft.", parsed.error);
  const user = await ensureCurrentUser();
  const database = getDatabase();
  const [conversation, membership] = await Promise.all([
    database.conversation.findFirst({
      where: { id: conversationId, organizationId: tenant.organizationId, archivedAt: null },
      select: { id: true, connectionId: true, leadId: true },
    }),
    database.organizationMember.findFirst({
      where: { organizationId: tenant.organizationId, userId: user.id },
      select: { id: true },
    }),
  ]);
  if (!conversation || !membership) return invalid("The conversation is unavailable.");
  const message = await database.message.create({
    data: {
      organizationId: tenant.organizationId,
      connectionId: conversation.connectionId,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      authorType: "HUMAN",
      authoredByOrganizationMemberId: membership.id,
      contentType: "TEXT",
      textBody: parsed.data.body,
      currentStatus: "DRAFT",
    },
    select: { id: true },
  });
  await recordAuditEvent({
    organizationId: tenant.organizationId,
    actorUserId: user.id,
    action: "WHATSAPP_REPLY_DRAFT_CREATED",
    entityType: "Message",
    entityId: message.id,
  });
  paths(organizationSlug, conversation.id, conversation.leadId ?? undefined);
  return { status: "idle", message: "Reply saved as a draft. Nothing was sent to WhatsApp." };
}

export async function markConversationReadAction(
  organizationSlug: string,
  conversationId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, managers);
  await getDatabase().conversation.updateMany({
    where: { id: conversationId, organizationId: tenant.organizationId },
    data: { unreadCount: 0 },
  });
  paths(organizationSlug, conversationId);
}
