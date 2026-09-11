import { ProductStatus } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";

export async function getDashboardProductSummary(organizationId: string) {
  const database = getDatabase();
  const [total, active, archived] = await Promise.all([
    database.product.count({ where: { organizationId } }),
    database.product.count({
      where: { organizationId, status: ProductStatus.ACTIVE },
    }),
    database.product.count({
      where: { organizationId, status: ProductStatus.ARCHIVED },
    }),
  ]);

  return { total, active, archived };
}

export async function getCatalogueProducts(organizationId: string) {
  const products = await getDatabase().product.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    include: {
      variants: {
        include: { inventory: true },
      },
      media: {
        where: { uploadStatus: "READY" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      _count: {
        select: { media: true },
      },
    },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price.toFixed(2),
    category: product.category,
    sku: product.sku,
    status: product.status,
    media: product.media.map((media) => ({
      id: media.id,
      altText: media.altText,
    })),
    variantCount: product.variants.length,
    mediaCount: product._count.media,
    stock: product.variants.reduce(
      (total, variant) => total + (variant.inventory?.quantityOnHand ?? 0),
      0,
    ),
  }));
}

export async function getProductForEdit(
  organizationId: string,
  productId: string,
) {
  const product = await getDatabase().product.findFirst({
    where: {
      id: productId,
      organizationId,
      status: { not: ProductStatus.ARCHIVED },
    },
    include: {
      variants: {
        orderBy: { position: "asc" },
        include: { inventory: true },
      },
      media: {
        where: { uploadStatus: "READY" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!product || product.status === ProductStatus.ARCHIVED) {
    return null;
  }

  return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    price: product.price.toFixed(2),
    category: product.category ?? "",
    sku: product.sku ?? "",
    status: product.status,
    media: product.media.map((media) => ({
      id: media.id,
      altText: media.altText,
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku ?? "",
      size: variant.size ?? "",
      color: variant.color ?? "",
      price: variant.price?.toFixed(2) ?? "",
      stock: String(variant.inventory?.quantityOnHand ?? 0),
    })),
  };
}
