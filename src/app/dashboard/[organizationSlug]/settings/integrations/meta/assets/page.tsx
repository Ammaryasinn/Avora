import Link from "next/link";

import { MetaAssetSelectionForm } from "@/features/meta/components/meta-forms";
import { getMetaAssetOptions } from "@/features/meta/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getMetaAvailability } from "@/lib/meta/config";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

export default async function MetaAssetsPage({ params }: { params: Promise<{ organizationSlug: string }> }) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const assets = await getMetaAssetOptions(tenant.organizationId);
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;

  return (
    <div>
      <Link href={`/dashboard/${organizationSlug}/settings/integrations/meta`} className="back-link">← Meta integration</Link>
      <header className="mt-7"><p className="eyebrow">Meta assets</p><h1 className="page-title">Publishing identity</h1><p className="page-description">Avora stores tenant-scoped references to assets returned by Meta. Access is rechecked during validation and before publishing.</p></header>
      <div className="mt-8">
        {canManage ? (
          assets.connections.length && assets.adAccounts.length && assets.pages.length ? (
            <MetaAssetSelectionForm organizationSlug={organizationSlug} {...assets} defaults={assets.settings} serverPublishingEnabled={getMetaAvailability().publishingEnabled} />
          ) : <div className="empty-state p-8 text-center text-sm">Connect Meta and sync at least one ad account and Page first.</div>
        ) : <div className="premium-panel rounded-3xl p-6 text-sm text-text-secondary">Members can view Meta configuration but cannot change connected assets.</div>}
      </div>
    </div>
  );
}
