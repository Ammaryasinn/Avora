import Link from "next/link";

import { MegaphoneIcon, PlusIcon } from "@/components/ui/icons";
import type {
  CampaignBudgetType,
  CampaignObjective,
  CampaignStatus,
} from "@/generated/prisma/enums";

type CampaignListItem = {
  id: string;
  name: string;
  objective: CampaignObjective | null;
  status: CampaignStatus;
  productCount: number;
  creativeCount: number;
  budgetType: CampaignBudgetType | null;
  budgetAmount: string | null;
  currencyCode: string | null;
  startDate: Date | null;
  endDate: Date | null;
  updatedAt: Date;
};

export function CampaignList({
  campaigns,
  organizationSlug,
  canManage,
}: {
  campaigns: CampaignListItem[];
  organizationSlug: string;
  canManage: boolean;
}) {
  if (!campaigns.length) {
    return (
      <div className="premium-panel mt-10 rounded-3xl px-6 py-16 text-center sm:py-20">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-border-strong bg-primary-muted text-primary">
          <MegaphoneIcon className="size-6" />
        </span>
        <h2 className="section-heading mt-6 text-2xl">Plan your first campaign</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-text-secondary">
          Build a structured draft from real products and approved creatives.
          Nothing will be published and no spend will be initiated.
        </p>
        {canManage ? (
          <Link
            href={`/dashboard/${organizationSlug}/campaigns/new`}
            className="button-primary mt-7 gap-2"
          >
            <PlusIcon className="size-4" />
            Create campaign draft
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-4 xl:grid-cols-2">
      {campaigns.map((campaign) => (
        <Link
          key={campaign.id}
          href={`/dashboard/${organizationSlug}/campaigns/${campaign.id}`}
          className="premium-panel group rounded-3xl p-5 transition hover:-translate-y-0.5 hover:border-border-strong sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CampaignStatusBadge status={campaign.status} />
              <h2 className="mt-4 truncate text-lg font-semibold group-hover:text-primary-hover">
                {campaign.name}
              </h2>
              <p className="mt-1.5 text-sm text-text-secondary">
                {campaign.objective
                  ? formatEnum(campaign.objective)
                  : "Objective not selected"}
              </p>
            </div>
            <span className="text-xs text-text-muted">
              {campaign.updatedAt.toLocaleDateString()}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-5">
            <ListMetric label="Products" value={String(campaign.productCount)} />
            <ListMetric label="Creatives" value={String(campaign.creativeCount)} />
            <ListMetric
              label="Budget"
              value={
                campaign.budgetAmount && campaign.currencyCode
                  ? `${campaign.currencyCode} ${campaign.budgetAmount}`
                  : "Not set"
              }
            />
          </div>
          {campaign.startDate || campaign.endDate ? (
            <p className="mt-4 text-xs text-text-muted">
              Schedule: {campaign.startDate?.toLocaleDateString() ?? "Open"} – {campaign.endDate?.toLocaleDateString() ?? "Open"}
            </p>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const style = {
    DRAFT: "status-warning",
    READY_FOR_REVIEW: "status-neutral",
    APPROVED: "status-success",
    ARCHIVED: "border-border bg-surface-muted text-text-secondary",
  }[status];

  return <span className={`status-pill ${style}`}>{formatEnum(status)}</span>;
}

function ListMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-text-muted">{label}</p>
      <p className="mt-1.5 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function formatEnum(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}
