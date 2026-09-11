-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CampaignObjective" AS ENUM ('SALES', 'LEADS', 'TRAFFIC', 'AWARENESS');

-- CreateEnum
CREATE TYPE "CampaignAudienceGender" AS ENUM ('ALL', 'WOMEN', 'MEN');

-- CreateEnum
CREATE TYPE "CampaignBudgetType" AS ENUM ('DAILY', 'LIFETIME');

-- CreateEnum
CREATE TYPE "CampaignCreativeSource" AS ENUM ('APPROVED_CREATIVE', 'MANUAL_UPLOAD');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "CampaignObjective",
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignProduct" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignCreative" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "source" "CampaignCreativeSource" NOT NULL,
    "creativeId" TEXT,
    "variantId" TEXT,
    "creativeAssetId" TEXT,
    "label" TEXT,
    "storageProvider" TEXT,
    "bucket" TEXT,
    "storageKey" TEXT,
    "originalFileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" BIGINT,
    "checksumSha256" TEXT,
    "altText" TEXT,
    "uploadStatus" "MediaUploadStatus" NOT NULL DEFAULT 'READY',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignAudience" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "countryCode" VARCHAR(2),
    "regions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minimumAge" INTEGER,
    "maximumAge" INTEGER,
    "gender" "CampaignAudienceGender",
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "customAudienceDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignAudience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBudget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "CampaignBudgetType",
    "dailyBudget" DECIMAL(12,2),
    "lifetimeBudget" DECIMAL(12,2),
    "currencyCode" VARCHAR(3) NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignBudget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_organizationId_status_updatedAt_idx" ON "Campaign"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Campaign_createdById_idx" ON "Campaign"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_organizationId_id_key" ON "Campaign"("organizationId", "id");

-- CreateIndex
CREATE INDEX "CampaignProduct_organizationId_campaignId_idx" ON "CampaignProduct"("organizationId", "campaignId");

-- CreateIndex
CREATE INDEX "CampaignProduct_organizationId_productId_idx" ON "CampaignProduct"("organizationId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignProduct_organizationId_id_key" ON "CampaignProduct"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignProduct_campaignId_productId_key" ON "CampaignProduct"("campaignId", "productId");

-- CreateIndex
CREATE INDEX "CampaignCreative_organizationId_campaignId_source_idx" ON "CampaignCreative"("organizationId", "campaignId", "source");

-- CreateIndex
CREATE INDEX "CampaignCreative_organizationId_creativeId_idx" ON "CampaignCreative"("organizationId", "creativeId");

-- CreateIndex
CREATE INDEX "CampaignCreative_creativeAssetId_idx" ON "CampaignCreative"("creativeAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCreative_organizationId_id_key" ON "CampaignCreative"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCreative_campaignId_creativeId_key" ON "CampaignCreative"("campaignId", "creativeId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignCreative_storageProvider_bucket_storageKey_key" ON "CampaignCreative"("storageProvider", "bucket", "storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAudience_campaignId_key" ON "CampaignAudience"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignAudience_organizationId_campaignId_idx" ON "CampaignAudience"("organizationId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignAudience_organizationId_id_key" ON "CampaignAudience"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBudget_campaignId_key" ON "CampaignBudget"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignBudget_organizationId_campaignId_idx" ON "CampaignBudget"("organizationId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBudget_organizationId_id_key" ON "CampaignBudget"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreative" ADD CONSTRAINT "CampaignCreative_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreative" ADD CONSTRAINT "CampaignCreative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreative" ADD CONSTRAINT "CampaignCreative_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "Creative"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreative" ADD CONSTRAINT "CampaignCreative_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "CreativeVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignCreative" ADD CONSTRAINT "CampaignCreative_creativeAssetId_fkey" FOREIGN KEY ("creativeAssetId") REFERENCES "CreativeAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAudience" ADD CONSTRAINT "CampaignAudience_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignAudience" ADD CONSTRAINT "CampaignAudience_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBudget" ADD CONSTRAINT "CampaignBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBudget" ADD CONSTRAINT "CampaignBudget_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
