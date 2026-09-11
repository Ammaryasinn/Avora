import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

import {
  ArrowRightIcon,
  BoxIcon,
  ChartIcon,
  ImageIcon,
  MegaphoneIcon,
  MessageIcon,
  PlusIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/ui/icons";
import {
  getCatalogueProducts,
  getDashboardProductSummary,
} from "@/features/catalogue/server/queries";
import { getStudioOverview } from "@/features/creative-studio/server/queries";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type DashboardPageProps = {
  params: Promise<{ organizationSlug: string }>;
};

const futureModules = [
  {
    name: "Meta publishing",
    description: "Publishing and campaign operations",
    icon: MegaphoneIcon,
  },
  {
    name: "WhatsApp sales",
    description: "Conversation-led sales workflows",
    icon: MessageIcon,
  },
  {
    name: "CRM workspace",
    description: "Customer and lead management",
    icon: UsersIcon,
  },
  {
    name: "Revenue analytics",
    description: "Verified performance reporting",
    icon: ChartIcon,
  },
] as const;

export default async function OrganizationDashboardPage({
  params,
}: DashboardPageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const [identity, summary, products, studio] = await Promise.all([
    currentUser(),
    getDashboardProductSummary(tenant.organizationId),
    getCatalogueProducts(tenant.organizationId),
    getStudioOverview(tenant.organizationId),
  ]);
  const businessName =
    tenant.organization.businessProfile?.displayName ??
    tenant.organization.name;
  const currencyCode =
    tenant.organization.businessProfile?.currencyCode ?? "USD";
  const userName = identity?.firstName ?? identity?.username;
  const activeShare = summary.total
    ? Math.round((summary.active / summary.total) * 100)
    : 0;

  return (
    <div>
      <header className="flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
        <div>
          <p className="eyebrow">Workspace overview</p>
          <h1 className="page-title">
            Welcome back{userName ? `, ${userName}` : ""}
          </h1>
          <p className="page-description">
            Here is what is happening across {businessName}, based only on your
            live catalogue and Creative Studio activity.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/dashboard/${organizationSlug}/creative-studio/new`}
            className="button-secondary gap-2"
          >
            <SparklesIcon className="size-4 text-ai" />
            Create creative
          </Link>
          <Link
            href={`/dashboard/${organizationSlug}/catalogue/new`}
            className="button-primary gap-2"
          >
            <PlusIcon className="size-4" />
            Add product
          </Link>
        </div>
      </header>

      <section
        className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Workspace metrics"
      >
        <MetricCard label="Products" value={summary.total} detail="All catalogue records" />
        <MetricCard label="Active products" value={summary.active} detail="Available for workflows" tone="success" />
        <MetricCard label="Archived" value={summary.archived} detail="Retained safely" />
        <MetricCard label="Creatives" value={studio.creativeCount} detail="Current Studio projects" tone="ai" />
        <MetricCard label="Approved" value={studio.approvedCount} detail="In the Creative Library" tone="success" />
        <MetricCard label="Running jobs" value={studio.runningJobCount} detail="Queued or processing" tone="ai" />
        <MetricCard label="Failed jobs" value={studio.failedJobCount} detail="Available for review" tone={studio.failedJobCount ? "danger" : "neutral"} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="premium-panel rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Catalogue pulse</p>
              <h2 className="section-heading mt-3 text-2xl">Products at a glance</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Real product records currently available to your workspace.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface-muted/70 px-4 py-3 text-right">
              <p className="text-2xl font-semibold tracking-tight">{activeShare}%</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                Active share
              </p>
            </div>
          </div>

          <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-success transition-[width]"
              style={{ width: `${activeShare}%` }}
            />
          </div>

          {products.length ? (
            <div className="mt-7 divide-y divide-border border-y border-border">
              {products.slice(0, 4).map((product) => (
                <Link
                  key={product.id}
                  href={
                    product.status === "ARCHIVED"
                      ? `/dashboard/${organizationSlug}/catalogue`
                      : `/dashboard/${organizationSlug}/catalogue/${product.id}/edit`
                  }
                  className="group flex items-center gap-4 py-4"
                >
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-muted text-text-muted">
                    {product.media[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/storage/product-media/${product.media[0].id}`}
                        alt={product.media[0].altText ?? product.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary-hover">
                      {product.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {product.category ?? "Uncategorized"} · {product.variantCount} {product.variantCount === 1 ? "variant" : "variants"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold">{formatMoney(product.price, currencyCode)}</p>
                    <span className={`status-pill mt-1.5 ${product.status === "ACTIVE" ? "status-success" : product.status === "DRAFT" ? "status-warning" : "status-neutral"}`}>
                      {product.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state mt-7 px-6 py-10 text-center">
              <BoxIcon className="mx-auto size-6 text-primary" />
              <p className="mt-4 font-semibold text-foreground">Start your product catalogue</p>
              <p className="mt-2 text-sm">Add a real product to unlock Creative Studio workflows.</p>
            </div>
          )}

          <Link
            href={`/dashboard/${organizationSlug}/catalogue`}
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary-hover"
          >
            View full catalogue
            <ArrowRightIcon className="size-4" />
          </Link>
        </section>

        <section className="ai-panel rounded-3xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow eyebrow-ai">Creative Studio</p>
              <h2 className="section-heading mt-3 text-2xl">Recent AI activity</h2>
            </div>
            <span className="grid size-10 place-items-center rounded-xl bg-surface-raised text-ai shadow-sm">
              <SparklesIcon className="size-5" />
            </span>
          </div>

          <div className="mt-7 space-y-3">
            {studio.recentCreatives.slice(0, 3).map((creative) => (
              <Link
                key={creative.id}
                href={`/dashboard/${organizationSlug}/creative-studio/${creative.id}`}
                className="block rounded-2xl border border-border bg-surface-raised/80 p-4 transition hover:border-ai/35 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{creative.title}</p>
                    <p className="mt-1 truncate text-xs text-text-muted">
                      {creative.product?.name ?? "Catalogue creative"} · {creative._count.variants} variants
                    </p>
                  </div>
                  <StudioStatus status={creative.status} />
                </div>
              </Link>
            ))}
            {studio.recentCreatives.length === 0 ? (
              <div className="empty-state px-5 py-8 text-center text-sm">
                No creatives yet. Start from a catalogue product when you are ready.
              </div>
            ) : null}
          </div>

          {studio.jobs.length ? (
            <p className="mt-5 text-xs text-text-muted">
              Latest job: {studio.jobs[0].capability.replaceAll("_", " ").toLowerCase()} · {studio.jobs[0].status.replaceAll("_", " ").toLowerCase()}
            </p>
          ) : null}

          <Link
            href={`/dashboard/${organizationSlug}/creative-studio`}
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-ai transition hover:text-[#5f507f]"
          >
            Open Creative Studio
            <ArrowRightIcon className="size-4" />
          </Link>
        </section>
      </div>

      <section className="mt-6 rounded-3xl border border-border bg-surface/60 p-6 sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">Coming next</p>
            <h2 className="section-heading mt-3 text-2xl">The wider revenue workspace</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-text-secondary">
            These modules are visible for orientation only and are not yet available.
          </p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {futureModules.map(({ name, description, icon: Icon }) => (
            <div key={name} className="rounded-2xl border border-border bg-surface-raised/65 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-surface-muted text-text-secondary">
                  <Icon className="size-4" />
                </span>
                <span className="status-pill border-border bg-surface-muted text-text-muted">Soon</span>
              </div>
              <p className="mt-4 text-sm font-semibold">{name}</p>
              <p className="mt-1.5 text-xs leading-5 text-text-muted">{description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "success" | "ai" | "danger";
}) {
  const tones = {
    neutral: "bg-surface-raised",
    success: "bg-success-muted/70",
    ai: "bg-ai-muted/80",
    danger: "bg-danger-muted/70",
  };

  return (
    <div className={`rounded-2xl border border-border p-5 shadow-[0_10px_30px_rgba(64,48,32,0.04)] ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.045em]">{value}</p>
      <p className="mt-2 text-xs text-text-secondary">{detail}</p>
    </div>
  );
}

function StudioStatus({ status }: { status: string }) {
  const positive = status === "APPROVED" || status === "SUCCEEDED";
  const failed = status === "FAILED" || status === "BLOCKED";

  return (
    <span className={`status-pill ${positive ? "status-success" : failed ? "status-error" : "status-neutral"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function formatMoney(value: string, currencyCode: string) {
  const [whole, fraction = "00"] = value.split(".");
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${currencyCode} ${groupedWhole}.${fraction.padEnd(2, "0")}`;
}
