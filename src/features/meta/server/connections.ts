import "server-only";

import { getDatabase } from "@/lib/db/database";
import { decryptMetaToken } from "@/lib/meta/token-cipher";
import { getMetaAdsGateway } from "@/lib/meta/meta-ads-gateway";

export async function getMetaConnectionWithToken(
  organizationId: string,
  connectionId?: string,
) {
  const connection = await getDatabase().metaConnection.findFirst({
    where: {
      organizationId,
      ...(connectionId ? { id: connectionId } : {}),
      status: { in: ["CONNECTED", "DEGRADED"] },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!connection) throw new Error("A healthy Meta connection is required.");

  return {
    connection,
    accessToken: decryptMetaToken(
      {
        ciphertext: connection.tokenCiphertext,
        iv: connection.tokenIv,
        authTag: connection.tokenAuthTag,
        keyVersion: connection.tokenKeyVersion,
      },
      organizationId,
      connection.id,
    ),
  };
}

export async function syncMetaAssets(organizationId: string, connectionId: string) {
  const { connection, accessToken } = await getMetaConnectionWithToken(
    organizationId,
    connectionId,
  );
  const gateway = getMetaAdsGateway();
  const [businesses, adAccounts, pages] = await Promise.all([
    gateway.listBusinesses(accessToken),
    gateway.listAdAccounts(accessToken),
    gateway.listPages(accessToken),
  ]);
  const datasets = await gateway.listDatasets(
    accessToken,
    adAccounts.map((account) => account.id),
  );
  const now = new Date();
  const database = getDatabase();

  await database.$transaction(async (transaction) => {
    await Promise.all([
      transaction.metaBusiness.updateMany({
        where: { organizationId, connectionId: connection.id },
        data: { accessStatus: "INACCESSIBLE" },
      }),
      transaction.metaAdAccount.updateMany({
        where: { organizationId, connectionId: connection.id },
        data: { accessStatus: "INACCESSIBLE" },
      }),
      transaction.metaPage.updateMany({
        where: { organizationId, connectionId: connection.id },
        data: { accessStatus: "INACCESSIBLE" },
      }),
      transaction.metaInstagramAccount.updateMany({
        where: { organizationId, connectionId: connection.id },
        data: { accessStatus: "INACCESSIBLE" },
      }),
      transaction.metaDataset.updateMany({
        where: { organizationId, connectionId: connection.id },
        data: { accessStatus: "INACCESSIBLE" },
      }),
    ]);

    for (const business of businesses) {
      await transaction.metaBusiness.upsert({
        where: {
          organizationId_connectionId_externalId: {
            organizationId,
            connectionId: connection.id,
            externalId: business.id,
          },
        },
        create: {
          organizationId,
          connectionId: connection.id,
          externalId: business.id,
          name: business.name,
          verificationStatus: business.verificationStatus,
          lastSeenAt: now,
          lastSyncedAt: now,
        },
        update: {
          name: business.name,
          verificationStatus: business.verificationStatus,
          accessStatus: "ACCESSIBLE",
          lastSeenAt: now,
          lastSyncedAt: now,
        },
      });
    }

    for (const account of adAccounts) {
      await transaction.metaAdAccount.upsert({
        where: {
          organizationId_connectionId_externalId: {
            organizationId,
            connectionId: connection.id,
            externalId: account.id,
          },
        },
        create: {
          organizationId,
          connectionId: connection.id,
          externalId: account.id,
          name: account.name,
          currencyCode: account.currency,
          timezoneName: account.timezoneName,
          timezoneOffsetMinutes: account.timezoneOffsetMinutes,
          accountStatus: account.accountStatus,
          disableReason: account.disableReason,
          lastSeenAt: now,
          lastSyncedAt: now,
        },
        update: {
          name: account.name,
          currencyCode: account.currency,
          timezoneName: account.timezoneName,
          timezoneOffsetMinutes: account.timezoneOffsetMinutes,
          accountStatus: account.accountStatus,
          disableReason: account.disableReason,
          accessStatus: "ACCESSIBLE",
          lastSeenAt: now,
          lastSyncedAt: now,
        },
      });
    }

    for (const page of pages) {
      const storedPage = await transaction.metaPage.upsert({
        where: {
          organizationId_connectionId_externalId: {
            organizationId,
            connectionId: connection.id,
            externalId: page.id,
          },
        },
        create: {
          organizationId,
          connectionId: connection.id,
          externalId: page.id,
          name: page.name,
          tasks: page.tasks,
          lastSeenAt: now,
          lastSyncedAt: now,
        },
        update: {
          name: page.name,
          tasks: page.tasks,
          accessStatus: "ACCESSIBLE",
          lastSeenAt: now,
          lastSyncedAt: now,
        },
      });
      if (page.instagramAccount) {
        await transaction.metaInstagramAccount.upsert({
          where: {
            organizationId_connectionId_externalId: {
              organizationId,
              connectionId: connection.id,
              externalId: page.instagramAccount.id,
            },
          },
          create: {
            organizationId,
            connectionId: connection.id,
            pageId: storedPage.id,
            externalId: page.instagramAccount.id,
            username: page.instagramAccount.username,
            name: page.instagramAccount.name,
            lastSeenAt: now,
            lastSyncedAt: now,
          },
          update: {
            pageId: storedPage.id,
            username: page.instagramAccount.username,
            name: page.instagramAccount.name,
            accessStatus: "ACCESSIBLE",
            lastSeenAt: now,
            lastSyncedAt: now,
          },
        });
      }
    }

    for (const dataset of datasets) {
      const adAccount = await transaction.metaAdAccount.findFirst({
        where: {
          organizationId,
          connectionId: connection.id,
          externalId: dataset.adAccountId,
        },
        select: { id: true },
      });
      await transaction.metaDataset.upsert({
        where: {
          organizationId_connectionId_externalId: {
            organizationId,
            connectionId: connection.id,
            externalId: dataset.id,
          },
        },
        create: {
          organizationId,
          connectionId: connection.id,
          adAccountId: adAccount?.id,
          externalId: dataset.id,
          name: dataset.name,
          lastSeenAt: now,
          lastSyncedAt: now,
        },
        update: {
          adAccountId: adAccount?.id,
          name: dataset.name,
          accessStatus: "ACCESSIBLE",
          lastSeenAt: now,
          lastSyncedAt: now,
        },
      });
    }

    await transaction.organizationMetaSettings.upsert({
      where: { organizationId },
      create: { organizationId, lastAssetSyncAt: now },
      update: { lastAssetSyncAt: now },
    });
    await transaction.metaConnection.updateMany({
      where: { id: connection.id, organizationId },
      data: { lastValidatedAt: now, status: "CONNECTED", lastErrorCode: null, lastErrorMessage: null },
    });
  });

  return {
    businesses: businesses.length,
    adAccounts: adAccounts.length,
    pages: pages.length,
    instagramAccounts: pages.filter((page) => page.instagramAccount).length,
    datasets: datasets.length,
  };
}
