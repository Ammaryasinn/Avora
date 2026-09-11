"use client";

import { useActionState } from "react";

import { initialActionState } from "@/lib/forms/action-state";

import {
  saveCampaignMetaConfigurationAction,
  saveMetaAssetSelectionAction,
  validateMetaCampaignAction,
} from "../server/actions";

type Option = { id: string; name: string; connectionId: string };

export function MetaAssetSelectionForm({
  organizationSlug,
  connections,
  businesses,
  adAccounts,
  pages,
  instagramAccounts,
  datasets,
  defaults,
  serverPublishingEnabled,
}: {
  organizationSlug: string;
  connections: { id: string; metaUserName: string | null }[];
  businesses: Option[];
  adAccounts: (Option & { currencyCode: string })[];
  pages: Option[];
  instagramAccounts: { id: string; name: string | null; connectionId: string; username: string | null }[];
  datasets: (Option & { adAccountId: string | null })[];
  defaults: {
    defaultConnectionId: string | null;
    defaultBusinessId: string | null;
    defaultAdAccountId: string | null;
    defaultPageId: string | null;
    defaultInstagramAccountId: string | null;
    defaultDatasetId: string | null;
    publishingEnabled: boolean;
  } | null;
  serverPublishingEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveMetaAssetSelectionAction.bind(null, organizationSlug),
    initialActionState,
  );

  return (
    <form action={action} className="premium-panel space-y-6 rounded-3xl p-6 sm:p-8">
      <div>
        <p className="eyebrow">Connected assets</p>
        <h2 className="section-heading mt-3 text-2xl">Publishing defaults</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Select only business assets this Avora organization is authorized to use.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Select label="Connection" name="connectionId" defaultValue={defaults?.defaultConnectionId} required>
          {connections.map((item) => <option key={item.id} value={item.id}>{item.metaUserName ?? "Meta account"}</option>)}
        </Select>
        <Select label="Business portfolio" name="businessId" defaultValue={defaults?.defaultBusinessId}>
          {businesses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Select label="Ad account" name="adAccountId" defaultValue={defaults?.defaultAdAccountId} required>
          {adAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currencyCode}</option>)}
        </Select>
        <Select label="Facebook Page" name="pageId" defaultValue={defaults?.defaultPageId} required>
          {pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
        <Select label="Instagram account" name="instagramAccountId" defaultValue={defaults?.defaultInstagramAccountId}>
          {instagramAccounts.map((item) => <option key={item.id} value={item.id}>@{item.username ?? item.name}</option>)}
        </Select>
        <Select label="Dataset / Pixel" name="datasetId" defaultValue={defaults?.defaultDatasetId}>
          {datasets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <label className="flex items-start gap-3 rounded-2xl border border-border bg-surface-muted/45 p-4 text-sm">
        <input
          type="checkbox"
          name="publishingEnabled"
          className="mt-0.5 size-4 accent-primary"
          defaultChecked={defaults?.publishingEnabled}
          disabled={!serverPublishingEnabled}
        />
        <span>
          <span className="block font-semibold">Allow approved PAUSED publishing</span>
          <span className="mt-1 block leading-5 text-text-secondary">
            The server kill switch must also be enabled. This never activates delivery or spend.
          </span>
        </span>
      </label>
      <ActionMessage state={state} />
      <button className="button-primary" disabled={pending}>{pending ? "Saving…" : "Save Meta defaults"}</button>
    </form>
  );
}

export function MetaCampaignConfigurationForm({
  organizationSlug,
  campaignId,
  assets,
  campaign,
}: {
  organizationSlug: string;
  campaignId: string;
  assets: {
    connections: { id: string; metaUserName: string | null }[];
    adAccounts: { id: string; name: string; currencyCode: string }[];
    pages: { id: string; name: string }[];
    instagramAccounts: { id: string; username: string | null; name: string | null }[];
    datasets: { id: string; name: string }[];
    settings: {
      defaultConnectionId: string | null;
      defaultAdAccountId: string | null;
      defaultPageId: string | null;
      defaultInstagramAccountId: string | null;
      defaultDatasetId: string | null;
    } | null;
  };
  campaign: {
    metaConfiguration: {
      connectionId: string;
      adAccountId: string;
      pageId: string;
      instagramAccountId: string | null;
      datasetId: string | null;
      optimizationGoal: string | null;
      callToAction: string | null;
      specialAdCategories: string[];
      beneficiaryName: string | null;
      payorName: string | null;
      ads: { campaignCreativeId: string; campaignProductId: string | null; destinationUrl: string; primaryText: string; headline: string | null; description: string | null }[];
    } | null;
    products: { id: string; product: { name: string } }[];
    creatives: { id: string; label: string | null; creative: { title: string; status: string } | null; variant: { content: unknown } | null }[];
  };
}) {
  const [state, action, pending] = useActionState(
    saveCampaignMetaConfigurationAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );
  const configuration = campaign.metaConfiguration;
  const configuredAds = new Map(configuration?.ads.map((item) => [item.campaignCreativeId, item]));
  const defaults = assets.settings;

  return (
    <form action={action} className="space-y-6">
      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow">Meta configuration</p>
        <h2 className="section-heading mt-3 text-2xl">Identity and delivery setup</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Select label="Connection" name="connectionId" required defaultValue={configuration?.connectionId ?? defaults?.defaultConnectionId}>
            {assets.connections.map((item) => <option key={item.id} value={item.id}>{item.metaUserName ?? "Meta account"}</option>)}
          </Select>
          <Select label="Ad account" name="adAccountId" required defaultValue={configuration?.adAccountId ?? defaults?.defaultAdAccountId}>
            {assets.adAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currencyCode}</option>)}
          </Select>
          <Select label="Facebook Page" name="pageId" required defaultValue={configuration?.pageId ?? defaults?.defaultPageId}>
            {assets.pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select label="Instagram account" name="instagramAccountId" defaultValue={configuration?.instagramAccountId ?? defaults?.defaultInstagramAccountId}>
            {assets.instagramAccounts.map((item) => <option key={item.id} value={item.id}>@{item.username ?? item.name}</option>)}
          </Select>
          <Select label="Dataset / Pixel" name="datasetId" defaultValue={configuration?.datasetId ?? defaults?.defaultDatasetId}>
            {assets.datasets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
          <Select label="Optimization" name="optimizationGoal" required defaultValue={configuration?.optimizationGoal ?? "IMPRESSIONS"}>
            <option value="REACH">Reach</option><option value="IMPRESSIONS">Impressions</option>
            <option value="LINK_CLICKS">Link clicks</option><option value="LANDING_PAGE_VIEWS">Landing page views</option>
            <option value="OFFSITE_CONVERSIONS">Website conversions</option>
          </Select>
          <Select label="Call to action" name="callToAction" required defaultValue={configuration?.callToAction ?? "LEARN_MORE"}>
            <option value="SHOP_NOW">Shop now</option><option value="LEARN_MORE">Learn more</option>
            <option value="SIGN_UP">Sign up</option><option value="CONTACT_US">Contact us</option>
          </Select>
        </div>
        <fieldset className="mt-6">
          <legend className="field-label">Special ad categories</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {["HOUSING", "EMPLOYMENT", "CREDIT", "ISSUES_ELECTIONS_POLITICS"].map((value) => (
              <label key={value} className="choice-card flex items-center gap-3">
                <input type="checkbox" name="specialAdCategories" value={value} defaultChecked={configuration?.specialAdCategories.includes(value)} className="size-4 accent-primary" />
                <span className="text-sm font-semibold">{formatEnum(value)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <Field label="Beneficiary name" name="beneficiaryName" defaultValue={configuration?.beneficiaryName ?? ""} />
          <Field label="Payor name" name="payorName" defaultValue={configuration?.payorName ?? ""} />
        </div>
      </section>

      <section className="premium-panel rounded-3xl p-6 sm:p-8">
        <p className="eyebrow">Ad variants</p>
        <h2 className="section-heading mt-3 text-2xl">Approved creative assignments</h2>
        <div className="mt-6 space-y-5">
          {campaign.creatives.map((creative, index) => {
            const existing = configuredAds.get(creative.id);
            const content = readCopy(creative.variant?.content);
            return (
              <div key={creative.id} className="rounded-2xl border border-border bg-surface-muted/35 p-5">
                <label className="flex items-center gap-3 font-semibold">
                  <input type="checkbox" name="campaignCreativeId" value={creative.id} defaultChecked={Boolean(existing)} className="size-4 accent-primary" />
                  {creative.creative?.title ?? creative.label ?? `Creative ${index + 1}`}
                </label>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Select label="Related product" name={`product:${creative.id}`} defaultValue={existing?.campaignProductId}>
                    {campaign.products.map((item) => <option key={item.id} value={item.id}>{item.product.name}</option>)}
                  </Select>
                  <Field label="HTTPS destination URL" name={`url:${creative.id}`} defaultValue={existing?.destinationUrl ?? ""} type="url" />
                  <label className="field-label md:col-span-2">Primary text<textarea name={`text:${creative.id}`} className="form-control min-h-28" defaultValue={existing?.primaryText ?? content} maxLength={2200} /></label>
                  <Field label="Headline" name={`headline:${creative.id}`} defaultValue={existing?.headline ?? ""} />
                  <Field label="Description" name={`description:${creative.id}`} defaultValue={existing?.description ?? ""} />
                </div>
              </div>
            );
          })}
        </div>
        <ActionMessage state={state} />
        <button className="button-primary mt-6" disabled={pending}>{pending ? "Saving…" : "Save Meta configuration"}</button>
      </section>
    </form>
  );
}

export function MetaValidationAction({ organizationSlug, campaignId }: { organizationSlug: string; campaignId: string }) {
  const [state, action, pending] = useActionState(
    validateMetaCampaignAction.bind(null, organizationSlug, campaignId),
    initialActionState,
  );
  return <div><form action={action}><button className="button-primary" disabled={pending}>{pending ? "Validating with Meta…" : "Validate for Meta publishing"}</button></form><ActionMessage state={state} /></div>;
}

function Select({ label, name, defaultValue, required, children }: { label: string; name: string; defaultValue?: string | null; required?: boolean; children: React.ReactNode }) {
  return <label className="field-label">{label}<select name={name} className="form-control" defaultValue={defaultValue ?? ""} required={required}><option value="">Select…</option>{children}</select></label>;
}

function Field({ label, name, defaultValue, type = "text" }: { label: string; name: string; defaultValue: string; type?: "text" | "url" }) {
  return <label className="field-label">{label}<input name={name} type={type} className="form-control" defaultValue={defaultValue} maxLength={type === "url" ? 2048 : 255} /></label>;
}

function ActionMessage({ state }: { state: typeof initialActionState }) {
  return state.message ? <p className={`mt-4 rounded-xl border p-4 text-sm ${state.status === "error" ? "border-danger/20 bg-danger-muted text-danger" : "border-success/20 bg-success-muted text-success"}`}>{state.message}</p> : null;
}

function readCopy(content: unknown) {
  if (!content || typeof content !== "object") return "";
  const value = content as Record<string, unknown>;
  return typeof value.primaryText === "string" ? value.primaryText : typeof value.text === "string" ? value.text : "";
}

function formatEnum(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
}
