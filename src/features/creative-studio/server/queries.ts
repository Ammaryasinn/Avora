import "server-only";

import { getDatabase } from "@/lib/db/database";
import { getAIConfiguration } from "@/lib/ai/config";

export async function getStudioOverview(organizationId: string) {
  const database = getDatabase();
  const [
    recentCreatives,
    jobs,
    creativeCount,
    approvedCount,
    runningJobCount,
    failedJobCount,
    settings,
    usage,
  ] = await Promise.all([
    database.creative.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        product: { select: { name: true } },
        _count: { select: { variants: true } },
      },
    }),
    database.aIJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        creativeId: true,
        capability: true,
        status: true,
        actualCost: true,
        createdAt: true,
        errorMessage: true,
      },
    }),
    database.creative.count({
      where: { organizationId, archivedAt: null },
    }),
    database.creative.count({ where: { organizationId, status: "APPROVED", archivedAt: null } }),
    database.aIJob.count({
      where: {
        organizationId,
        status: { in: ["PENDING", "QUEUED", "RUNNING", "RETRY_SCHEDULED"] },
      },
    }),
    database.aIJob.count({
      where: { organizationId, status: "FAILED" },
    }),
    database.organizationAISettings.findUnique({ where: { organizationId } }),
    database.aIUsagePeriod.findFirst({
      where: { organizationId, periodEnd: { gt: new Date() } },
      orderBy: { periodStart: "desc" },
    }),
  ]);

  return {
    recentCreatives,
    jobs,
    creativeCount,
    approvedCount,
    runningJobCount,
    failedJobCount,
    budget: {
      limit:
        (usage?.budget ?? settings?.monthlyBudget)?.toFixed(2) ??
        getAIConfiguration().defaults.monthlyBudgetUsd.toFixed(2),
      consumed: usage?.consumedCost.toFixed(2) ?? "0.00",
      reserved: usage?.reservedCost.toFixed(2) ?? "0.00",
    },
  };
}

export async function getCreativeProducts(organizationId: string) {
  return getDatabase().product.findMany({
    where: { organizationId, archivedAt: null, status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      sku: true,
      price: true,
      media: {
        where: { uploadStatus: "READY" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      },
    },
  });
}

export async function getCreativeForStudio(organizationId: string, creativeId: string) {
  return getDatabase().creative.findFirst({
    where: { id: creativeId, organizationId, archivedAt: null },
    include: {
      product: {
        include: {
          media: {
            where: { uploadStatus: "READY" },
            orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          },
        },
      },
      assets: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
      },
      variants: {
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        include: {
          assets: { where: { status: "READY", deletedAt: null } },
        },
      },
      jobs: {
        orderBy: { createdAt: "desc" },
        include: { attempts: { orderBy: { attemptNumber: "desc" } } },
      },
      approvals: { where: { supersededAt: null }, orderBy: { approvedAt: "desc" } },
    },
  });
}

export async function getCreativeLibrary(organizationId: string) {
  return getDatabase().creative.findMany({
    where: { organizationId, status: "APPROVED", archivedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      product: { select: { name: true } },
      selectedVariant: {
        include: { assets: { where: { status: "READY", deletedAt: null }, take: 1 } },
      },
      approvals: { where: { supersededAt: null }, orderBy: { approvedAt: "desc" }, take: 1 },
    },
  });
}
