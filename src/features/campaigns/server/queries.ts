import "server-only";

import { ProductStatus } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";

export async function getCampaigns(organizationId: string) {
  const campaigns = await getDatabase().campaign.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { products: true, creatives: true } },
      budget: true,
    },
  });

  return campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    productCount: campaign._count.products,
    creativeCount: campaign._count.creatives,
    budgetType: campaign.budget?.type ?? null,
    budgetAmount:
      campaign.budget?.type === "DAILY"
        ? campaign.budget.dailyBudget?.toFixed(2) ?? null
        : campaign.budget?.lifetimeBudget?.toFixed(2) ?? null,
    currencyCode: campaign.budget?.currencyCode ?? null,
    startDate: campaign.budget?.startDate ?? null,
    endDate: campaign.budget?.endDate ?? null,
    updatedAt: campaign.updatedAt,
  }));
}

export async function getCampaignForBuilder(
  organizationId: string,
  campaignId: string,
) {
  return getDatabase().campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: {
      products: {
        orderBy: { position: "asc" },
        include: {
          product: {
            include: {
              media: {
                where: { uploadStatus: "READY" },
                orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                take: 1,
              },
            },
          },
        },
      },
      creatives: {
        where: { uploadStatus: "READY" },
        orderBy: { position: "asc" },
        include: {
          creative: { select: { id: true, title: true, type: true, status: true } },
          variant: { select: { id: true, name: true, content: true } },
          creativeAsset: { select: { id: true, altText: true } },
          metaApprovals: {
            where: { supersededAt: null },
            orderBy: { approvedAt: "desc" },
            take: 1,
            select: { assetChecksum: true, approvedAt: true },
          },
        },
      },
      audience: true,
      budget: true,
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

export async function getCampaignBuilderOptions(organizationId: string) {
  const [products, creatives] = await Promise.all([
    getDatabase().product.findMany({
      where: {
        organizationId,
        archivedAt: null,
        status: { not: ProductStatus.ARCHIVED },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        sku: true,
        status: true,
        price: true,
        media: {
          where: { uploadStatus: "READY" },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          take: 1,
          select: { id: true, altText: true },
        },
      },
    }),
    getDatabase().creative.findMany({
      where: {
        organizationId,
        status: "APPROVED",
        archivedAt: null,
        selectedVariantId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        product: { select: { name: true } },
        selectedVariant: {
          select: {
            id: true,
            name: true,
            assets: {
              where: { status: "READY", deletedAt: null },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { id: true, altText: true },
            },
          },
        },
      },
    }),
  ]);

  return {
    products: products.map((product) => ({
      ...product,
      price: product.price.toFixed(2),
    })),
    creatives,
  };
}
