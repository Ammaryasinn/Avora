-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'DEGRADED', 'DISCONNECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookDeliveryStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'PARTIAL', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'RETRY_PENDING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "WhatsAppWebhookEventType" AS ENUM ('MESSAGE', 'MESSAGE_STATUS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'OPEN', 'QUALIFYING', 'QUALIFIED', 'UNQUALIFIED', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WHATSAPP', 'META_CAMPAIGN', 'PRODUCT', 'DIRECT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LeadQualificationStage" AS ENUM ('UNASSESSED', 'DISCOVERY', 'INTERESTED', 'QUALIFIED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('OPEN', 'WAITING_ON_CUSTOMER', 'FOLLOW_UP', 'HANDOFF', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ConversationParticipantType" AS ENUM ('CONTACT', 'ORGANIZATION_MEMBER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ConversationParticipantRole" AS ENUM ('CUSTOMER', 'ASSIGNEE', 'OBSERVER', 'AUTOMATION');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "MessageAuthorType" AS ENUM ('CONTACT', 'HUMAN', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'STICKER', 'LOCATION', 'CONTACTS', 'INTERACTIVE', 'REACTION', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "MessageCurrentStatus" AS ENUM ('RECEIVED', 'DRAFT', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "MessageDeliveryState" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "ConversationAssignmentStatus" AS ENUM ('ACTIVE', 'RELEASED');

-- CreateEnum
CREATE TYPE "FollowUpConsentStatus" AS ENUM ('UNKNOWN', 'NO_CONSENT', 'OPTED_IN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('NOT_SCHEDULED', 'SCHEDULED', 'DUE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'PROVIDER');

-- CreateTable
CREATE TABLE "WhatsAppConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "configuredById" TEXT NOT NULL,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "displayPhoneNumber" TEXT,
    "verifiedName" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenCiphertext" BYTEA,
    "tokenIv" BYTEA,
    "tokenAuthTag" BYTEA,
    "tokenKeyVersion" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "webhookSubscribedAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "lastWebhookAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWebhookDelivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "payloadSha256" TEXT NOT NULL,
    "rawStorageProvider" TEXT NOT NULL,
    "rawBucket" TEXT NOT NULL,
    "rawStorageKey" TEXT NOT NULL,
    "rawSizeBytes" BIGINT NOT NULL,
    "status" "WhatsAppWebhookDeliveryStatus" NOT NULL DEFAULT 'RECEIVED',
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "processedEventCount" INTEGER NOT NULL DEFAULT 0,
    "failedEventCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "rawDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppWebhookEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "providerEventKey" TEXT NOT NULL,
    "eventType" "WhatsAppWebhookEventType" NOT NULL,
    "providerMessageId" TEXT,
    "normalizedPayload" JSONB,
    "status" "WhatsAppWebhookEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "phoneE164" TEXT,
    "displayName" TEXT,
    "locale" TEXT,
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL DEFAULT 'WHATSAPP',
    "campaignId" TEXT,
    "campaignCreativeId" TEXT,
    "productId" TEXT,
    "providerClickId" TEXT,
    "providerAdId" TEXT,
    "referralSourceUrl" TEXT,
    "firstInboundAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadQualification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" "LeadQualificationStage" NOT NULL DEFAULT 'UNASSESSED',
    "need" TEXT,
    "budget" TEXT,
    "timeline" TEXT,
    "decisionMaker" TEXT,
    "score" INTEGER,
    "notes" TEXT,
    "updatedById" TEXT,
    "qualifiedAt" TIMESTAMP(3),
    "disqualifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "leadId" TEXT,
    "conversationKey" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'OPEN',
    "currentAssignedOrganizationMemberId" TEXT,
    "automationSuppressedAt" TIMESTAMP(3),
    "automationSuppressionReason" TEXT,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "handedOffAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "participantType" "ConversationParticipantType" NOT NULL,
    "role" "ConversationParticipantRole" NOT NULL,
    "contactId" TEXT,
    "organizationMemberId" TEXT,
    "displayName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceWebhookEventId" TEXT,
    "providerMessageId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "authorType" "MessageAuthorType" NOT NULL,
    "authoredByOrganizationMemberId" TEXT,
    "authoredByContactId" TEXT,
    "contentType" "MessageContentType" NOT NULL,
    "textBody" TEXT,
    "content" JSONB,
    "providerMediaId" TEXT,
    "mediaMimeType" TEXT,
    "mediaFileName" TEXT,
    "mediaSha256" TEXT,
    "replyToMessageId" TEXT,
    "currentStatus" "MessageCurrentStatus" NOT NULL,
    "providerTimestamp" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDeliveryStatus" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sourceWebhookEventId" TEXT,
    "providerEventKey" TEXT NOT NULL,
    "status" "MessageDeliveryState" NOT NULL,
    "providerTimestamp" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorTitle" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDeliveryStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "assignedOrganizationMemberId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "releasedById" TEXT,
    "status" "ConversationAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT,
    "consentStatus" "FollowUpConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consentSource" TEXT,
    "consentCapturedAt" TIMESTAMP(3),
    "optedOutAt" TIMESTAMP(3),
    "status" "FollowUpStatus" NOT NULL DEFAULT 'NOT_SCHEDULED',
    "nextFollowUpAt" TIMESTAMP(3),
    "lastFollowUpAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_phoneNumberId_key" ON "WhatsAppConnection"("phoneNumberId");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_organizationId_status_idx" ON "WhatsAppConnection"("organizationId", "status");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_organizationId_wabaId_idx" ON "WhatsAppConnection"("organizationId", "wabaId");

-- CreateIndex
CREATE INDEX "WhatsAppConnection_configuredById_idx" ON "WhatsAppConnection"("configuredById");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppConnection_organizationId_id_key" ON "WhatsAppConnection"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookDelivery_rawStorageKey_key" ON "WhatsAppWebhookDelivery"("rawStorageKey");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookDelivery_organizationId_receivedAt_idx" ON "WhatsAppWebhookDelivery"("organizationId", "receivedAt");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookDelivery_expiresAt_rawDeletedAt_idx" ON "WhatsAppWebhookDelivery"("expiresAt", "rawDeletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookDelivery_organizationId_id_key" ON "WhatsAppWebhookDelivery"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookDelivery_connectionId_payloadSha256_key" ON "WhatsAppWebhookDelivery"("connectionId", "payloadSha256");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_organizationId_status_availableAt_idx" ON "WhatsAppWebhookEvent"("organizationId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_status_availableAt_leaseExpiresAt_idx" ON "WhatsAppWebhookEvent"("status", "availableAt", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "WhatsAppWebhookEvent_providerMessageId_idx" ON "WhatsAppWebhookEvent"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_organizationId_id_key" ON "WhatsAppWebhookEvent"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_connectionId_providerEventKey_key" ON "WhatsAppWebhookEvent"("connectionId", "providerEventKey");

-- CreateIndex
CREATE INDEX "Contact_organizationId_status_lastSeenAt_idx" ON "Contact"("organizationId", "status", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_id_key" ON "Contact"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_waId_key" ON "Contact"("organizationId", "waId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_phoneE164_key" ON "Contact"("organizationId", "phoneE164");

-- CreateIndex
CREATE INDEX "Lead_organizationId_status_lastActivityAt_idx" ON "Lead"("organizationId", "status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_contactId_status_idx" ON "Lead"("organizationId", "contactId", "status");

-- CreateIndex
CREATE INDEX "Lead_organizationId_campaignId_idx" ON "Lead"("organizationId", "campaignId");

-- CreateIndex
CREATE INDEX "Lead_organizationId_productId_idx" ON "Lead"("organizationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_organizationId_id_key" ON "Lead"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadQualification_leadId_key" ON "LeadQualification"("leadId");

-- CreateIndex
CREATE INDEX "LeadQualification_organizationId_stage_idx" ON "LeadQualification"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "LeadQualification_updatedById_idx" ON "LeadQualification"("updatedById");

-- CreateIndex
CREATE UNIQUE INDEX "LeadQualification_organizationId_id_key" ON "LeadQualification"("organizationId", "id");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_status_lastMessageAt_idx" ON "Conversation"("organizationId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_currentAssignedOrganizationMemb_idx" ON "Conversation"("organizationId", "currentAssignedOrganizationMemberId", "status");

-- CreateIndex
CREATE INDEX "Conversation_organizationId_contactId_idx" ON "Conversation"("organizationId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_organizationId_id_key" ON "Conversation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_organizationId_connectionId_conversationKey_key" ON "Conversation"("organizationId", "connectionId", "conversationKey");

-- CreateIndex
CREATE INDEX "ConversationParticipant_organizationId_conversationId_role_idx" ON "ConversationParticipant"("organizationId", "conversationId", "role");

-- CreateIndex
CREATE INDEX "ConversationParticipant_contactId_idx" ON "ConversationParticipant"("contactId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_organizationMemberId_idx" ON "ConversationParticipant"("organizationMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_organizationId_id_key" ON "ConversationParticipant"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Message_sourceWebhookEventId_key" ON "Message"("sourceWebhookEventId");

-- CreateIndex
CREATE INDEX "Message_organizationId_conversationId_createdAt_idx" ON "Message"("organizationId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_organizationId_currentStatus_updatedAt_idx" ON "Message"("organizationId", "currentStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_authoredByOrganizationMemberId_idx" ON "Message"("authoredByOrganizationMemberId");

-- CreateIndex
CREATE INDEX "Message_authoredByContactId_idx" ON "Message"("authoredByContactId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_organizationId_id_key" ON "Message"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Message_connectionId_providerMessageId_key" ON "Message"("connectionId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDeliveryStatus_sourceWebhookEventId_key" ON "MessageDeliveryStatus"("sourceWebhookEventId");

-- CreateIndex
CREATE INDEX "MessageDeliveryStatus_organizationId_messageId_createdAt_idx" ON "MessageDeliveryStatus"("organizationId", "messageId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDeliveryStatus_organizationId_id_key" ON "MessageDeliveryStatus"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDeliveryStatus_organizationId_providerEventKey_key" ON "MessageDeliveryStatus"("organizationId", "providerEventKey");

-- CreateIndex
CREATE INDEX "ConversationAssignment_organizationId_conversationId_status_idx" ON "ConversationAssignment"("organizationId", "conversationId", "status");

-- CreateIndex
CREATE INDEX "ConversationAssignment_organizationId_assignedOrganizationM_idx" ON "ConversationAssignment"("organizationId", "assignedOrganizationMemberId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationAssignment_organizationId_id_key" ON "ConversationAssignment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpState_leadId_key" ON "FollowUpState"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpState_conversationId_key" ON "FollowUpState"("conversationId");

-- CreateIndex
CREATE INDEX "FollowUpState_organizationId_consentStatus_status_idx" ON "FollowUpState"("organizationId", "consentStatus", "status");

-- CreateIndex
CREATE INDEX "FollowUpState_organizationId_nextFollowUpAt_idx" ON "FollowUpState"("organizationId", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "FollowUpState_contactId_idx" ON "FollowUpState"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpState_organizationId_id_key" ON "FollowUpState"("organizationId", "id");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_organizationId_id_key" ON "AuditEvent"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_configuredById_fkey" FOREIGN KEY ("configuredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookDelivery" ADD CONSTRAINT "WhatsAppWebhookDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookDelivery" ADD CONSTRAINT "WhatsAppWebhookDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppWebhookEvent" ADD CONSTRAINT "WhatsAppWebhookEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WhatsAppWebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignCreativeId_fkey" FOREIGN KEY ("campaignCreativeId") REFERENCES "CampaignCreative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_currentAssignedOrganizationMemberId_fkey" FOREIGN KEY ("currentAssignedOrganizationMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_organizationMemberId_fkey" FOREIGN KEY ("organizationMemberId") REFERENCES "OrganizationMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WhatsAppConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sourceWebhookEventId_fkey" FOREIGN KEY ("sourceWebhookEventId") REFERENCES "WhatsAppWebhookEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authoredByOrganizationMemberId_fkey" FOREIGN KEY ("authoredByOrganizationMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_authoredByContactId_fkey" FOREIGN KEY ("authoredByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeliveryStatus" ADD CONSTRAINT "MessageDeliveryStatus_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeliveryStatus" ADD CONSTRAINT "MessageDeliveryStatus_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeliveryStatus" ADD CONSTRAINT "MessageDeliveryStatus_sourceWebhookEventId_fkey" FOREIGN KEY ("sourceWebhookEventId") REFERENCES "WhatsAppWebhookEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_assignedOrganizationMemberId_fkey" FOREIGN KEY ("assignedOrganizationMemberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAssignment" ADD CONSTRAINT "ConversationAssignment_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpState" ADD CONSTRAINT "FollowUpState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpState" ADD CONSTRAINT "FollowUpState_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpState" ADD CONSTRAINT "FollowUpState_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpState" ADD CONSTRAINT "FollowUpState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpState" ADD CONSTRAINT "FollowUpState_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
