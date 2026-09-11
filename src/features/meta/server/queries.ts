import "server-only";

import { getDatabase } from "@/lib/db/database";
import { getMetaAvailability } from "@/lib/meta/config";

export async function getMetaIntegrationOverview(organizationId: string) {
  const [connections, settings] = await Promise.all([
    getDatabase().metaConnection.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        metaUserName: true,
        status: true,
        scopes: true,
        tokenExpiresAt: true,
        dataAccessExpiresAt: true,
        lastValidatedAt: true,
        lastErrorMessage: true,
        updatedAt: true,
        _count: {
          select: {
            businesses: true,
            adAccounts: true,
            pages: true,
            instagramAccounts: true,
            datasets: true,
          },
        },
      },
    }),
    getDatabase().organizationMetaSettings.findUnique({ where: { organizationId } }),
  ]);

  return { connections, settings, availability: getMetaAvailability() };
}

export async function getMetaAssetOptions(organizationId: string) {
  const [connections, businesses, adAccounts, pages, instagramAccounts, datasets, settings] =
    await Promise.all([
      getDatabase().metaConnection.findMany({
        where: { organizationId, status: { in: ["CONNECTED", "DEGRADED"] } },
        select: { id: true, metaUserName: true, status: true },
      }),
      getDatabase().metaBusiness.findMany({
        where: { organizationId, accessStatus: "ACCESSIBLE" },
        orderBy: { name: "asc" },
      }),
      getDatabase().metaAdAccount.findMany({
        where: { organizationId, accessStatus: "ACCESSIBLE" },
        orderBy: { name: "asc" },
      }),
      getDatabase().metaPage.findMany({
        where: { organizationId, accessStatus: "ACCESSIBLE" },
        orderBy: { name: "asc" },
      }),
      getDatabase().metaInstagramAccount.findMany({
        where: { organizationId, accessStatus: "ACCESSIBLE" },
        orderBy: [{ username: "asc" }, { name: "asc" }],
      }),
      getDatabase().metaDataset.findMany({
        where: { organizationId, accessStatus: "ACCESSIBLE" },
        orderBy: { name: "asc" },
      }),
      getDatabase().organizationMetaSettings.findUnique({ where: { organizationId } }),
    ]);
  return { connections, businesses, adAccounts, pages, instagramAccounts, datasets, settings };
}

export async function getMetaCampaignWorkspace(
  organizationId: string,
  campaignId: string,
) {
  const [campaign, assets] = await Promise.all([
    getDatabase().campaign.findFirst({
      where: { id: campaignId, organizationId },
      include: {
        audience: true,
        budget: true,
        products: { include: { product: { select: { name: true } } }, orderBy: { position: "asc" } },
        creatives: {
          where: { uploadStatus: "READY" },
          include: {
            creative: { select: { title: true, status: true } },
            variant: { select: { content: true } },
            creativeAsset: { select: { status: true, checksumSha256: true, storageKey: true } },
            metaApprovals: {
              where: { supersededAt: null },
              orderBy: { approvedAt: "desc" },
              take: 1,
            },
          },
          orderBy: { position: "asc" },
        },
        metaConfiguration: {
          include: {
            audienceTargets: { orderBy: [{ type: "asc" }, { externalName: "asc" }] },
            ads: { orderBy: { position: "asc" } },
            validations: { orderBy: { createdAt: "desc" }, take: 1 },
            approvals: { where: { revokedAt: null }, orderBy: { approvedAt: "desc" }, take: 1 },
            jobs: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { steps: { orderBy: { createdAt: "asc" } } },
            },
            campaignMapping: {
              include: {
                adSets: {
                  include: { ads: { include: { creativeMapping: true } } },
                },
              },
            },
          },
        },
      },
    }),
    getMetaAssetOptions(organizationId),
  ]);
  return { campaign, assets };
}
