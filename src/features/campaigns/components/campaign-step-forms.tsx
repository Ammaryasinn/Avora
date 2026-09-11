"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  CampaignAudienceGender,
  CampaignBudgetType,
  CampaignObjective,
  type CampaignStatus,
  type ProductStatus,
} from "@/generated/prisma/enums";
import { initialActionState } from "@/lib/forms/action-state";

import {
  approveCampaignAction,
  archiveCampaignAction,
  markCampaignReadyAction,
  removeManualCampaignAssetAction,
  returnCampaignToDraftAction,
  updateCampaignAudienceAction,
  updateCampaignBudgetAction,
  updateCampaignCreativesAction,
  updateCampaignObjectiveAction,
  updateCampaignProductsAction,
} from "../server/actions";
import { CampaignAssetUploader } from "./campaign-asset-uploader";

const objectives = [
  [CampaignObjective.SALES, "Sales"],
  [CampaignObjective.LEADS, "Leads"],
  [CampaignObjective.TRAFFIC, "Traffic"],
  [CampaignObjective.AWARENESS, "Awareness"],
] as const;

export function ObjectiveStepForm({
  organizationSlug,
  campaignId,
  campaign,
}: {
  organizationSlug: string;
  campaignId: string;
  campaign: {
    name: string;
    objective: CampaignObjective | null;
    notes: string | null;
  };
}) {
  const [state, action, pending] = useActionState(
    updateCampaignObjectiveAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );

  return (
    <StepForm action={action} title="Objective" description="Define what this campaign plan is intended to achieve.">
      <label className="field-label">
        Campaign name
        <input name="name" className="form-control" defaultValue={campaign.name} maxLength={160} />
      </label>
      <fieldset>
        <legend className="field-label">Objective</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {objectives.map(([value, label]) => (
            <label key={value} className="choice-card">
              <input className="sr-only" type="radio" name="objective" value={value} defaultChecked={campaign.objective === value} />
              <span className="choice-indicator" />
              <span className="font-semibold">{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field-label">
        Planning notes
        <textarea name="notes" className="form-control min-h-28 resize-y" defaultValue={campaign.notes ?? ""} maxLength={2000} />
      </label>
      <ActionMessage state={state} />
      <StepActions pending={pending} nextLabel="Products" />
    </StepForm>
  );
}

export function ProductsStepForm({
  organizationSlug,
  campaignId,
  products,
  selectedIds,
  currencyCode,
}: {
  organizationSlug: string;
  campaignId: string;
  products: {
    id: string;
    name: string;
    sku: string | null;
    status: ProductStatus;
    price: string;
    media: { id: string; altText: string | null }[];
  }[];
  selectedIds: string[];
  currencyCode: string;
}) {
  const [state, action, pending] = useActionState(
    updateCampaignProductsAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );
  const selected = new Set(selectedIds);

  return (
    <StepForm action={action} title="Products" description="Choose real catalogue products for this campaign draft. Archived products are never selectable.">
      {products.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {products.map((product) => (
            <label key={product.id} className="choice-card flex items-center gap-4">
              <input type="checkbox" name="productIds" value={product.id} defaultChecked={selected.has(product.id)} className="size-4 accent-primary" />
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-muted text-text-muted">
                {product.media[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/storage/product-media/${product.media[0].id}`} alt={product.media[0].altText ?? product.name} className="size-full object-cover" />
                ) : (
                  <span className="text-xs">No image</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{product.name}</span>
                <span className="mt-1 block text-xs text-text-secondary">
                  {currencyCode} {product.price} · {product.status.toLowerCase()}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <div className="empty-state p-8 text-center text-sm">No available catalogue products.</div>
      )}
      <ActionMessage state={state} />
      <StepActions pending={pending} nextLabel="Audience" />
    </StepForm>
  );
}

export function AudienceStepForm({
  organizationSlug,
  campaignId,
  audience,
  defaultCountryCode,
}: {
  organizationSlug: string;
  campaignId: string;
  audience: {
    countryCode: string | null;
    regions: string[];
    cities: string[];
    minimumAge: number | null;
    maximumAge: number | null;
    gender: CampaignAudienceGender | null;
    interests: string[];
    notes: string | null;
    customAudienceDescription: string | null;
  } | null;
  defaultCountryCode: string;
}) {
  const [state, action, pending] = useActionState(
    updateCampaignAudienceAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );

  return (
    <StepForm action={action} title="Audience" description="Describe the intended audience without creating or syncing a platform audience.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Country code" name="countryCode" defaultValue={audience?.countryCode ?? defaultCountryCode} placeholder="KE" error={state.fieldErrors?.countryCode?.[0]} />
        <label className="field-label">
          Gender
          <select name="gender" className="form-control" defaultValue={audience?.gender ?? ""}>
            <option value="">Not specified</option>
            <option value={CampaignAudienceGender.ALL}>All</option>
            <option value={CampaignAudienceGender.WOMEN}>Women</option>
            <option value={CampaignAudienceGender.MEN}>Men</option>
          </select>
        </label>
        <Field label="Minimum age" name="minimumAge" defaultValue={audience?.minimumAge?.toString() ?? ""} placeholder="18" inputMode="numeric" error={state.fieldErrors?.minimumAge?.[0]} />
        <Field label="Maximum age" name="maximumAge" defaultValue={audience?.maximumAge?.toString() ?? ""} placeholder="45" inputMode="numeric" error={state.fieldErrors?.maximumAge?.[0]} />
        <Field label="Regions" name="regions" defaultValue={audience?.regions.join(", ") ?? ""} placeholder="Nairobi County, Coast" hint="Separate multiple values with commas." />
        <Field label="Cities" name="cities" defaultValue={audience?.cities.join(", ") ?? ""} placeholder="Nairobi, Mombasa" hint="Separate multiple values with commas." />
        <Field label="Interests" name="interests" defaultValue={audience?.interests.join(", ") ?? ""} placeholder="Streetwear, independent fashion" hint="Planning notes only; no platform targeting is created." />
        <Field label="Audience notes" name="notes" defaultValue={audience?.notes ?? ""} placeholder="Exclude existing wholesale customers" />
      </div>
      <label className="field-label">
        Custom audience description
        <textarea name="customAudienceDescription" className="form-control min-h-28 resize-y" defaultValue={audience?.customAudienceDescription ?? ""} placeholder="Describe the customer segment in your own words." maxLength={3000} />
      </label>
      <ActionMessage state={state} />
      <StepActions pending={pending} nextLabel="Creatives" />
    </StepForm>
  );
}

export function CreativesStepForm({
  organizationSlug,
  campaignId,
  creatives,
  selectedIds,
  manualAssets,
}: {
  organizationSlug: string;
  campaignId: string;
  creatives: {
    id: string;
    title: string;
    type: string;
    product: { name: string } | null;
    selectedVariant: { id: string; name: string; assets: { id: string; altText: string | null }[] } | null;
  }[];
  selectedIds: string[];
  manualAssets: { id: string; label: string | null; altText: string | null }[];
}) {
  const [state, action, pending] = useActionState(
    updateCampaignCreativesAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );
  const selected = new Set(selectedIds);

  return (
    <div className="space-y-6">
      <StepForm action={action} title="Approved creatives" description="Choose only real, approved Creative Studio work. Copy-only creatives remain selectable without an image asset.">
        {creatives.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {creatives.map((creative) => {
              const asset = creative.selectedVariant?.assets[0];
              return (
                <label key={creative.id} className="choice-card overflow-hidden p-0">
                  <span className="grid aspect-[16/8] place-items-center bg-ai-muted text-sm text-ai">
                    {asset ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/storage/creative-assets/${asset.id}`} alt={asset.altText ?? creative.title} className="size-full object-cover" />
                    ) : (
                      "Approved copy creative"
                    )}
                  </span>
                  <span className="flex items-start gap-3 p-4">
                    <input type="checkbox" name="creativeIds" value={creative.id} defaultChecked={selected.has(creative.id)} className="mt-1 size-4 accent-ai" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{creative.title}</span>
                      <span className="mt-1 block text-xs text-text-secondary">{creative.product?.name ?? "Catalogue creative"} · {creative.type.replaceAll("_", " ").toLowerCase()}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="empty-state p-8 text-center text-sm">No approved Creative Studio work is available yet.</div>
        )}
        <ActionMessage state={state} />
        <StepActions pending={pending} nextLabel="Budget" />
      </StepForm>

      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow">Manual assets</p>
        <h2 className="section-heading mt-3 text-2xl">Add campaign-specific imagery</h2>
        <div className="mt-6">
          <CampaignAssetUploader organizationSlug={organizationSlug} campaignId={campaignId} />
        </div>
        {manualAssets.length ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {manualAssets.map((asset) => (
              <div key={asset.id} className="overflow-hidden rounded-2xl border border-border bg-surface-raised">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/storage/campaign-assets/${asset.id}`} alt={asset.altText ?? asset.label ?? "Campaign asset"} className="aspect-[16/9] w-full object-cover" />
                <div className="flex items-center justify-between gap-3 p-4">
                  <p className="truncate text-sm font-semibold">{asset.label ?? "Manual campaign asset"}</p>
                  <form action={removeManualCampaignAssetAction.bind(null, organizationSlug, campaignId, asset.id)}>
                    <button className="text-xs font-semibold text-danger hover:underline">Remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function BudgetStepForm({
  organizationSlug,
  campaignId,
  currencyCode,
  budget,
}: {
  organizationSlug: string;
  campaignId: string;
  currencyCode: string;
  budget: {
    type: CampaignBudgetType | null;
    dailyBudget: string;
    lifetimeBudget: string;
    startDate: string;
    endDate: string;
  };
}) {
  const [state, action, pending] = useActionState(
    updateCampaignBudgetAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );

  return (
    <StepForm action={action} title="Budget and schedule" description="Set planning amounts only. Avora will not execute spend or connect an ad account in this milestone.">
      <fieldset>
        <legend className="field-label">Budget type</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {[CampaignBudgetType.DAILY, CampaignBudgetType.LIFETIME].map((type) => (
            <label key={type} className="choice-card">
              <input className="sr-only" type="radio" name="type" value={type} defaultChecked={budget.type === type} />
              <span className="choice-indicator" />
              <span className="font-semibold">{type === "DAILY" ? "Daily budget" : "Lifetime budget"}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={`Daily budget (${currencyCode})`} name="dailyBudget" defaultValue={budget.dailyBudget} placeholder="25.00" inputMode="decimal" error={state.fieldErrors?.dailyBudget?.[0]} />
        <Field label={`Lifetime budget (${currencyCode})`} name="lifetimeBudget" defaultValue={budget.lifetimeBudget} placeholder="500.00" inputMode="decimal" error={state.fieldErrors?.lifetimeBudget?.[0]} />
        <Field label="Start date" name="startDate" type="date" defaultValue={budget.startDate} error={state.fieldErrors?.startDate?.[0]} />
        <Field label="End date" name="endDate" type="date" defaultValue={budget.endDate} error={state.fieldErrors?.endDate?.[0]} />
      </div>
      <ActionMessage state={state} />
      <StepActions pending={pending} nextLabel="Review" />
    </StepForm>
  );
}

export function ReviewActions({
  organizationSlug,
  campaignId,
  campaignStatus,
  readinessIssues,
}: {
  organizationSlug: string;
  campaignId: string;
  campaignStatus: CampaignStatus;
  readinessIssues: string[];
}) {
  const [state, markReady, pending] = useActionState(
    markCampaignReadyAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );
  const campaignsHref = `/dashboard/${organizationSlug}/campaigns`;

  return (
    <div className="mt-6 space-y-4">
      {campaignStatus === "DRAFT" && readinessIssues.length ? (
        <div className="rounded-2xl border border-warning/20 bg-warning-muted p-5">
          <p className="font-semibold text-warning">Draft is not ready for review</p>
          <ul className="mt-3 space-y-1.5 text-sm text-text-secondary">
            {readinessIssues.map((issue) => <li key={issue}>• {issue}</li>)}
          </ul>
        </div>
      ) : null}
      <ActionMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <Link href={campaignsHref} className="button-secondary">Save draft</Link>
        {campaignStatus === "DRAFT" ? (
          <form action={markReady}>
            <button className="button-primary" disabled={pending}>{pending ? "Checking…" : "Mark ready for review"}</button>
          </form>
        ) : null}
        {campaignStatus === "READY_FOR_REVIEW" ? (
          <form action={approveCampaignAction.bind(null, organizationSlug, campaignId)}>
            <button className="button-primary">Approve campaign plan</button>
          </form>
        ) : null}
        {campaignStatus === "READY_FOR_REVIEW" || campaignStatus === "APPROVED" ? (
          <form action={returnCampaignToDraftAction.bind(null, organizationSlug, campaignId)}>
            <button className="button-secondary">Return to draft</button>
          </form>
        ) : null}
        {campaignStatus !== "ARCHIVED" ? (
          <form action={archiveCampaignAction.bind(null, organizationSlug, campaignId)}>
            <button className="button-secondary text-danger">Archive</button>
          </form>
        ) : null}
      </div>
      {campaignStatus === "APPROVED" ? (
        <p className="text-xs text-text-muted">Approved means internally approved as a plan only. It has not been published and cannot spend money.</p>
      ) : null}
    </div>
  );
}

function StepForm({ action, title, description, children }: { action: (formData: FormData) => void; title: string; description: string; children: React.ReactNode }) {
  return (
    <form action={action} className="premium-panel space-y-6 rounded-3xl p-6 sm:p-8">
      <div>
        <p className="eyebrow">Campaign builder</p>
        <h2 className="section-heading mt-3 text-2xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{description}</p>
      </div>
      {children}
    </form>
  );
}

function StepActions({ pending, nextLabel }: { pending: boolean; nextLabel: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
      <button name="intent" value="save" className="button-secondary" disabled={pending}>Save draft</button>
      <button name="intent" value="continue" className="button-primary" disabled={pending}>{pending ? "Saving…" : `Save and continue to ${nextLabel}`}</button>
    </div>
  );
}

function ActionMessage({ state }: { state: typeof initialActionState }) {
  return state.message ? (
    <div className="rounded-xl border border-danger/20 bg-danger-muted p-4 text-sm text-danger">
      <p>{state.message}</p>
      {state.fieldErrors?.review?.length ? (
        <ul className="mt-2 space-y-1">{state.fieldErrors.review.map((issue) => <li key={issue}>• {issue}</li>)}</ul>
      ) : null}
    </div>
  ) : null;
}

function Field({ label, name, defaultValue, placeholder, hint, error, inputMode = "text", type = "text" }: { label: string; name: string; defaultValue: string; placeholder?: string; hint?: string; error?: string; inputMode?: "text" | "numeric" | "decimal"; type?: "text" | "date" }) {
  return (
    <label className="field-label">
      {label}
      <input name={name} type={type} inputMode={inputMode} className="form-control" defaultValue={defaultValue} placeholder={placeholder} />
      {error ? <span className="field-error block">{error}</span> : null}
      {hint ? <span className="mt-2 block text-xs text-text-muted">{hint}</span> : null}
    </label>
  );
}
