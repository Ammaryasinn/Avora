import "server-only";

import { createHash } from "node:crypto";

import { getDatabase } from "@/lib/db/database";

export async function buildMetaPublishSnapshot(
  organizationId: string,
  campaignId: string,
) {
  const configuration = await getDatabase().campaignMetaConfiguration.findFirst({
    where: { campaignId, organizationId },
    include: {
      connection: { select: { id: true, status: true, scopes: true } },
      adAccount: true,
      page: true,
      instagramAccount: true,
      dataset: true,
      audienceTargets: { orderBy: [{ type: "asc" }, { externalKey: "asc" }] },
      ads: {
        where: { enabled: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: {
          campaignProduct: { include: { product: { select: { id: true, name: true } } } },
          campaignCreative: {
            include: {
              creative: { select: { id: true, title: true, status: true, archivedAt: true } },
              creativeAsset: {
                select: {
                  id: true,
                  status: true,
                  storageProvider: true,
                  bucket: true,
                  storageKey: true,
                  checksumSha256: true,
                  mimeType: true,
                  fileSizeBytes: true,
                  deletedAt: true,
                },
              },
              metaApprovals: {
                where: { supersededAt: null },
                orderBy: { approvedAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
      campaign: {
        include: {
          audience: true,
          budget: true,
          products: {
            orderBy: { position: "asc" },
            include: { product: { select: { id: true, name: true, status: true, archivedAt: true } } },
          },
        },
      },
    },
  });
  if (!configuration) throw new Error("Meta campaign configuration was not found.");

  const snapshot = {
    version: 1,
    organizationId,
    configuration: {
      id: configuration.id,
      version: configuration.configurationVersion,
      conversionLocation: configuration.conversionLocation,
      optimizationGoal: configuration.optimizationGoal,
      callToAction: configuration.callToAction,
      specialAdCategories: configuration.specialAdCategories,
      beneficiaryName: configuration.beneficiaryName,
      payorName: configuration.payorName,
    },
    connection: configuration.connection,
    adAccount: {
      id: configuration.adAccount.id,
      externalId: configuration.adAccount.externalId,
      name: configuration.adAccount.name,
      currencyCode: configuration.adAccount.currencyCode,
      timezoneName: configuration.adAccount.timezoneName,
      timezoneOffsetMinutes: configuration.adAccount.timezoneOffsetMinutes,
      accountStatus: configuration.adAccount.accountStatus,
      accessStatus: configuration.adAccount.accessStatus,
    },
    page: {
      id: configuration.page.id,
      externalId: configuration.page.externalId,
      name: configuration.page.name,
      accessStatus: configuration.page.accessStatus,
    },
    instagramAccount: configuration.instagramAccount
      ? {
          id: configuration.instagramAccount.id,
          externalId: configuration.instagramAccount.externalId,
          username: configuration.instagramAccount.username,
          accessStatus: configuration.instagramAccount.accessStatus,
        }
      : null,
    dataset: configuration.dataset
      ? {
          id: configuration.dataset.id,
          externalId: configuration.dataset.externalId,
          name: configuration.dataset.name,
          accessStatus: configuration.dataset.accessStatus,
        }
      : null,
    campaign: {
      id: configuration.campaign.id,
      name: configuration.campaign.name,
      objective: configuration.campaign.objective,
      status: configuration.campaign.status,
      audience: configuration.campaign.audience
        ? {
            countryCode: configuration.campaign.audience.countryCode,
            minimumAge: configuration.campaign.audience.minimumAge,
            maximumAge: configuration.campaign.audience.maximumAge,
            gender: configuration.campaign.audience.gender,
            customAudienceDescription:
              configuration.campaign.audience.customAudienceDescription,
          }
        : null,
      budget: configuration.campaign.budget
        ? {
            type: configuration.campaign.budget.type,
            dailyBudget: configuration.campaign.budget.dailyBudget?.toFixed(2) ?? null,
            lifetimeBudget:
              configuration.campaign.budget.lifetimeBudget?.toFixed(2) ?? null,
            currencyCode: configuration.campaign.budget.currencyCode,
            startDate: configuration.campaign.budget.startDate?.toISOString() ?? null,
            endDate: configuration.campaign.budget.endDate?.toISOString() ?? null,
          }
        : null,
      products: configuration.campaign.products.map((item) => ({
        campaignProductId: item.id,
        productId: item.product.id,
        name: item.product.name,
        status: item.product.status,
        archived: item.product.archivedAt !== null,
      })),
    },
    targets: configuration.audienceTargets.map((target) => ({
      id: target.id,
      type: target.type,
      externalKey: target.externalKey,
      externalName: target.externalName,
      countryCode: target.countryCode,
      isValid: target.isValid,
    })),
    ads: configuration.ads.map((ad) => {
      const source = ad.campaignCreative;
      const asset = source.source === "MANUAL_UPLOAD"
        ? {
            id: source.id,
            storageProvider: source.storageProvider,
            bucket: source.bucket,
            storageKey: source.storageKey,
            checksumSha256: source.checksumSha256,
            mimeType: source.mimeType,
            fileSizeBytes: source.fileSizeBytes?.toString() ?? null,
            status: source.uploadStatus,
            deleted: false,
          }
        : source.creativeAsset
          ? {
              id: source.creativeAsset.id,
              storageProvider: source.creativeAsset.storageProvider,
              bucket: source.creativeAsset.bucket,
              storageKey: source.creativeAsset.storageKey,
              checksumSha256: source.creativeAsset.checksumSha256,
              mimeType: source.creativeAsset.mimeType,
              fileSizeBytes: source.creativeAsset.fileSizeBytes?.toString() ?? null,
              status: source.creativeAsset.status,
              deleted: source.creativeAsset.deletedAt !== null,
            }
          : null;
      return {
        id: ad.id,
        campaignCreativeId: source.id,
        source: source.source,
        sourceCreativeStatus: source.creative?.status ?? null,
        sourceCreativeArchived: source.creative?.archivedAt !== null,
        manualApprovalChecksum: source.metaApprovals[0]?.assetChecksum ?? null,
        product: ad.campaignProduct
          ? {
              campaignProductId: ad.campaignProduct.id,
              productId: ad.campaignProduct.product.id,
              name: ad.campaignProduct.product.name,
            }
          : null,
        destinationUrl: ad.destinationUrl,
        primaryText: ad.primaryText,
        headline: ad.headline,
        description: ad.description,
        callToAction: ad.callToAction,
        asset,
      };
    }),
  };
  const serialized = stableStringify(snapshot);
  return {
    snapshot,
    serialized,
    hash: createHash("sha256").update(serialized).digest("hex"),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export type MetaPublishSnapshot = Awaited<ReturnType<typeof buildMetaPublishSnapshot>>["snapshot"];
