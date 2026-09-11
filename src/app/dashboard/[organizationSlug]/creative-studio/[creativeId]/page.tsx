/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/features/creative-studio/components/auto-refresh";
import { approveCreativeVariantAction, retryAIJobAction, selectCreativeVariantAction } from "@/features/creative-studio/server/actions";
import { getCreativeForStudio } from "@/features/creative-studio/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string; creativeId: string }> };
const activeStatuses = new Set(["PENDING", "QUEUED", "RUNNING", "RETRY_SCHEDULED"]);

export default async function CreativeResultsPage({ params }: PageProps) {
  const { organizationSlug, creativeId } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const creative = await getCreativeForStudio(tenant.organizationId, creativeId);
  if (!creative) notFound();
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const active = creative.jobs.some((job) => activeStatuses.has(job.status));

  return <div>
    <AutoRefresh active={active} />
    <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
      <div><Link href={`/dashboard/${organizationSlug}/creative-studio`} className="back-link">← Creative Studio</Link><p className="eyebrow eyebrow-ai mt-8">Generation results</p><h1 className="page-title">{creative.title}</h1><p className="page-description">{creative.product?.name ?? "Catalogue creative"} · {creative.type.replaceAll("_", " ").toLowerCase()}</p></div>
      {canManage ? <Link href={`/dashboard/${organizationSlug}/creative-studio/${creative.id}/configure`} className="button-secondary">Generate again</Link> : null}
    </div>

    {active ? <div className="generation-panel ai-panel mt-8 overflow-hidden rounded-3xl p-6"><div className="generation-scan" /><p className="font-semibold text-ai">Generation in progress</p><p className="mt-2 text-sm text-text-secondary">The durable worker is processing this request. You can leave this page safely.</p></div> : null}

    <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <section>
        <div className="flex items-center justify-between"><div><p className="eyebrow eyebrow-ai">Variants</p><h2 className="section-heading mt-3 text-2xl">Review real outputs</h2></div><span className="status-pill status-neutral">{creative.status.replaceAll("_", " ")}</span></div>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {creative.variants.map((variant) => {
            const content = variant.content && typeof variant.content === "object" && !Array.isArray(variant.content) ? variant.content as Record<string, unknown> : {};
            const asset = variant.assets[0];
            const selected = creative.selectedVariantId === variant.id;
            return <article key={variant.id} className={`premium-panel overflow-hidden rounded-3xl ${selected ? "ring-2 ring-ai/40" : ""}`}>
              {asset ? <img src={`/api/storage/creative-assets/${asset.id}`} alt={asset.altText ?? variant.name} className="aspect-square w-full object-cover" /> : null}
              <div className="p-5"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{variant.name}</h3><span className="status-pill status-neutral">{variant.origin.replaceAll("_", " ")}</span></div>
                {typeof content.headline === "string" ? <><p className="mt-5 text-lg font-semibold text-foreground">{content.headline}</p><p className="mt-3 text-sm leading-6 text-text-secondary">{String(content.primaryText ?? "")}</p><p className="mt-3 text-xs font-semibold uppercase tracking-wider text-ai">{String(content.callToAction ?? "")}</p></> : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  {canManage ? <><form action={selectCreativeVariantAction.bind(null, organizationSlug, creative.id, variant.id)}><button className="button-secondary text-xs" disabled={selected}>{selected ? "Selected" : "Select"}</button></form><Link className="button-secondary text-xs" href={`/dashboard/${organizationSlug}/creative-studio/${creative.id}/edit/${variant.id}`}>Edit</Link><form action={approveCreativeVariantAction.bind(null, organizationSlug, creative.id, variant.id)}><button className="button-primary text-xs">Approve</button></form></> : null}
                </div>
              </div>
            </article>;
          })}
          {creative.variants.length === 0 && !active ? <div className="empty-state p-10 text-center text-sm md:col-span-2">No generated variants are available. Review the job status and retry if needed.</div> : null}
        </div>
      </section>

      <aside className="ai-panel h-fit rounded-3xl p-6"><p className="eyebrow eyebrow-ai">Jobs & attempts</p><div className="mt-5 space-y-5">
        {creative.jobs.map((job) => <div key={job.id} className="border-b border-border pb-5 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{job.capability.replaceAll("_", " ")}</p><span className={`status-pill ${job.status === "FAILED" ? "status-error" : job.status === "SUCCEEDED" ? "status-success" : "status-neutral"}`}>{job.status.replaceAll("_", " ")}</span></div><p className="mt-2 text-xs text-text-secondary">{job.attemptCount} / {job.maxAttempts} attempts · ${job.actualCost.toFixed(2)} used</p>{job.errorMessage ? <p className="mt-2 text-xs leading-5 text-danger">{job.errorMessage}</p> : null}{canManage && job.status === "FAILED" ? <form className="mt-3" action={retryAIJobAction.bind(null, organizationSlug, job.id)}><button className="button-secondary text-xs">Retry safely</button></form> : null}</div>)}
      </div></aside>
    </div>
  </div>;
}
