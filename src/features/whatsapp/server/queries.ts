import "server-only";

import { getDatabase } from "@/lib/db/database";
import { getWhatsAppAvailability } from "@/lib/whatsapp/config";

export async function getWhatsAppIntegrationOverview(organizationId: string) {
  const connections = await getDatabase().whatsAppConnection.findMany({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      wabaId: true,
      phoneNumberId: true,
      displayPhoneNumber: true,
      verifiedName: true,
      webhookSubscribedAt: true,
      lastValidatedAt: true,
      lastWebhookAt: true,
      lastErrorMessage: true,
      updatedAt: true,
      _count: { select: { conversations: true, webhookEvents: true } },
    },
  });
  return { availability: getWhatsAppAvailability(), connections };
}

export function getConversations(organizationId: string) {
  return getDatabase().conversation.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      unreadCount: true,
      lastMessageAt: true,
      automationSuppressedAt: true,
      contact: { select: { displayName: true, phoneE164: true, waId: true } },
      lead: { select: { id: true, status: true, source: true } },
      currentAssignedOrganizationMember: {
        select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { textBody: true, contentType: true, direction: true, currentStatus: true },
      },
    },
  });
}

export function getConversationDetail(organizationId: string, conversationId: string) {
  return getDatabase().conversation.findFirst({
    where: { id: conversationId, organizationId, archivedAt: null },
    select: {
      id: true,
      status: true,
      unreadCount: true,
      automationSuppressedAt: true,
      automationSuppressionReason: true,
      currentAssignedOrganizationMemberId: true,
      contact: { select: { id: true, displayName: true, phoneE164: true, waId: true } },
      lead: {
        select: {
          id: true,
          status: true,
          source: true,
          firstInboundAt: true,
          lastActivityAt: true,
          campaign: { select: { id: true, name: true } },
          product: { select: { id: true, name: true } },
          qualification: true,
          followUpState: true,
        },
      },
      currentAssignedOrganizationMember: {
        select: { id: true, user: { select: { firstName: true, lastName: true, email: true } } },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        select: {
          id: true,
          status: true,
          reason: true,
          assignedAt: true,
          releasedAt: true,
          assignedOrganizationMember: {
            select: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
        },
      },
      messages: {
        orderBy: [{ providerTimestamp: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          direction: true,
          authorType: true,
          contentType: true,
          textBody: true,
          currentStatus: true,
          providerTimestamp: true,
          createdAt: true,
          mediaFileName: true,
          deliveryStatuses: {
            orderBy: { createdAt: "asc" },
            select: { status: true, providerTimestamp: true, createdAt: true },
          },
        },
      },
    },
  });
}

export function getOrganizationAssignmentOptions(organizationId: string) {
  return getDatabase().organizationMember.findMany({
    where: { organizationId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      role: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

export function getLeads(organizationId: string) {
  return getDatabase().lead.findMany({
    where: { organizationId, archivedAt: null },
    orderBy: { lastActivityAt: "desc" },
    select: {
      id: true,
      status: true,
      source: true,
      lastActivityAt: true,
      contact: { select: { displayName: true, phoneE164: true, waId: true } },
      campaign: { select: { name: true } },
      campaignCreative: {
        select: { label: true, creative: { select: { title: true } } },
      },
      product: { select: { name: true } },
      qualification: { select: { stage: true, score: true } },
      followUpState: { select: { consentStatus: true, status: true, nextFollowUpAt: true } },
      conversations: {
        where: { archivedAt: null },
        orderBy: { lastMessageAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          currentAssignedOrganizationMember: {
            select: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
        },
      },
      _count: { select: { conversations: true } },
    },
  });
}

export function getLeadDetail(organizationId: string, leadId: string) {
  return getDatabase().lead.findFirst({
    where: { id: leadId, organizationId, archivedAt: null },
    select: {
      id: true,
      status: true,
      source: true,
      firstInboundAt: true,
      lastActivityAt: true,
      providerClickId: true,
      contact: { select: { displayName: true, phoneE164: true, waId: true } },
      campaign: { select: { id: true, name: true } },
      campaignCreative: {
        select: { id: true, label: true, creative: { select: { title: true } } },
      },
      product: { select: { id: true, name: true } },
      qualification: true,
      followUpState: true,
      conversations: {
        where: { archivedAt: null },
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          status: true,
          lastMessageAt: true,
          unreadCount: true,
          currentAssignedOrganizationMember: {
            select: { user: { select: { firstName: true, lastName: true, email: true } } },
          },
        },
      },
    },
  });
}
