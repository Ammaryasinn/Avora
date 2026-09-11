import Link from "next/link";

import { CreateCampaignForm } from "@/features/campaigns/components/create-campaign-form";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = { params: Promise<{ organizationSlug: string }> };

export default async function NewCampaignPage({ params }: PageProps) {
  const { organizationSlug } = await params;
  await requireTenantContext(organizationSlug, [OrganizationRole.OWNER, OrganizationRole.ADMIN]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link href={`/dashboard/${organizationSlug}/campaigns`} className="back-link">← Back to campaigns</Link>
      <p className="eyebrow mt-8">New campaign draft</p>
      <h1 className="page-title">Start with the objective</h1>
      <p className="page-description">
        Create a partial draft now, then add products, audience, approved
        creatives, budget, and schedule step by step.
      </p>
      <CreateCampaignForm organizationSlug={organizationSlug} />
    </div>
  );
}
