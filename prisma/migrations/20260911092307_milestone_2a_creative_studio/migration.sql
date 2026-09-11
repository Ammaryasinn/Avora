-- CreateEnum
CREATE TYPE "MediaUploadStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('PRODUCT_AD', 'LIFESTYLE_IMAGE', 'VIRTUAL_TRY_ON', 'INSTAGRAM_POST', 'STORY_STATUS', 'AD_COPY_ONLY');

-- CreateEnum
CREATE TYPE "CreativeStatus" AS ENUM ('DRAFT', 'GENERATING', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CreativeVariantStatus" AS ENUM ('DRAFT', 'READY', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CreativeVariantOrigin" AS ENUM ('AI_GENERATED', 'AI_EDITED', 'USER_EDITED');

-- CreateEnum
CREATE TYPE "CreativeAssetKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "CreativeAssetRole" AS ENUM ('PRODUCT_REFERENCE', 'PERSON_REFERENCE', 'GENERATED', 'EDITED', 'THUMBNAIL');

-- CreateEnum
CREATE TYPE "CreativeAssetStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'READY', 'QUARANTINED', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "AICapability" AS ENUM ('GENERATE_TEXT', 'GENERATE_IMAGE', 'EDIT_IMAGE', 'GENERATE_VIRTUAL_TRY_ON', 'GENERATE_VIDEO');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'RETRY_SCHEDULED', 'SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AIJobAttemptStatus" AS ENUM ('SUBMITTING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'PASSED', 'REVIEW_REQUIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "AIJobAssetDirection" AS ENUM ('INPUT', 'OUTPUT');

-- CreateEnum
CREATE TYPE "AICostSource" AS ENUM ('PROVIDER_REPORTED', 'AVORA_ESTIMATED');

-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN     "bucket" TEXT,
ADD COLUMN     "checksumSha256" TEXT,
ADD COLUMN     "fileSizeBytes" BIGINT,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "storageProvider" TEXT,
ADD COLUMN     "uploadStatus" "MediaUploadStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "Creative" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "type" "CreativeType" NOT NULL,
    "status" "CreativeStatus" NOT NULL DEFAULT 'DRAFT',
    "brief" JSONB NOT NULL,
    "briefSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "selectedVariantId" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Creative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeVariant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "sourceJobId" TEXT,
    "parentVariantId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" "CreativeVariantOrigin" NOT NULL,
    "status" "CreativeVariantStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "contentSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "variantId" TEXT,
    "sourceProductMediaId" TEXT,
    "generatedByAttemptId" TEXT,
    "parentAssetId" TEXT,
    "kind" "CreativeAssetKind" NOT NULL,
    "role" "CreativeAssetRole" NOT NULL,
    "status" "CreativeAssetStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "storageProvider" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "checksumSha256" TEXT,
    "altText" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "capability" "AICapability" NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'PENDING',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "promptTemplateKey" TEXT NOT NULL,
    "promptTemplateVersion" INTEGER NOT NULL DEFAULT 1,
    "input" JSONB NOT NULL,
    "requestedVariantCount" INTEGER NOT NULL DEFAULT 1,
    "reservedCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "costCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJobAttempt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "providerKey" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "providerRequestId" TEXT,
    "providerStatus" TEXT,
    "status" "AIJobAttemptStatus" NOT NULL DEFAULT 'SUBMITTING',
    "requestMetadata" JSONB,
    "responseMetadata" JSONB,
    "usage" JSONB,
    "inputTokens" BIGINT,
    "outputTokens" BIGINT,
    "imageCount" INTEGER,
    "durationMs" INTEGER,
    "cost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "costCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "costSource" "AICostSource" NOT NULL DEFAULT 'AVORA_ESTIMATED',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIJobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJobAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "direction" "AIJobAssetDirection" NOT NULL,
    "role" "CreativeAssetRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIJobAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "CreativeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationAISettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "textEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imageEnabled" BOOLEAN NOT NULL DEFAULT true,
    "imageEditEnabled" BOOLEAN NOT NULL DEFAULT true,
    "virtualTryOnEnabled" BOOLEAN NOT NULL DEFAULT true,
    "monthlyBudget" DECIMAL(18,8) NOT NULL DEFAULT 10,
    "perJobLimit" DECIMAL(18,8) NOT NULL DEFAULT 2,
    "maxConcurrentJobs" INTEGER NOT NULL DEFAULT 2,
    "maxRequestsPerMinute" INTEGER NOT NULL DEFAULT 10,
    "personRetentionDays" INTEGER NOT NULL DEFAULT 7,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationAISettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsagePeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "budget" DECIMAL(18,8) NOT NULL,
    "reservedCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "consumedCost" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIUsagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Creative_organizationId_status_updatedAt_idx" ON "Creative"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Creative_organizationId_productId_idx" ON "Creative"("organizationId", "productId");

-- CreateIndex
CREATE INDEX "Creative_createdById_idx" ON "Creative"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Creative_organizationId_id_key" ON "Creative"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CreativeVariant_organizationId_creativeId_status_idx" ON "CreativeVariant"("organizationId", "creativeId", "status");

-- CreateIndex
CREATE INDEX "CreativeVariant_sourceJobId_idx" ON "CreativeVariant"("sourceJobId");

-- CreateIndex
CREATE INDEX "CreativeVariant_parentVariantId_idx" ON "CreativeVariant"("parentVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeVariant_organizationId_id_key" ON "CreativeVariant"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CreativeAsset_organizationId_creativeId_status_idx" ON "CreativeAsset"("organizationId", "creativeId", "status");

-- CreateIndex
CREATE INDEX "CreativeAsset_organizationId_expiresAt_idx" ON "CreativeAsset"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "CreativeAsset_variantId_idx" ON "CreativeAsset"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeAsset_organizationId_id_key" ON "CreativeAsset"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeAsset_storageProvider_bucket_storageKey_key" ON "CreativeAsset"("storageProvider", "bucket", "storageKey");

-- CreateIndex
CREATE INDEX "AIJob_status_availableAt_leaseExpiresAt_idx" ON "AIJob"("status", "availableAt", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "AIJob_organizationId_creativeId_createdAt_idx" ON "AIJob"("organizationId", "creativeId", "createdAt");

-- CreateIndex
CREATE INDEX "AIJob_organizationId_status_idx" ON "AIJob"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AIJob_organizationId_id_key" ON "AIJob"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AIJob_organizationId_idempotencyKey_key" ON "AIJob"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AIJobAttempt_organizationId_status_idx" ON "AIJobAttempt"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AIJobAttempt_organizationId_id_key" ON "AIJobAttempt"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AIJobAttempt_jobId_attemptNumber_key" ON "AIJobAttempt"("jobId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AIJobAttempt_providerKey_providerRequestId_key" ON "AIJobAttempt"("providerKey", "providerRequestId");

-- CreateIndex
CREATE INDEX "AIJobAsset_organizationId_jobId_idx" ON "AIJobAsset"("organizationId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "AIJobAsset_jobId_assetId_direction_key" ON "AIJobAsset"("jobId", "assetId", "direction");

-- CreateIndex
CREATE INDEX "CreativeApproval_organizationId_creativeId_approvedAt_idx" ON "CreativeApproval"("organizationId", "creativeId", "approvedAt");

-- CreateIndex
CREATE INDEX "CreativeApproval_variantId_idx" ON "CreativeApproval"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationAISettings_organizationId_key" ON "OrganizationAISettings"("organizationId");

-- CreateIndex
CREATE INDEX "AIUsagePeriod_organizationId_periodEnd_idx" ON "AIUsagePeriod"("organizationId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsagePeriod_organizationId_periodStart_key" ON "AIUsagePeriod"("organizationId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_id_key" ON "Product"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMedia_organizationId_id_key" ON "ProductMedia"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creative" ADD CONSTRAINT "Creative_selectedVariantId_fkey" FOREIGN KEY ("selectedVariantId") REFERENCES "CreativeVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "AIJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_parentVariantId_fkey" FOREIGN KEY ("parentVariantId") REFERENCES "CreativeVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CreativeVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_sourceProductMediaId_fkey" FOREIGN KEY ("sourceProductMediaId") REFERENCES "ProductMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_generatedByAttemptId_fkey" FOREIGN KEY ("generatedByAttemptId") REFERENCES "AIJobAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeAsset" ADD CONSTRAINT "CreativeAsset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "CreativeAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJobAttempt" ADD CONSTRAINT "AIJobAttempt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJobAttempt" ADD CONSTRAINT "AIJobAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AIJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJobAsset" ADD CONSTRAINT "AIJobAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJobAsset" ADD CONSTRAINT "AIJobAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AIJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJobAsset" ADD CONSTRAINT "AIJobAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CreativeAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApproval" ADD CONSTRAINT "CreativeApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApproval" ADD CONSTRAINT "CreativeApproval_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApproval" ADD CONSTRAINT "CreativeApproval_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CreativeVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApproval" ADD CONSTRAINT "CreativeApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationAISettings" ADD CONSTRAINT "OrganizationAISettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsagePeriod" ADD CONSTRAINT "AIUsagePeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
