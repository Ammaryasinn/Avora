import { z } from "zod";

import { ProductStatus } from "@/generated/prisma/enums";

const requiredMoney = z
  .string()
  .trim()
  .regex(
    /^\d{1,10}(\.\d{1,2})?$/,
    "Use a non-negative amount with no more than two decimal places.",
  );

const optionalMoney = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{1,10}(\.\d{1,2})?$/.test(value),
    "Use an amount with no more than two decimal places.",
  )
  .transform((value) => value || undefined);

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum, `Must be ${maximum} characters or fewer.`)
    .transform((value) => value || undefined);

const productVariantSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z
    .string()
    .trim()
    .min(1, "Each variant needs a name.")
    .max(100, "Variant names must be 100 characters or fewer."),
  sku: optionalText(100),
  size: optionalText(60),
  color: optionalText(60),
  price: optionalMoney,
  stock: z.coerce
    .number()
    .int("Stock must be a whole number.")
    .min(0, "Stock cannot be negative.")
    .max(2_147_483_647, "Stock is too large."),
});

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Product name must be at least 2 characters.")
    .max(160, "Product name must be 160 characters or fewer."),
  description: optionalText(5_000),
  price: requiredMoney,
  category: optionalText(120),
  sku: optionalText(100),
  status: z.enum([ProductStatus.DRAFT, ProductStatus.ACTIVE]),
  variants: z
    .array(productVariantSchema)
    .min(1, "Add at least one inventory variant.")
    .max(50, "A product can have at most 50 variants in this milestone."),
});

export type ProductInput = z.infer<typeof productSchema>;

export function parseProductFormData(formData: FormData) {
  let variants: unknown = [];

  try {
    variants = JSON.parse(String(formData.get("variants") ?? "[]"));
  } catch {
    variants = [];
  }

  return productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    price: formData.get("price"),
    category: formData.get("category"),
    sku: formData.get("sku"),
    status: formData.get("status"),
    variants,
  });
}
