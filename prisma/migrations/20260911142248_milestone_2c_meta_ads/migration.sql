-- CreateEnum
CREATE TYPE "MetaConnectionStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'EXPIRED', 'REVOKED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "MetaAssetAccessStatus" AS ENUM ('ACCESSIBLE', 'INACCESSIBLE', 'REMOVED');

-- CreateEnum
CREATE TYPE "MetaPublicationStatus" AS ENUM ('NOT_CONFIGURED', 'NEEDS_CONNECTION', 'CONFIGURING', 'VALIDATING', 'INVALID', 'READY_FOR_APPROVAL', 'APPROVED', 'QUEUED', 'PUBLISHING', 'PUBLISHED_PAUSED', 'PARTIALLY_PUBLISHED', 'FAILED', 'RECONCILIATION_REQUIRED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "MetaValidationStatus" AS ENUM ('PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "MetaPublishJobStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'RETRY_SCHEDULED', 'SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MetaPublishStepType" AS ENUM ('CAMPAIGN', 'MEDIA', 'AD_SET', 'CREATIVE', 'AD', 'STATUS_SYNC');

-- CreateEnum
CREATE TYPE "MetaPublishStepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRYABLE_FAILED', 'TERMINAL_FAILED', 'AMBIGUOUS', 'RECONCILING');

-- CreateEnum
CREATE TYPE "MetaAudienceTargetType" AS ENUM ('COUNTRY', 'REGION', 'CITY', 'INTEREST');

-- CreateEnum
CREATE TYPE "MetaConversionLocation" AS ENUM ('WEBSITE');

-- CreateEnum
CREATE TYPE "MetaOptimizationGoal" AS ENUM ('REACH', 'IMPRESSIONS', 'LINK_CLICKS', 'LANDING_PAGE_VIEWS', 'OFFSITE_CONVERSIONS');

-- CreateEnum
CREATE TYPE "MetaCallToAction" AS ENUM ('SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'CONTACT_US');

-- CreateTable
CREATE TABLE "MetaOAuthState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "redirectPath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectedById" TEXT NOT NULL,
    "metaUserId" TEXT NOT NULL,
    "metaUserName" TEXT,
    "status" "MetaConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenCiphertext" BYTEA NOT NULL,
    "tokenIv" BYTEA NOT NULL,
    "tokenAuthTag" BYTEA NOT NULL,
    "tokenKeyVersion" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "dataAccessExpiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaBusiness" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verificationStatus" TEXT,
    "accessStatus" "MetaAssetAccessStatus" NOT NULL DEFAULT 'ACCESSIBLE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaBusiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "businessId" TEXT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL,
    "timezoneName" TEXT,
    "timezoneOffsetMinutes" INTEGER,
    "accountStatus" TEXT,
    "disableReason" TEXT,
    "accessStatus" "MetaAssetAccessStatus" NOT NULL DEFAULT 'ACCESSIBLE',
    "capabilities" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "businessId" TEXT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessStatus" "MetaAssetAccessStatus" NOT NULL DEFAULT 'ACCESSIBLE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaInstagramAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "username" TEXT,
    "name" TEXT,
    "accessStatus" "MetaAssetAccessStatus" NOT NULL DEFAULT 'ACCESSIBLE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaInstagramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaDataset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "businessId" TEXT,
    "adAccountId" TEXT,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessStatus" "MetaAssetAccessStatus" NOT NULL DEFAULT 'ACCESSIBLE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMetaSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "publishingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "defaultConnectionId" TEXT,
    "defaultBusinessId" TEXT,
    "defaultAdAccountId" TEXT,
    "defaultPageId" TEXT,
    "defaultInstagramAccountId" TEXT,
    "defaultDatasetId" TEXT,
    "lastAssetSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMetaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMetaConfiguration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "instagramAccountId" TEXT,
    "datasetId" TEXT,
    "status" "MetaPublicationStatus" NOT NULL DEFAULT 'CONFIGURING',
    "conversionLocation" "MetaConversionLocation" NOT NULL DEFAULT 'WEBSITE',
    "optimizationGoal" "MetaOptimizationGoal",
    "callToAction" "MetaCallToAction",
    "specialAdCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "beneficiaryName" TEXT,
    "payorName" TEXT,
    "configurationVersion" INTEGER NOT NULL DEFAULT 1,
    "lastValidatedHash" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "lastApprovedHash" TEXT,
    "lastApprovedAt" TIMESTAMP(3),
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMetaConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMetaAudienceTarget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "type" "MetaAudienceTargetType" NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "externalName" TEXT NOT NULL,
    "countryCode" VARCHAR(2),
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "invalidReason" TEXT,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMetaAudienceTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignMetaAd" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "campaignCreativeId" TEXT NOT NULL,
    "campaignProductId" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "primaryText" TEXT NOT NULL,
    "headline" TEXT,
    "description" TEXT,
    "callToAction" "MetaCallToAction" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMetaAd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCreativeApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignCreativeId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "assetChecksum" TEXT,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "CampaignCreativeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaignValidation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "validatedById" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "status" "MetaValidationStatus" NOT NULL,
    "errors" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "providerMetadata" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaCampaignValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPublishApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "validationId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "MetaPublishApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPublishJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "status" "MetaPublishJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPublishStep" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "MetaPublishStepType" NOT NULL,
    "localKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "publicationMarker" TEXT NOT NULL,
    "externalId" TEXT,
    "status" "MetaPublishStepStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPublishStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPublishAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "MetaPublishStepStatus" NOT NULL,
    "providerTraceId" TEXT,
    "httpStatus" INTEGER,
    "errorCode" TEXT,
    "errorSubcode" TEXT,
    "errorMessage" TEXT,
    "retryAfterSeconds" INTEGER,
    "responseMetadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaPublishAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCampaignMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "configurationId" TEXT NOT NULL,
    "publishJobId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "externalCampaignId" TEXT NOT NULL,
    "configuredStatus" TEXT NOT NULL DEFAULT 'PAUSED',
    "effectiveStatus" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCampaignMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdSetMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignMappingId" TEXT NOT NULL,
    "localKey" TEXT NOT NULL,
    "externalAdSetId" TEXT NOT NULL,
    "configuredStatus" TEXT NOT NULL DEFAULT 'PAUSED',
    "effectiveStatus" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdSetMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaMediaMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "campaignCreativeId" TEXT NOT NULL,
    "assetChecksum" TEXT NOT NULL,
    "externalImageHash" TEXT NOT NULL,
    "externalImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaMediaMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCreativeMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignMetaAdId" TEXT NOT NULL,
    "mediaMappingId" TEXT NOT NULL,
    "externalCreativeId" TEXT NOT NULL,
    "effectiveStatus" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCreativeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAdMapping" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignMetaAdId" TEXT NOT NULL,
    "adSetMappingId" TEXT NOT NULL,
    "creativeMappingId" TEXT NOT NULL,
    "externalAdId" TEXT NOT NULL,
    "configuredStatus" TEXT NOT NULL DEFAULT 'PAUSED',
    "effectiveStatus" TEXT,
    "reviewFeedback" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaAdMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaAuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaOAuthState_stateHash_key" ON "MetaOAuthState"("stateHash");

-- CreateIndex
CREATE INDEX "MetaOAuthState_organizationId_expiresAt_idx" ON "MetaOAuthState"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "MetaOAuthState_initiatedById_idx" ON "MetaOAuthState"("initiatedById");

-- CreateIndex
CREATE UNIQUE INDEX "MetaOAuthState_organizationId_id_key" ON "MetaOAuthState"("organizationId", "id");

-- CreateIndex
CREATE INDEX "MetaConnection_organizationId_status_idx" ON "MetaConnection"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MetaConnection_connectedById_idx" ON "MetaConnection"("connectedById");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_organizationId_id_key" ON "MetaConnection"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaConnection_organizationId_metaUserId_key" ON "MetaConnection"("organizationId", "metaUserId");

-- CreateIndex
CREATE INDEX "MetaBusiness_organizationId_accessStatus_idx" ON "MetaBusiness"("organizationId", "accessStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MetaBusiness_organizationId_id_key" ON "MetaBusiness"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaBusiness_organizationId_connectionId_externalId_key" ON "MetaBusiness"("organizationId", "connectionId", "externalId");

-- CreateIndex
CREATE INDEX "MetaAdAccount_organizationId_accessStatus_idx" ON "MetaAdAccount"("organizationId", "accessStatus");

-- CreateIndex
CREATE INDEX "MetaAdAccount_businessId_idx" ON "MetaAdAccount"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_organizationId_id_key" ON "MetaAdAccount"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdAccount_organizationId_connectionId_externalId_key" ON "MetaAdAccount"("organizationId", "connectionId", "externalId");

-- CreateIndex
CREATE INDEX "MetaPage_organizationId_accessStatus_idx" ON "MetaPage"("organizationId", "accessStatus");

-- CreateIndex
CREATE INDEX "MetaPage_businessId_idx" ON "MetaPage"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPage_organizationId_id_key" ON "MetaPage"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPage_organizationId_connectionId_externalId_key" ON "MetaPage"("organizationId", "connectionId", "externalId");

-- CreateIndex
CREATE INDEX "MetaInstagramAccount_organizationId_accessStatus_idx" ON "MetaInstagramAccount"("organizationId", "accessStatus");

-- CreateIndex
CREATE INDEX "MetaInstagramAccount_pageId_idx" ON "MetaInstagramAccount"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInstagramAccount_organizationId_id_key" ON "MetaInstagramAccount"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaInstagramAccount_organizationId_connectionId_externalId_key" ON "MetaInstagramAccount"("organizationId", "connectionId", "externalId");

-- CreateIndex
CREATE INDEX "MetaDataset_organizationId_accessStatus_idx" ON "MetaDataset"("organizationId", "accessStatus");

-- CreateIndex
CREATE INDEX "MetaDataset_businessId_idx" ON "MetaDataset"("businessId");

-- CreateIndex
CREATE INDEX "MetaDataset_adAccountId_idx" ON "MetaDataset"("adAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaDataset_organizationId_id_key" ON "MetaDataset"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaDataset_organizationId_connectionId_externalId_key" ON "MetaDataset"("organizationId", "connectionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMetaSettings_organizationId_key" ON "OrganizationMetaSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMetaConfiguration_campaignId_key" ON "CampaignMetaConfiguration"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignMetaConfiguration_organizationId_status_idx" ON "CampaignMetaConfiguration"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CampaignMetaConfiguration_connectionId_idx" ON "CampaignMetaConfiguration"("connectionId");

-- CreateIndex
CREATE INDEX "CampaignMetaConfiguration_adAccountId_idx" ON "CampaignMetaConfiguration"("adAccountId");

-- CreateIndex
CREATE INDEX "CampaignMetaConfiguration_pageId_idx" ON "CampaignMetaConfiguration"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMetaConfiguration_organizationId_id_key" ON "CampaignMetaConfiguration"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CampaignMetaAudienceTarget_organizationId_configurationId_idx" ON "CampaignMetaAudienceTarget"("organizationId", "configurationId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMetaAudienceTarget_organizationId_id_key" ON "CampaignMetaAudienceTarget"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMetaAudienceTarget_configurationId_type_externalKey_key" ON "CampaignMetaAudienceTarget"("configurationId", "type", "externalKey");

-- CreateIndex
CREATE INDEX "CampaignMetaAd_organizationId_configurationId_idx" ON "CampaignMetaAd"("organizationId", "configurationId");

-- CreateIndex
CREATE INDEX "CampaignMetaAd_campaignCreativeId_idx" ON "CampaignMetaAd"("campaignCreativeId");

-- CreateIndex
CREATE INDEX "CampaignMetaAd_campaignProductId_idx" ON "CampaignMetaAd"("campaignProductId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignMetaAd_organizationId_id_key" ON "CampaignMetaAd"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CampaignCreativeApproval_organizationId_campaignCreativeId__idx" ON "CampaignCreativeApproval"("organizationId", "campaignCreativeId", "approvedAt");

-- CreateIndex
CREATE INDEX "CampaignCreativeApproval_approvedById_idx" ON "CampaignCreativeApproval"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCreativeApproval_organizationId_id_key" ON "CampaignCreativeApproval"("organizationId", "id");

-- CreateIndex
CREATE INDEX "MetaCampaignValidation_organizationId_configurationId_creat_idx" ON "MetaCampaignValidation"("organizationId", "configurationId", "createdAt");

-- CreateIndex
CREATE INDEX "MetaCampaignValidation_snapshotHash_idx" ON "MetaCampaignValidation"("snapshotHash");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignValidation_organizationId_id_key" ON "MetaCampaignValidation"("organizationId", "id");

-- CreateIndex
CREATE INDEX "MetaPublishApproval_campaignId_idx" ON "MetaPublishApproval"("campaignId");

-- CreateIndex
CREATE INDEX "MetaPublishApproval_approvedById_idx" ON "MetaPublishApproval"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishApproval_organizationId_id_key" ON "MetaPublishApproval"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishApproval_organizationId_configurationId_snapshot_key" ON "MetaPublishApproval"("organizationId", "configurationId", "snapshotHash");

-- CreateIndex
CREATE INDEX "MetaPublishJob_status_availableAt_leaseExpiresAt_idx" ON "MetaPublishJob"("status", "availableAt", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "MetaPublishJob_organizationId_campaignId_createdAt_idx" ON "MetaPublishJob"("organizationId", "campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishJob_organizationId_id_key" ON "MetaPublishJob"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishJob_organizationId_idempotencyKey_key" ON "MetaPublishJob"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MetaPublishStep_organizationId_status_idx" ON "MetaPublishStep"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishStep_organizationId_id_key" ON "MetaPublishStep"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishStep_jobId_type_localKey_key" ON "MetaPublishStep"("jobId", "type", "localKey");

-- CreateIndex
CREATE INDEX "MetaPublishAttempt_organizationId_status_idx" ON "MetaPublishAttempt"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishAttempt_organizationId_id_key" ON "MetaPublishAttempt"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPublishAttempt_stepId_attemptNumber_key" ON "MetaPublishAttempt"("stepId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignMapping_campaignId_key" ON "MetaCampaignMapping"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignMapping_configurationId_key" ON "MetaCampaignMapping"("configurationId");

-- CreateIndex
CREATE INDEX "MetaCampaignMapping_organizationId_effectiveStatus_idx" ON "MetaCampaignMapping"("organizationId", "effectiveStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignMapping_organizationId_id_key" ON "MetaCampaignMapping"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCampaignMapping_organizationId_adAccountId_externalCamp_key" ON "MetaCampaignMapping"("organizationId", "adAccountId", "externalCampaignId");

-- CreateIndex
CREATE INDEX "MetaAdSetMapping_organizationId_effectiveStatus_idx" ON "MetaAdSetMapping"("organizationId", "effectiveStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSetMapping_organizationId_id_key" ON "MetaAdSetMapping"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSetMapping_campaignMappingId_localKey_key" ON "MetaAdSetMapping"("campaignMappingId", "localKey");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdSetMapping_organizationId_externalAdSetId_key" ON "MetaAdSetMapping"("organizationId", "externalAdSetId");

-- CreateIndex
CREATE INDEX "MetaMediaMapping_organizationId_externalImageHash_idx" ON "MetaMediaMapping"("organizationId", "externalImageHash");

-- CreateIndex
CREATE UNIQUE INDEX "MetaMediaMapping_organizationId_id_key" ON "MetaMediaMapping"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaMediaMapping_organizationId_adAccountId_campaignCreativ_key" ON "MetaMediaMapping"("organizationId", "adAccountId", "campaignCreativeId", "assetChecksum");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCreativeMapping_campaignMetaAdId_key" ON "MetaCreativeMapping"("campaignMetaAdId");

-- CreateIndex
CREATE INDEX "MetaCreativeMapping_mediaMappingId_idx" ON "MetaCreativeMapping"("mediaMappingId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCreativeMapping_organizationId_id_key" ON "MetaCreativeMapping"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaCreativeMapping_organizationId_externalCreativeId_key" ON "MetaCreativeMapping"("organizationId", "externalCreativeId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdMapping_campaignMetaAdId_key" ON "MetaAdMapping"("campaignMetaAdId");

-- CreateIndex
CREATE INDEX "MetaAdMapping_organizationId_effectiveStatus_idx" ON "MetaAdMapping"("organizationId", "effectiveStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdMapping_organizationId_id_key" ON "MetaAdMapping"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAdMapping_organizationId_externalAdId_key" ON "MetaAdMapping"("organizationId", "externalAdId");

-- CreateIndex
CREATE INDEX "MetaAuditEvent_organizationId_createdAt_idx" ON "MetaAuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MetaAuditEvent_entityType_entityId_idx" ON "MetaAuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaAuditEvent_organizationId_id_key" ON "MetaAuditEvent"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "MetaOAuthState" ADD CONSTRAINT "MetaOAuthState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaOAuthState" ADD CONSTRAINT "MetaOAuthState_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaBusiness" ADD CONSTRAINT "MetaBusiness_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaBusiness" ADD CONSTRAINT "MetaBusiness_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdAccount" ADD CONSTRAINT "MetaAdAccount_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "MetaBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPage" ADD CONSTRAINT "MetaPage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "MetaBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInstagramAccount" ADD CONSTRAINT "MetaInstagramAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInstagramAccount" ADD CONSTRAINT "MetaInstagramAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaInstagramAccount" ADD CONSTRAINT "MetaInstagramAccount_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "MetaPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaDataset" ADD CONSTRAINT "MetaDataset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaDataset" ADD CONSTRAINT "MetaDataset_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaDataset" ADD CONSTRAINT "MetaDataset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "MetaBusiness"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaDataset" ADD CONSTRAINT "MetaDataset_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMetaSettings" ADD CONSTRAINT "OrganizationMetaSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaConfiguration" ADD CONSTRAINT "CampaignMetaConfiguration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaConfiguration" ADD CONSTRAINT "CampaignMetaConfiguration_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaConfiguration" ADD CONSTRAINT "CampaignMetaConfiguration_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "MetaConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaConfiguration" ADD CONSTRAINT "CampaignMetaConfiguration_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaConfiguration" ADD CONSTRAINT "CampaignMetaConfiguration_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "MetaPage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaConfiguration" ADD CONSTRAINT "CampaignMetaConfiguration_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "MetaInstagramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaConfiguration" ADD CONSTRAINT "CampaignMetaConfiguration_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "MetaDataset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaAudienceTarget" ADD CONSTRAINT "CampaignMetaAudienceTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaAudienceTarget" ADD CONSTRAINT "CampaignMetaAudienceTarget_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "CampaignMetaConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaAd" ADD CONSTRAINT "CampaignMetaAd_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaAd" ADD CONSTRAINT "CampaignMetaAd_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "CampaignMetaConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaAd" ADD CONSTRAINT "CampaignMetaAd_campaignCreativeId_fkey" FOREIGN KEY ("campaignCreativeId") REFERENCES "CampaignCreative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignMetaAd" ADD CONSTRAINT "CampaignMetaAd_campaignProductId_fkey" FOREIGN KEY ("campaignProductId") REFERENCES "CampaignProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreativeApproval" ADD CONSTRAINT "CampaignCreativeApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreativeApproval" ADD CONSTRAINT "CampaignCreativeApproval_campaignCreativeId_fkey" FOREIGN KEY ("campaignCreativeId") REFERENCES "CampaignCreative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreativeApproval" ADD CONSTRAINT "CampaignCreativeApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignValidation" ADD CONSTRAINT "MetaCampaignValidation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignValidation" ADD CONSTRAINT "MetaCampaignValidation_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "CampaignMetaConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignValidation" ADD CONSTRAINT "MetaCampaignValidation_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishApproval" ADD CONSTRAINT "MetaPublishApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishApproval" ADD CONSTRAINT "MetaPublishApproval_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishApproval" ADD CONSTRAINT "MetaPublishApproval_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "CampaignMetaConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishApproval" ADD CONSTRAINT "MetaPublishApproval_validationId_fkey" FOREIGN KEY ("validationId") REFERENCES "MetaCampaignValidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishApproval" ADD CONSTRAINT "MetaPublishApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishJob" ADD CONSTRAINT "MetaPublishJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishJob" ADD CONSTRAINT "MetaPublishJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishJob" ADD CONSTRAINT "MetaPublishJob_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "CampaignMetaConfiguration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishJob" ADD CONSTRAINT "MetaPublishJob_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "MetaPublishApproval"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishJob" ADD CONSTRAINT "MetaPublishJob_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishStep" ADD CONSTRAINT "MetaPublishStep_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishStep" ADD CONSTRAINT "MetaPublishStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MetaPublishJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishAttempt" ADD CONSTRAINT "MetaPublishAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPublishAttempt" ADD CONSTRAINT "MetaPublishAttempt_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "MetaPublishStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignMapping" ADD CONSTRAINT "MetaCampaignMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignMapping" ADD CONSTRAINT "MetaCampaignMapping_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignMapping" ADD CONSTRAINT "MetaCampaignMapping_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "CampaignMetaConfiguration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignMapping" ADD CONSTRAINT "MetaCampaignMapping_publishJobId_fkey" FOREIGN KEY ("publishJobId") REFERENCES "MetaPublishJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCampaignMapping" ADD CONSTRAINT "MetaCampaignMapping_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSetMapping" ADD CONSTRAINT "MetaAdSetMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdSetMapping" ADD CONSTRAINT "MetaAdSetMapping_campaignMappingId_fkey" FOREIGN KEY ("campaignMappingId") REFERENCES "MetaCampaignMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMediaMapping" ADD CONSTRAINT "MetaMediaMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMediaMapping" ADD CONSTRAINT "MetaMediaMapping_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "MetaAdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaMediaMapping" ADD CONSTRAINT "MetaMediaMapping_campaignCreativeId_fkey" FOREIGN KEY ("campaignCreativeId") REFERENCES "CampaignCreative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCreativeMapping" ADD CONSTRAINT "MetaCreativeMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCreativeMapping" ADD CONSTRAINT "MetaCreativeMapping_campaignMetaAdId_fkey" FOREIGN KEY ("campaignMetaAdId") REFERENCES "CampaignMetaAd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCreativeMapping" ADD CONSTRAINT "MetaCreativeMapping_mediaMappingId_fkey" FOREIGN KEY ("mediaMappingId") REFERENCES "MetaMediaMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdMapping" ADD CONSTRAINT "MetaAdMapping_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdMapping" ADD CONSTRAINT "MetaAdMapping_campaignMetaAdId_fkey" FOREIGN KEY ("campaignMetaAdId") REFERENCES "CampaignMetaAd"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdMapping" ADD CONSTRAINT "MetaAdMapping_adSetMappingId_fkey" FOREIGN KEY ("adSetMappingId") REFERENCES "MetaAdSetMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAdMapping" ADD CONSTRAINT "MetaAdMapping_creativeMappingId_fkey" FOREIGN KEY ("creativeMappingId") REFERENCES "MetaCreativeMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAuditEvent" ADD CONSTRAINT "MetaAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaAuditEvent" ADD CONSTRAINT "MetaAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
