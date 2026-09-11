"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { PlusIcon } from "@/components/ui/icons";
import { initialActionState } from "@/lib/forms/action-state";

import {
  createProductAction,
  updateProductAction,
} from "../server/actions";

type VariantValue = {
  id?: string;
  name: string;
  sku: string;
  size: string;
  color: string;
  price: string;
  stock: string;
};

type ProductValue = {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  sku: string;
  status: "DRAFT" | "ACTIVE";
  variants: VariantValue[];
};

type ProductFormProps = {
  organizationSlug: string;
  currencyCode: string;
  product?: ProductValue;
};

const inputClassName =
  "mt-2.5 w-full rounded-xl border border-border-strong bg-surface-raised px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-text-muted hover:border-primary/55 focus:border-primary focus:ring-4 focus:ring-primary/10";

const emptyVariant = (): VariantValue => ({
  name: "Default",
  sku: "",
  size: "",
  color: "",
  price: "",
  stock: "0",
});

export function ProductForm({
  organizationSlug,
  currencyCode,
  product,
}: ProductFormProps) {
  const productAction = product
    ? updateProductAction.bind(null, organizationSlug, product.id)
    : createProductAction.bind(null, organizationSlug);
  const [state, formAction, pending] = useActionState(
    productAction,
    initialActionState,
  );
  const [variants, setVariants] = useState<VariantValue[]>(
    product?.variants.length ? product.variants : [emptyVariant()],
  );

  function updateVariant(
    index: number,
    field: keyof Omit<VariantValue, "id">,
    value: string,
  ) {
    setVariants((current) =>
      current.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, [field]: value } : variant,
      ),
    );
  }

  function addVariant() {
    setVariants((current) => [
      ...current,
      { ...emptyVariant(), name: `Variant ${current.length + 1}` },
    ]);
  }

  function removeUnsavedVariant(index: number) {
    setVariants((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  const catalogueHref = `/dashboard/${organizationSlug}/catalogue`;

  return (
    <form action={formAction} className="mt-9 space-y-6">
      <input type="hidden" name="variants" value={JSON.stringify(variants)} />

      <section className="premium-panel rounded-3xl p-5 sm:p-8">
        <SectionHeading
          number="01"
          title="Product details"
          description="The core information your team will use across Avora."
        />

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <Field
            label="Name"
            name="name"
            defaultValue={product?.name}
            placeholder="Classic crew neck"
            error={state.fieldErrors?.name?.at(0)}
          />
          <Field
            label="Category"
            name="category"
            defaultValue={product?.category}
            placeholder="Apparel"
            required={false}
            error={state.fieldErrors?.category?.at(0)}
          />
          <Field
            label={`Base price (${currencyCode})`}
            name="price"
            defaultValue={product?.price}
            placeholder="2500.00"
            inputMode="decimal"
            error={state.fieldErrors?.price?.at(0)}
          />
          <Field
            label="Product SKU"
            name="sku"
            defaultValue={product?.sku}
            placeholder="CREW-001"
            required={false}
            error={state.fieldErrors?.sku?.at(0)}
          />
          <label className="block text-sm font-medium text-foreground">
            Status
            <select
              name="status"
              defaultValue={product?.status ?? "DRAFT"}
              className={inputClassName}
            >
              <option value="DRAFT" className="bg-surface-raised">
                Draft
              </option>
              <option value="ACTIVE" className="bg-surface-raised">
                Active
              </option>
            </select>
            <span className="mt-2 block text-xs leading-5 text-text-muted">
              Draft products remain visible only inside your workspace.
            </span>
          </label>
        </div>

        <label className="mt-6 block text-sm font-medium text-foreground">
          Description
          <textarea
            name="description"
            defaultValue={product?.description}
            placeholder="Describe the product for your team and future sales channels."
            rows={5}
            className={`${inputClassName} resize-y`}
          />
          {state.fieldErrors?.description?.at(0) ? (
            <span className="mt-2 block text-xs text-danger">
              {state.fieldErrors.description.at(0)}
            </span>
          ) : null}
        </label>
      </section>

      <section className="premium-panel rounded-3xl p-5 sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <SectionHeading
            number="02"
            title="Variants and inventory"
            description="Use one default variant for a simple product, or add size and color combinations."
          />
          <button
            type="button"
            onClick={addVariant}
            className="button-secondary shrink-0 gap-2"
          >
            <PlusIcon className="size-4" />
            Add variant
          </button>
        </div>

        <div className="mt-8 space-y-4">
          {variants.map((variant, index) => (
            <div
              key={variant.id ?? `new-${index}`}
              className="rounded-2xl border border-border bg-surface-muted/45 p-4 sm:p-5"
            >
              <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-lg bg-primary-muted text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {variant.name || `Variant ${index + 1}`}
                  </p>
                </div>
                {!variant.id && variants.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeUnsavedVariant(index)}
                    className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger-muted"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <VariantField
                  label="Variant name"
                  value={variant.name}
                  onChange={(value) => updateVariant(index, "name", value)}
                />
                <VariantField
                  label="Variant SKU"
                  value={variant.sku}
                  onChange={(value) => updateVariant(index, "sku", value)}
                  required={false}
                />
                <VariantField
                  label="Stock"
                  value={variant.stock}
                  onChange={(value) => updateVariant(index, "stock", value)}
                  inputMode="numeric"
                />
                <VariantField
                  label="Size"
                  value={variant.size}
                  onChange={(value) => updateVariant(index, "size", value)}
                  required={false}
                />
                <VariantField
                  label="Color"
                  value={variant.color}
                  onChange={(value) => updateVariant(index, "color", value)}
                  required={false}
                />
                <VariantField
                  label={`Price override (${currencyCode})`}
                  value={variant.price}
                  onChange={(value) => updateVariant(index, "price", value)}
                  inputMode="decimal"
                  required={false}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/20 bg-danger-muted px-4 py-3 text-sm text-danger"
        >
          {state.message}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 rounded-2xl border border-border bg-surface/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="hidden text-xs text-text-muted sm:block">
          Product data remains scoped to this organization.
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Link
            href={catalogueHref}
            className="button-secondary px-5 py-3 text-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="button-primary px-5 py-3"
          >
            {pending
              ? "Saving product..."
              : product
                ? "Save changes"
                : "Add product"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SectionHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border-strong bg-primary-muted text-xs font-semibold text-primary">
        {number}
      </span>
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.02em]">{title}</h2>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-text-secondary">
          {description}
        </p>
      </div>
    </div>
  );
}

type FieldProps = {
  label: string;
  name: string;
  placeholder: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
};

function Field({
  label,
  name,
  placeholder,
  defaultValue,
  error,
  required = true,
  inputMode = "text",
}: FieldProps) {
  return (
    <label className="block text-sm font-medium text-foreground">
      {label}
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
        className={inputClassName}
      />
      {error ? (
        <span id={`${name}-error`} className="mt-2 block text-xs text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}

type VariantFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
};

function VariantField({
  label,
  value,
  onChange,
  required = true,
  inputMode = "text",
}: VariantFieldProps) {
  return (
    <label className="block text-xs font-medium text-text-secondary">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        inputMode={inputMode}
        className={inputClassName}
      />
    </label>
  );
}
