import Link from "next/link";
import { notFound } from "next/navigation";

import { CampaignReview } from "@/features/campaigns/components/campaign-review";
import {
  AudienceStepForm,
  BudgetStepForm,
  CreativesStepForm,
  ObjectiveStepForm,
  ProductsStepForm,
} from "@/features/campaigns/components/campaign-step-forms";
import {
  CampaignWorkflowNav,
  type CampaignStep,
} from "@/features/campaigns/components/campaign-workflow-nav";
import { CampaignStatusBadge } from "@/features/campaigns/components/campaign-list";
import {
  getCampaignBuilderOptions,
  getCampaignForBuilder,
} from "@/features/campaigns/server/queries";
import { OrganizationRole } from "@/generated/prisma/enums";
import { requireTenantContext } from "@/lib/tenancy/tenant-context";

type PageProps = {
  params: Promise<{ organizationSlug: string; campaignId: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
};

const validSteps = new Set<CampaignStep>([
  "objective",
  "products",
  "audience",
  "creatives",
  "budget",
  "review",
]);

export default async function CampaignBuilderPage({ params, searchParams }: PageProps) {
  const { organizationSlug, campaignId } = await params;
  const query = await searchParams;
  const tenant = await requireTenantContext(organizationSlug);
  const [campaign, options] = await Promise.all([
    getCampaignForBuilder(tenant.organizationId, campaignId),
    getCampaignBuilderOptions(tenant.organizationId),
  ]);
  if (!campaign) notFound();

  const canManage = tenant.role === OrganizationRole.OWNER || tenant.role === OrganizationRole.ADMIN;
  const editable = canManage && campaign.status !== "ARCHIVED";
  const requestedStep = typeof query.step === "string" && validSteps.has(query.step as CampaignStep)
    ? query.step as CampaignStep
    : "review";
  const activeStep: CampaignStep = editable ? requestedStep : "review";
  const campaignHref = `/dashboard/${organizationSlug}/campaigns/${campaign.id}`;
  const currencyCode = tenant.organization.businessProfile?.currencyCode ?? "USD";
  const approvedCreativeIds = campaign.creatives
    .filter((item) => item.source === "APPROVED_CREATIVE" && item.creativeId)
    .map((item) => item.creativeId as string);
  const manualAssets = campaign.creatives
    .filter((item) => item.source === "MANUAL_UPLOAD")
    .map((item) => ({ id: item.id, label: item.label, altText: item.altText }));

  return (
    <div>
      <Link href={`/dashboard/${organizationSlug}/campaigns`} className="back-link">← Campaigns</Link>
      <header className="mt-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="eyebrow">Campaign Builder</p>
          <h1 className="page-title">{campaign.name}</h1>
          <p className="page-description">
            Draft-only campaign planning. No channel connection, publishing, or spend execution is active.
          </p>
        </div>
        <CampaignStatusBadge status={campaign.status} />
      </header>

      {editable ? <CampaignWorkflowNav campaignHref={campaignHref} activeStep={activeStep} /> : (
        <div className="mt-8 rounded-2xl border border-border bg-surface-muted/55 p-4 text-sm text-text-secondary">
          {canManage ? "Archived campaigns are read-only." : "Members have read-only access to campaign plans."}
        </div>
      )}

      <div className="mt-6">
        {activeStep === "objective" ? (
          <ObjectiveStepForm organizationSlug={organizationSlug} campaignId={campaign.id} campaign={campaign} />
        ) : null}
        {activeStep === "products" ? (
          <ProductsStepForm organizationSlug={organizationSlug} campaignId={campaign.id} products={options.products} selectedIds={campaign.products.map((item) => item.productId)} currencyCode={currencyCode} />
        ) : null}
        {activeStep === "audience" ? (
          <AudienceStepForm organizationSlug={organizationSlug} campaignId={campaign.id} audience={campaign.audience} defaultCountryCode={campaign.audience?.countryCode ?? ""} />
        ) : null}
        {activeStep === "creatives" ? (
          <CreativesStepForm organizationSlug={organizationSlug} campaignId={campaign.id} creatives={options.creatives} selectedIds={approvedCreativeIds} manualAssets={manualAssets} />
        ) : null}
        {activeStep === "budget" ? (
          <BudgetStepForm
            organizationSlug={organizationSlug}
            campaignId={campaign.id}
            currencyCode={currencyCode}
            budget={{
              type: campaign.budget?.type ?? null,
              dailyBudget: campaign.budget?.dailyBudget?.toFixed(2) ?? "",
              lifetimeBudget: campaign.budget?.lifetimeBudget?.toFixed(2) ?? "",
              startDate: formatDateInput(campaign.budget?.startDate),
              endDate: formatDateInput(campaign.budget?.endDate),
            }}
          />
        ) : null}
        {activeStep === "review" ? (
          <CampaignReview campaign={campaign} organizationSlug={organizationSlug} canManage={canManage} />
        ) : null}
      </div>
    </div>
  );
}

function formatDateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}
