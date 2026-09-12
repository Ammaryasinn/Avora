/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

import {
  approveManualCampaignCreativeAction,
  revokeManualCampaignCreativeApprovalAction,
} from "@/features/meta/server/actions";

import type { getCampaignForBuilder } from "../server/queries";
import { getCampaignReadinessIssues } from "../server/schema";
import { ReviewActions } from "./campaign-step-forms";

type Campaign = NonNullable<Awaited<ReturnType<typeof getCampaignForBuilder>>>;

export function CampaignReview({
  campaign,
  organizationSlug,
  canManage,
}: {
  campaign: Campaign;
  organizationSlug: string;
  canManage: boolean;
}) {
  const readinessIssues = getCampaignReadinessIssues({
    name: campaign.name,
    objective: campaign.objective,
    productCount: campaign.products.filter(
      (item) => item.product.status !== "ARCHIVED" && !item.product.archivedAt,
    ).length,
    creativeCount: campaign.creatives.length,
    audience: campaign.audience,
    budget: campaign.budget,
  });

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-primary/20 bg-primary-muted/55 p-6 sm:p-8">
        <p className="eyebrow">Review</p>
        <h2 className="section-heading mt-3 text-3xl">Campaign plan summary</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
          This is Avora&apos;s approved planning record. Meta publishing is a separate,
          explicit workflow and can only create paused objects.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ReviewSection title="Objective">
          <ReviewValue label="Campaign" value={campaign.name} />
          <ReviewValue label="Objective" value={campaign.objective ? formatEnum(campaign.objective) : "Not selected"} />
          <ReviewValue label="Notes" value={campaign.notes || "No planning notes"} />
        </ReviewSection>

        <ReviewSection title="Audience">
          <ReviewValue label="Country" value={campaign.audience?.countryCode || "Not set"} />
          <ReviewValue
            label="Locations"
            value={[
              ...(campaign.audience?.regions ?? []),
              ...(campaign.audience?.cities ?? []),
            ].join(", ") || "Not set"}
          />
          <ReviewValue
            label="Age range"
            value={campaign.audience?.minimumAge || campaign.audience?.maximumAge
              ? `${campaign.audience.minimumAge ?? "Open"}–${campaign.audience.maximumAge ?? "Open"}`
              : "Not set"}
          />
          <ReviewValue label="Gender" value={campaign.audience?.gender ? formatEnum(campaign.audience.gender) : "Not specified"} />
          <ReviewValue label="Interests" value={campaign.audience?.interests.join(", ") || "Not set"} />
          <ReviewValue label="Description" value={campaign.audience?.customAudienceDescription || "Not set"} />
        </ReviewSection>
      </div>

      <ReviewSection title="Products">
        {campaign.products.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {campaign.products.map(({ product }) => (
              <div key={product.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-surface-muted text-[10px] text-text-muted">
                  {product.media[0] ? (
                    <img src={`/api/storage/product-media/${product.media[0].id}`} alt={product.media[0].altText ?? product.name} className="size-full object-cover" />
                  ) : "No image"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{product.name}</p>
                  <p className="mt-1 text-xs text-text-muted">{product.status.toLowerCase()}</p>
                </div>
              </div>
            ))}
          </div>
        ) : <Empty text="No products selected." />}
      </ReviewSection>

      <ReviewSection title="Creatives and assets">
        {campaign.creatives.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {campaign.creatives.map((item) => {
              const manual = item.source === "MANUAL_UPLOAD";
              const approvedForPaidMedia = Boolean(
                manual &&
                item.checksumSha256 &&
                item.metaApprovals[0]?.assetChecksum === item.checksumSha256,
              );
              const imageUrl = manual
                ? `/api/storage/campaign-assets/${item.id}`
                : item.creativeAsset
                  ? `/api/storage/creative-assets/${item.creativeAsset.id}`
                  : null;
              return (
                <div key={item.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                  <div className="grid aspect-[16/9] place-items-center bg-ai-muted text-sm text-ai">
                    {imageUrl ? <img src={imageUrl} alt={item.altText ?? item.creativeAsset?.altText ?? item.creative?.title ?? "Campaign creative"} className="size-full object-cover" /> : "Approved copy creative"}
                  </div>
                  <div className="p-4">
                    <p className="truncate text-sm font-semibold">{manual ? item.label ?? "Manual asset" : item.creative?.title ?? "Approved creative"}</p>
                    <p className="mt-1 text-xs text-text-muted">{manual ? "Manual upload" : "Approved Creative Studio work"}</p>
                    {manual ? (
                      <div className="mt-4 border-t border-border pt-4">
                        <span
                          className={`status-pill ${approvedForPaidMedia ? "status-success" : "status-warning"}`}
                        >
                          {approvedForPaidMedia
                            ? "Approved for paid media"
                            : "Paid media approval required"}
                        </span>
                        {canManage && campaign.status !== "ARCHIVED" ? (
                          <form
                            className="mt-3"
                            action={
                              approvedForPaidMedia
                                ? revokeManualCampaignCreativeApprovalAction.bind(
                                    null,
                                    organizationSlug,
                                    campaign.id,
                                    item.id,
                                  )
                                : approveManualCampaignCreativeAction.bind(
                                    null,
                                    organizationSlug,
                                    campaign.id,
                                    item.id,
                                  )
                            }
                          >
                            <button
                              className="button-secondary w-full"
                              disabled={!approvedForPaidMedia && !item.checksumSha256}
                            >
                              {approvedForPaidMedia
                                ? "Revoke paid media approval"
                                : "Approve for paid media"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Empty text="No creatives or manual assets selected." />}
      </ReviewSection>

      <ReviewSection title="Budget and schedule">
        <div className="grid gap-4 sm:grid-cols-3">
          <ReviewValue
            label="Budget"
            value={formatBudget(campaign)}
          />
          <ReviewValue label="Start" value={campaign.budget?.startDate?.toLocaleDateString() ?? "Not set"} />
          <ReviewValue label="End" value={campaign.budget?.endDate?.toLocaleDateString() ?? "Not set"} />
        </div>
      </ReviewSection>

      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow">Draft controls</p>
        <h2 className="section-heading mt-3 text-2xl">Internal planning lifecycle</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Ready for review and approved are internal Avora planning states. They
          do not represent platform approval, delivery, or publishing.
        </p>
        {canManage ? (
          <ReviewActions
            organizationSlug={organizationSlug}
            campaignId={campaign.id}
            campaignStatus={campaign.status}
            readinessIssues={readinessIssues}
          />
        ) : (
          <p className="mt-5 rounded-2xl border border-border bg-surface-muted/50 p-4 text-sm text-text-secondary">
            Members can review campaign plans but cannot change them.
          </p>
        )}
        {campaign.status === "APPROVED" ? (
          <div className="mt-5 border-t border-border pt-5">
            <Link href={`/dashboard/${organizationSlug}/campaigns/${campaign.id}/meta`} className="button-primary">
              Configure Meta publishing
            </Link>
            <p className="mt-3 text-xs text-text-muted">Publishing requires separate validation and explicit approval. All created delivery objects remain PAUSED.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="premium-panel rounded-3xl p-6 sm:p-8">
      <h2 className="section-heading text-2xl">{title}</h2>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function ReviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty-state p-7 text-center text-sm">{text}</div>;
}

function formatBudget(campaign: Campaign) {
  if (!campaign.budget?.type) return "Not set";
  const amount = campaign.budget.type === "DAILY"
    ? campaign.budget.dailyBudget
    : campaign.budget.lifetimeBudget;
  if (!amount) return `${formatEnum(campaign.budget.type)} amount not set`;
  return `${campaign.budget.currencyCode} ${amount.toFixed(2)} ${campaign.budget.type === "DAILY" ? "per day" : "lifetime"}`;
}

function formatEnum(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}
