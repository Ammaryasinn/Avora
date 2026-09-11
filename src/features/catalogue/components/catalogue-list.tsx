import Link from "next/link";

import {
  ArchiveIcon,
  BoxIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  RestoreIcon,
} from "@/components/ui/icons";
import { ProductStatus } from "@/generated/prisma/enums";

import {
  archiveProductAction,
  restoreProductAction,
} from "../server/actions";

type CatalogueProduct = {
  id: string;
  name: string;
  description: string | null;
  price: string;
  category: string | null;
  sku: string | null;
  status: ProductStatus;
  variantCount: number;
  mediaCount: number;
  media: { id: string; altText: string | null }[];
  stock: number;
};

type CatalogueListProps = {
  products: CatalogueProduct[];
  organizationSlug: string;
  currencyCode: string;
  canManage: boolean;
};

export function CatalogueList({
  products,
  organizationSlug,
  currencyCode,
  canManage,
}: CatalogueListProps) {
  if (products.length === 0) {
    return (
      <div className="premium-panel relative mt-10 overflow-hidden rounded-3xl px-6 py-16 text-center sm:py-20">
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-0 size-52 -translate-x-1/2 rounded-full bg-primary-muted/70 blur-3xl"
        />
        <div className="relative mx-auto grid size-14 place-items-center rounded-2xl border border-border-strong bg-primary-muted text-primary">
          <BoxIcon className="size-6" />
        </div>
        <h2 className="relative mt-6 text-xl font-semibold tracking-[-0.025em]">
          Your catalogue is ready for its first product
        </h2>
        <p className="relative mx-auto mt-3 max-w-md text-sm leading-6 text-text-secondary">
          Add a product with its pricing, variants, colors, and stock. This will
          become the source of truth for future Avora workflows.
        </p>
        {canManage ? (
          <Link
            href={`/dashboard/${organizationSlug}/catalogue/new`}
            className="button-primary relative mt-7 gap-2"
          >
            <PlusIcon className="size-4" />
            Add first product
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <section className="mt-10" aria-label="Product catalogue">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-text-secondary">
          {products.length} {products.length === 1 ? "product" : "products"}
        </p>
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span className="size-1.5 rounded-full bg-success" />
          Live catalogue data
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {products.map((product) => {
          const isArchived = product.status === ProductStatus.ARCHIVED;
          const archiveAction = archiveProductAction.bind(
            null,
            organizationSlug,
            product.id,
          );
          const restoreAction = restoreProductAction.bind(
            null,
            organizationSlug,
            product.id,
          );

          return (
            <article
              key={product.id}
              className={`group relative overflow-hidden rounded-2xl border p-4 transition sm:p-5 ${
                isArchived
                  ? "border-border bg-surface/55"
                  : "border-border bg-surface-raised hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-soft)]"
              }`}
            >
              <div className="flex gap-4 sm:gap-5">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-surface-muted text-text-muted sm:size-[4.5rem]">
                  {product.media[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/storage/product-media/${product.media[0].id}`}
                      alt={product.media[0].altText ?? product.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-6" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2
                          className={`truncate text-base font-semibold sm:text-lg ${isArchived ? "text-text-secondary" : "text-foreground"}`}
                        >
                          {product.name}
                        </h2>
                        <StatusBadge status={product.status} />
                      </div>
                      <p className="mt-1.5 truncate text-xs text-text-muted">
                        {product.category ?? "Uncategorized"}
                        {product.sku ? ` · ${product.sku}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-foreground">
                      {formatMoney(product.price, currencyCode)}
                    </p>
                  </div>

                  {product.description ? (
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-secondary">
                      {product.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <Metric label="Stock" value={String(product.stock)} />
                  <Metric
                    label="Variants"
                    value={String(product.variantCount)}
                  />
                  <Metric label="Media" value={String(product.mediaCount)} />
                </div>

                {canManage ? (
                  <div className="flex items-center gap-2">
                    {!isArchived ? (
                      <Link
                        href={`/dashboard/${organizationSlug}/catalogue/${product.id}/edit`}
                        className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary hover:bg-primary-muted"
                      >
                        <PencilIcon className="size-3.5" />
                        Edit
                      </Link>
                    ) : null}
                    <form action={isArchived ? restoreAction : archiveAction}>
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition hover:border-primary hover:bg-primary-muted hover:text-foreground"
                      >
                        {isArchived ? (
                          <RestoreIcon className="size-3.5" />
                        ) : (
                          <ArchiveIcon className="size-3.5" />
                        )}
                        {isArchived ? "Restore" : "Archive"}
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatMoney(value: string, currencyCode: string) {
  const [whole, fraction = "00"] = value.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${currencyCode} ${groupedWhole}.${fraction.padEnd(2, "0")}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ProductStatus }) {
  const styles = {
    ACTIVE: "border-success/20 bg-success-muted text-success",
    DRAFT: "border-warning/20 bg-warning-muted text-warning",
    ARCHIVED: "border-border bg-surface-muted text-text-secondary",
  }[status];

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${styles}`}
    >
      {status.toLowerCase()}
    </span>
  );
}
