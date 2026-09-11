import Link from "next/link";
import { notFound } from "next/navigation";

import { MetaCampaignConfigurationForm } from "@/features/meta/components/meta-forms";
import { getMetaCampaignWorkspace } from "@/features/meta/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

export default async function CampaignMetaPage({ params }: { params: Promise<{ organizationSlug: string; campaignId: string }> }) {
  const { organizationSlug, campaignId } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const workspace = await getMetaCampaignWorkspace(tenant.organizationId, campaignId);
  if (!workspace.campaign) notFound();
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const ready = workspace.campaign.status === "APPROVED";

  return (
    <div>
      <Link href={`/dashboard/${organizationSlug}/campaigns/${campaignId}?step=review`} className="back-link">← Campaign review</Link>
      <header className="mt-7 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Meta Ads</p><h1 className="page-title">{workspace.campaign.name}</h1><p className="page-description">Configure real owned assets for explicit, PAUSED-only publishing. This does not activate delivery or spend.</p></div>{workspace.campaign.metaConfiguration ? <Link href={`/dashboard/${organizationSlug}/campaigns/${campaignId}/meta/review`} className="button-secondary">Review validation</Link> : null}</header>
      <div className="mt-8">
        {!ready ? <div className="rounded-2xl border border-warning/20 bg-warning-muted p-5 text-sm text-warning">Approve the Avora campaign plan before configuring Meta.</div> : null}
        {ready && canManage ? <MetaCampaignConfigurationForm organizationSlug={organizationSlug} campaignId={campaignId} assets={workspace.assets} campaign={workspace.campaign} /> : null}
        {ready && !canManage ? <div className="premium-panel rounded-3xl p-6 text-sm text-text-secondary">Members have read-only access. An owner or admin must configure and publish.</div> : null}
      </div>
    </div>
  );
}
