import Link from "next/link";

import { PlusIcon } from "@/components/ui/icons";
import { CampaignList } from "@/features/campaigns/components/campaign-list";
import { getCampaigns } from "@/features/campaigns/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string }> };

export default async function CampaignsPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  const tenant = await requireTenantContext(organizationSlug);
  const campaigns = await getCampaigns(tenant.organizationId);
  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;

  return (
    <div>
      <header className="flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
        <div>
          <p className="eyebrow">Campaign Builder</p>
          <h1 className="page-title">Campaign plans</h1>
          <p className="page-description">
            Structure draft campaigns from real products and approved creative
            work. Publishing and ad spend remain unavailable.
          </p>
        </div>
        {canManage ? (
          <Link href={`/dashboard/${organizationSlug}/campaigns/new`} className="button-primary gap-2">
            <PlusIcon className="size-4" />
            New campaign
          </Link>
        ) : null}
      </header>
      <CampaignList campaigns={campaigns} organizationSlug={organizationSlug} canManage={canManage} />
    </div>
  );
}
