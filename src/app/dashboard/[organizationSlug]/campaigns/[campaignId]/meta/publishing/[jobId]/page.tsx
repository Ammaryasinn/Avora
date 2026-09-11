import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/features/creative-studio/components/auto-refresh";
import {
  reconcileMetaPublishJobAction,
  synchronizeMetaPublicationStatusAction,
} from "@/features/meta/server/actions";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

export default async function MetaPublishingPage({ params }: { params: Promise<{ organizationSlug: string; campaignId: string; jobId: string }> }) {
  const { organizationSlug, campaignId, jobId } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const job = await getDatabase().metaPublishJob.findFirst({
    where: { id: jobId, campaignId, organizationId: tenant.organizationId },
    include: { steps: { orderBy: { createdAt: "asc" } }, campaignMappings: { include: { adSets: { include: { ads: true } } } } },
  });
  if (!job) notFound();
  const active = ["PENDING", "QUEUED", "RUNNING", "RETRY_SCHEDULED"].includes(job.status);
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  return (
    <div>
      <AutoRefresh active={active} />
      <Link href={`/dashboard/${organizationSlug}/campaigns/${campaignId}/meta/review`} className="back-link">← Meta review</Link>
      <header className="mt-7"><p className="eyebrow">Publishing progress</p><h1 className="page-title">Meta publication</h1><p className="page-description">Durable steps persist each successful external identifier immediately. No automatic deletion occurs after partial publication.</p></header>
      <section className="premium-panel mt-8 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-wrap justify-between gap-4"><div><p className="text-sm text-text-muted">Job status</p><p className="mt-2 text-xl font-semibold">{formatEnum(job.status)}</p></div><span className={`status-pill ${job.status === "SUCCEEDED" ? "status-success" : job.status === "FAILED" || job.status === "RECONCILIATION_REQUIRED" ? "status-error" : "status-warning"}`}>{job.status}</span></div>
        {job.errorMessage ? <p className="mt-5 rounded-xl border border-danger/20 bg-danger-muted p-4 text-sm text-danger">{job.errorMessage}</p> : null}
        <div className="mt-6 space-y-3">{job.steps.map((step) => <div key={step.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface-muted/35 p-4"><div><p className="text-sm font-semibold">{formatEnum(step.type)}</p><p className="mt-1 text-xs text-text-muted">{step.externalId ? "External mapping stored" : "Awaiting completion"}</p></div><span className={`status-pill ${step.status === "SUCCEEDED" ? "status-success" : step.status === "PENDING" || step.status === "RUNNING" ? "status-warning" : "status-error"}`}>{step.status}</span></div>)}</div>
        {canManage ? <div className="mt-6 flex flex-wrap gap-3">{job.status === "RECONCILIATION_REQUIRED" ? <form action={reconcileMetaPublishJobAction.bind(null, organizationSlug, campaignId, job.id)}><button className="button-primary">Reconcile with Meta</button></form> : null}{job.status === "SUCCEEDED" ? <form action={synchronizeMetaPublicationStatusAction.bind(null, organizationSlug, campaignId)}><button className="button-secondary">Refresh remote status</button></form> : null}</div> : null}
      </section>
      {job.status === "SUCCEEDED" ? <section className="mt-6 rounded-3xl border border-success/20 bg-success-muted p-6"><p className="font-semibold text-success">Created on Meta as paused</p><p className="mt-2 text-sm leading-6 text-text-secondary">Remote identifiers are stored for reconciliation. Avora has not activated delivery and cannot execute spend.</p></section> : null}
    </div>
  );
}

function formatEnum(value: string) { return value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase()); }
