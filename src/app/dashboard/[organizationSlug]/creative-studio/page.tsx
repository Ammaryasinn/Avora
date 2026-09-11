import Link from "next/link";

import { SparklesIcon } from "@/components/ui/icons";
import { getStudioOverview } from "@/features/creative-studio/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string }> };

const activeJobStatuses = new Set([
  "PENDING",
  "QUEUED",
  "RUNNING",
  "RETRY_SCHEDULED",
]);

export default async function CreativeStudioPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const overview = await getStudioOverview(tenant.organizationId);
  const canManage =
    tenant.role === OrganizationRole.OWNER ||
    tenant.role === OrganizationRole.ADMIN;

  return (
    <div>
      <header className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
        <div>
          <p className="eyebrow eyebrow-ai">AI Creative Studio</p>
          <h1 className="page-title">Create with your catalogue</h1>
          <p className="page-description">
            Generate, refine, and approve brand assets grounded in real product
            data. Failed generations never appear as fabricated output.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/dashboard/${organizationSlug}/creative-studio/library`} className="button-secondary">
            Creative Library
          </Link>
          {canManage ? (
            <Link href={`/dashboard/${organizationSlug}/creative-studio/new`} className="button-primary gap-2">
              <SparklesIcon className="size-4" />
              Create creative
            </Link>
          ) : null}
        </div>
      </header>

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        <Metric label="Approved creatives" value={String(overview.approvedCount)} detail="Stored in your library" />
        <Metric label="AI budget used" value={`$${overview.budget.consumed}`} detail={`$${overview.budget.limit} monthly limit`} />
        <Metric label="Budget reserved" value={`$${overview.budget.reserved}`} detail="Active generation jobs" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="premium-panel rounded-3xl p-6 sm:p-8">
          <p className="eyebrow eyebrow-ai">Recent work</p>
          <h2 className="section-heading mt-3 text-2xl">Creatives</h2>
          <div className="mt-6 space-y-3">
            {overview.recentCreatives.map((creative) => (
              <Link
                key={creative.id}
                href={`/dashboard/${organizationSlug}/creative-studio/${creative.id}`}
                className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-raised p-4 transition hover:border-ai/35 hover:bg-ai-muted/45 hover:shadow-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{creative.title}</p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {creative.product?.name ?? "No product"} · {creative.type.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Status status={creative.status} />
                  <p className="mt-2 text-xs text-text-muted">{creative._count.variants} variants</p>
                </div>
              </Link>
            ))}
            {overview.recentCreatives.length === 0 ? (
              <Empty text={canManage ? "Create your first product-grounded creative." : "No creatives have been created yet."} />
            ) : null}
          </div>
        </section>

        <section className="ai-panel rounded-3xl p-6 sm:p-8">
          <p className="eyebrow eyebrow-ai">Generation activity</p>
          <h2 className="section-heading mt-3 text-2xl">AI jobs</h2>
          <div className="mt-6 space-y-4">
            {overview.jobs.map((job) => (
              <div key={job.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{job.capability.replaceAll("_", " ").toLowerCase()}</p>
                  <Status status={job.status} />
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {activeJobStatuses.has(job.status) ? "Budget reserved" : `Cost $${job.actualCost.toFixed(2)}`}
                </p>
              </div>
            ))}
            {overview.jobs.length === 0 ? <Empty text="No generation jobs yet." /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="ai-panel rounded-2xl p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ai">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 text-xs text-text-secondary">{detail}</p>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const positive = status === "APPROVED" || status === "SUCCEEDED";
  const failed = status === "FAILED";
  return (
    <span className={`status-pill ${positive ? "status-success" : failed ? "status-error" : "status-neutral"}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state p-8 text-center text-sm">{text}</div>;
}
