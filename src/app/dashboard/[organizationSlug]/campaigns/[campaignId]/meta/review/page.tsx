import Link from "next/link";
import { notFound } from "next/navigation";

import { MetaValidationAction } from "@/features/meta/components/meta-forms";
import { publishMetaCampaignAsPausedAction } from "@/features/meta/server/actions";
import { buildMetaPublishSnapshot } from "@/features/meta/server/publishing-snapshot";
import { getMetaCampaignWorkspace } from "@/features/meta/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getMetaAvailability } from "@/lib/meta/config";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type Issue = { code?: string; message?: string };

export default async function MetaReviewPage({ params, searchParams }: { params: Promise<{ organizationSlug: string; campaignId: string }>; searchParams: Promise<{ publish?: string }> }) {
  const { organizationSlug, campaignId } = await params;
  const query = await searchParams;
  const tenant = await requireTenantContext(organizationSlug);
  const workspace = await getMetaCampaignWorkspace(tenant.organizationId, campaignId);
  if (!workspace.campaign) notFound();
  if (!workspace.campaign.metaConfiguration) return <Missing organizationSlug={organizationSlug} campaignId={campaignId} />;
  const built = await buildMetaPublishSnapshot(tenant.organizationId, campaignId);
  const latest = workspace.campaign.metaConfiguration.validations[0];
  const hashMatches = latest?.snapshotHash === built.hash;
  const validationCurrent = latest?.status === "PASSED" && latest.expiresAt > new Date() && hashMatches;
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const availability = getMetaAvailability();
  const publishEnabled = availability.publishingEnabled && Boolean(workspace.assets.settings?.publishingEnabled);
  const errors = Array.isArray(latest?.errors) ? latest.errors as Issue[] : [];
  const warnings = Array.isArray(latest?.warnings) ? latest.warnings as Issue[] : [];

  return (
    <div>
      <Link href={`/dashboard/${organizationSlug}/campaigns/${campaignId}/meta`} className="back-link">← Meta configuration</Link>
      <header className="mt-7"><p className="eyebrow">Final review</p><h1 className="page-title">Publish safely to Meta</h1><p className="page-description">Review the exact immutable configuration. Any campaign or Meta change invalidates this approval.</p></header>
      {query.publish ? <p className="mt-6 rounded-2xl border border-warning/20 bg-warning-muted p-4 text-sm text-warning">Publishing was not queued because the safety configuration or validation changed.</p> : null}
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="premium-panel rounded-3xl p-6 sm:p-8">
          <p className="eyebrow">Immutable snapshot</p>
          <h2 className="section-heading mt-3 text-2xl">{built.snapshot.campaign.name}</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Summary label="Objective" value={built.snapshot.campaign.objective ?? "Not set"} />
            <Summary label="Optimization" value={built.snapshot.configuration.optimizationGoal ?? "Not set"} />
            <Summary label="Ad account" value={`${built.snapshot.adAccount.name} · ${built.snapshot.adAccount.currencyCode}`} />
            <Summary label="Identity" value={built.snapshot.instagramAccount?.username ? `@${built.snapshot.instagramAccount.username}` : built.snapshot.page.name} />
            <Summary label="Audience" value={built.snapshot.targets.map((item) => item.externalName).join(", ") || "Not resolved"} />
            <Summary label="Ads" value={`${built.snapshot.ads.length} paused ad${built.snapshot.ads.length === 1 ? "" : "s"}`} />
            <Summary label="Budget" value={formatBudget(built.snapshot.campaign.budget)} />
            <Summary label="Schedule" value={`${formatDate(built.snapshot.campaign.budget?.startDate)} → ${formatDate(built.snapshot.campaign.budget?.endDate)}`} />
          </div>
          <p className="mt-6 break-all rounded-xl bg-surface-muted p-3 font-mono text-[10px] text-text-muted">Snapshot {built.hash}</p>
        </section>
        <aside className="space-y-6">
          <section className="premium-panel rounded-3xl p-6">
            <p className="eyebrow">Validation</p><h2 className="section-heading mt-3 text-xl">{validationCurrent ? "Ready for approval" : "Validation required"}</h2>
            {!hashMatches && latest ? <p className="mt-3 text-sm text-warning">Configuration changed after the last validation.</p> : null}
            <IssueList title="Blocking issues" issues={errors} tone="danger" />
            <IssueList title="Warnings" issues={warnings} tone="warning" />
            {canManage ? <div className="mt-5"><MetaValidationAction organizationSlug={organizationSlug} campaignId={campaignId} /></div> : null}
          </section>
          <section className="rounded-3xl border border-primary/25 bg-primary-muted/55 p-6">
            <p className="eyebrow">Explicit approval</p><h2 className="section-heading mt-3 text-xl">No spend can start</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">This may create real Meta objects. Campaigns, ad sets, and ads are created PAUSED. Activation remains unavailable.</p>
            {!publishEnabled ? <p className="mt-4 text-sm text-warning">Publishing is disabled by a server or organization kill switch.</p> : null}
            {canManage ? <form className="mt-5" action={publishMetaCampaignAsPausedAction.bind(null, organizationSlug, campaignId)}><button className="button-primary w-full" disabled={!validationCurrent || !publishEnabled}>Publish to Meta as Paused</button></form> : <p className="mt-4 text-sm text-text-secondary">Members cannot approve publishing.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function Missing({ organizationSlug, campaignId }: { organizationSlug: string; campaignId: string }) { return <div className="empty-state p-8 text-center text-sm">Configure Meta first. <Link className="font-semibold text-primary" href={`/dashboard/${organizationSlug}/campaigns/${campaignId}/meta`}>Open configuration</Link></div>; }
function Summary({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p><p className="mt-2 text-sm leading-6">{value}</p></div>; }
function IssueList({ title, issues, tone }: { title: string; issues: Issue[]; tone: "danger" | "warning" }) { return issues.length ? <div className={`mt-4 rounded-xl border p-4 text-sm ${tone === "danger" ? "border-danger/20 bg-danger-muted text-danger" : "border-warning/20 bg-warning-muted text-warning"}`}><p className="font-semibold">{title}</p><ul className="mt-2 space-y-1">{issues.map((item, index) => <li key={`${item.code}-${index}`}>• {item.message ?? item.code ?? "Validation issue"}</li>)}</ul></div> : null; }
function formatBudget(budget: MetaPublishSnapshotBudget) { if (!budget?.type) return "Not set"; const amount = budget.type === "DAILY" ? budget.dailyBudget : budget.lifetimeBudget; return `${budget.currencyCode} ${amount ?? "—"} ${budget.type.toLowerCase()}`; }
type MetaPublishSnapshotBudget = Awaited<ReturnType<typeof buildMetaPublishSnapshot>>["snapshot"]["campaign"]["budget"];
function formatDate(value?: string | null) { return value ? new Date(value).toLocaleDateString() : "Open"; }
