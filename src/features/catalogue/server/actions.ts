"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import {
  OrganizationRole,
  ProductStatus,
} from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";
import type { ActionState } from "@/lib/forms/action-state";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

import { parseProductFormData, type ProductInput } from "./schema";

const catalogueManagers = [
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
] as const;

function productData(input: ProductInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    price: new Prisma.Decimal(input.price),
    category: input.category ?? null,
    sku: input.sku ?? null,
    status: input.status,
  };
}

function databaseErrorState(error: unknown): ActionState {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return {
      status: "error",
      message: "A product or variant with that SKU already exists.",
    };
  }

  return {
    status: "error",
    message: "The product could not be saved. Please try again.",
  };
}

export async function createProductAction(
  organizationSlug: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, catalogueManagers);
  const parsed = parseProductFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the product details and variants.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await getDatabase().product.create({
      data: {
        organizationId: tenant.organizationId,
        ...productData(parsed.data),
        variants: {
          create: parsed.data.variants.map((variant, position) => ({
            organizationId: tenant.organizationId,
            name: variant.name,
            sku: variant.sku,
            size: variant.size,
            color: variant.color,
            price: variant.price
              ? new Prisma.Decimal(variant.price)
              : undefined,
            position,
            inventory: {
              create: {
                organizationId: tenant.organizationId,
                quantityOnHand: variant.stock,
              },
            },
          })),
        },
      },
    });
  } catch (error) {
    return databaseErrorState(error);
  }

  revalidatePath(`/dashboard/${organizationSlug}`);
  revalidatePath(`/dashboard/${organizationSlug}/catalogue`);
  redirect(`/dashboard/${organizationSlug}/catalogue`);
}

export async function updateProductAction(
  organizationSlug: string,
  productId: string,
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = await requireTenantContext(organizationSlug, catalogueManagers);
  const parsed = parseProductFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Review the product details and variants.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await getDatabase().$transaction(async (transaction) => {
      const product = await transaction.product.findFirst({
        where: {
          id: productId,
          organizationId: tenant.organizationId,
          status: { not: ProductStatus.ARCHIVED },
        },
        select: { id: true },
      });

      if (!product) {
        throw new Error("Product not found.");
      }

      await transaction.product.update({
        where: { id: product.id },
        data: productData(parsed.data),
      });

      for (const [position, variant] of parsed.data.variants.entries()) {
        if (variant.id) {
          const updated = await transaction.productVariant.updateMany({
            where: {
              id: variant.id,
              productId: product.id,
              organizationId: tenant.organizationId,
            },
            data: {
              name: variant.name,
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
              price: variant.price
                ? new Prisma.Decimal(variant.price)
                : null,
              position,
            },
          });

          if (updated.count !== 1) {
            throw new Error("Variant not found.");
          }

          await transaction.inventoryRecord.upsert({
            where: { variantId: variant.id },
            create: {
              organizationId: tenant.organizationId,
              variantId: variant.id,
              quantityOnHand: variant.stock,
            },
            update: {
              quantityOnHand: variant.stock,
            },
          });
        } else {
          await transaction.productVariant.create({
            data: {
              organizationId: tenant.organizationId,
              productId: product.id,
              name: variant.name,
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
              price: variant.price
                ? new Prisma.Decimal(variant.price)
                : undefined,
              position,
              inventory: {
                create: {
                  organizationId: tenant.organizationId,
                  quantityOnHand: variant.stock,
                },
              },
            },
          });
        }
      }
    });
  } catch (error) {
    return databaseErrorState(error);
  }

  revalidatePath(`/dashboard/${organizationSlug}`);
  revalidatePath(`/dashboard/${organizationSlug}/catalogue`);
  redirect(`/dashboard/${organizationSlug}/catalogue`);
}

export async function archiveProductAction(
  organizationSlug: string,
  productId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, catalogueManagers);
  const database = getDatabase();
  const product = await database.product.findFirst({
    where: {
      id: productId,
      organizationId: tenant.organizationId,
      status: { not: ProductStatus.ARCHIVED },
    },
    select: { status: true },
  });

  if (!product) {
    return;
  }

  await database.product.updateMany({
    where: {
      id: productId,
      organizationId: tenant.organizationId,
      status: product.status,
    },
    data: {
      statusBeforeArchive: product.status,
      status: ProductStatus.ARCHIVED,
      archivedAt: new Date(),
    },
  });

  revalidatePath(`/dashboard/${organizationSlug}`);
  revalidatePath(`/dashboard/${organizationSlug}/catalogue`);
}

export async function restoreProductAction(
  organizationSlug: string,
  productId: string,
) {
  const tenant = await requireTenantContext(organizationSlug, catalogueManagers);
  const database = getDatabase();
  const product = await database.product.findFirst({
    where: {
      id: productId,
      organizationId: tenant.organizationId,
      status: ProductStatus.ARCHIVED,
    },
    select: { statusBeforeArchive: true },
  });

  if (!product) {
    return;
  }

  const restoredStatus =
    product.statusBeforeArchive === ProductStatus.ACTIVE
      ? ProductStatus.ACTIVE
      : ProductStatus.DRAFT;

  await database.product.updateMany({
    where: {
      id: productId,
      organizationId: tenant.organizationId,
      status: ProductStatus.ARCHIVED,
    },
    data: {
      status: restoredStatus,
      statusBeforeArchive: null,
      archivedAt: null,
    },
  });

  revalidatePath(`/dashboard/${organizationSlug}`);
  revalidatePath(`/dashboard/${organizationSlug}/catalogue`);
}
