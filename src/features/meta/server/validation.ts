import "server-only";

import { META_OAUTH_SCOPES } from "@/lib/meta/config";
import { getMetaAdsGateway } from "@/lib/meta/meta-ads-gateway";

import { getMetaConnectionWithToken } from "./connections";
import type { MetaPublishSnapshot } from "./publishing-snapshot";

export type MetaValidationIssue = {
  code: string;
  message: string;
};

const objectiveGoals = {
  AWARENESS: new Set(["REACH", "IMPRESSIONS"]),
  TRAFFIC: new Set(["LINK_CLICKS", "LANDING_PAGE_VIEWS"]),
  SALES: new Set(["OFFSITE_CONVERSIONS"]),
  LEADS: new Set(["OFFSITE_CONVERSIONS"]),
} as const;

export function validateMetaSnapshot(
  snapshot: MetaPublishSnapshot,
  now = new Date(),
) {
  const errors: MetaValidationIssue[] = [];
  const warnings: MetaValidationIssue[] = [];
  const campaign = snapshot.campaign;

  if (campaign.status !== "APPROVED") {
    errors.push({ code: "CAMPAIGN_NOT_APPROVED", message: "Approve the Avora campaign first." });
  }
  if (!campaign.objective) {
    errors.push({ code: "OBJECTIVE_MISSING", message: "Select a campaign objective." });
  } else if (
    !snapshot.configuration.optimizationGoal ||
    !objectiveGoals[campaign.objective].has(snapshot.configuration.optimizationGoal as never)
  ) {
    errors.push({ code: "OPTIMIZATION_UNSUPPORTED", message: "Choose an optimization goal supported by the campaign objective." });
  }
  if (snapshot.connection.status !== "CONNECTED") {
    errors.push({ code: "CONNECTION_UNHEALTHY", message: "Reconnect Meta before publishing." });
  }
  const missingScopes = META_OAUTH_SCOPES.filter(
    (scope) => scope !== "public_profile" && !snapshot.connection.scopes.includes(scope),
  );
  if (missingScopes.length) {
    errors.push({ code: "PERMISSIONS_MISSING", message: "The Meta connection is missing required permissions." });
  }
  if (snapshot.adAccount.accessStatus !== "ACCESSIBLE" || snapshot.page.accessStatus !== "ACCESSIBLE") {
    errors.push({ code: "META_ASSET_INACCESSIBLE", message: "The selected ad account or Page is no longer accessible." });
  }
  if (snapshot.instagramAccount?.accessStatus === "INACCESSIBLE") {
    errors.push({ code: "INSTAGRAM_INACCESSIBLE", message: "The selected Instagram account is no longer accessible." });
  }
  if (!campaign.budget?.type) {
    errors.push({ code: "BUDGET_MISSING", message: "Add a campaign budget." });
  } else {
    const amount = campaign.budget.type === "DAILY"
      ? campaign.budget.dailyBudget
      : campaign.budget.lifetimeBudget;
    if (!amount || Number(amount) <= 0) {
      errors.push({ code: "BUDGET_INVALID", message: "The selected budget must be greater than zero." });
    }
    if (campaign.budget.currencyCode !== snapshot.adAccount.currencyCode) {
      errors.push({ code: "CURRENCY_MISMATCH", message: "Campaign and Meta ad-account currencies must match exactly." });
    }
    if (!campaign.budget.startDate) {
      errors.push({ code: "START_DATE_MISSING", message: "Choose a campaign start date." });
    } else if (new Date(campaign.budget.startDate).getTime() < startOfToday(now).getTime()) {
      errors.push({ code: "START_DATE_PAST", message: "The campaign start date cannot be in the past." });
    }
    if (campaign.budget.type === "LIFETIME" && !campaign.budget.endDate) {
      errors.push({ code: "END_DATE_MISSING", message: "Lifetime budgets require an end date." });
    }
    if (
      campaign.budget.startDate &&
      campaign.budget.endDate &&
      new Date(campaign.budget.endDate) <= new Date(campaign.budget.startDate)
    ) {
      errors.push({ code: "SCHEDULE_INVALID", message: "The end date must be after the start date." });
    }
  }
  if (["SALES", "LEADS"].includes(campaign.objective ?? "") && !snapshot.dataset) {
    errors.push({ code: "DATASET_REQUIRED", message: "Website Sales and Leads campaigns require an accessible Meta dataset." });
  }
  if (!snapshot.targets.some((target) => target.type === "COUNTRY" && target.isValid)) {
    errors.push({ code: "COUNTRY_TARGET_MISSING", message: "Resolve at least one country target." });
  }
  if (snapshot.targets.some((target) => !target.isValid)) {
    errors.push({ code: "TARGET_INVALID", message: "One or more Meta audience targets must be resolved again." });
  }
  if (snapshot.configuration.specialAdCategories.length) {
    if (campaign.audience?.minimumAge || campaign.audience?.maximumAge || campaign.audience?.gender !== "ALL") {
      errors.push({ code: "SPECIAL_CATEGORY_DEMOGRAPHICS", message: "Remove demographic restrictions for this special-ad category." });
    }
    if (snapshot.targets.some((target) => target.type === "INTEREST")) {
      errors.push({ code: "SPECIAL_CATEGORY_INTERESTS", message: "Interest targeting is not enabled for special-ad-category campaigns." });
    }
  }
  if (!snapshot.ads.length) {
    errors.push({ code: "ADS_MISSING", message: "Configure at least one ad." });
  }
  for (const ad of snapshot.ads) {
    if (!ad.asset || ad.asset.deleted || ad.asset.status !== "READY" || !ad.asset.storageKey) {
      errors.push({ code: "CREATIVE_ASSET_INVALID", message: "Every ad requires a ready canonical image asset." });
      continue;
    }
    if (!ad.asset.checksumSha256) {
      errors.push({ code: "CREATIVE_CHECKSUM_MISSING", message: "Every paid-media asset requires a checksum before publishing." });
    }
    if (ad.source === "MANUAL_UPLOAD" && ad.manualApprovalChecksum !== ad.asset.checksumSha256) {
      errors.push({ code: "MANUAL_ASSET_NOT_APPROVED", message: "Approve each manually uploaded asset for paid media." });
    }
    if (ad.source === "APPROVED_CREATIVE" && (ad.sourceCreativeStatus !== "APPROVED" || ad.sourceCreativeArchived)) {
      errors.push({ code: "CREATIVE_NOT_APPROVED", message: "Only active approved Creative Studio assets can be published." });
    }
  }
  if (!snapshot.instagramAccount) {
    warnings.push({ code: "NO_INSTAGRAM_ACCOUNT", message: "No Instagram account is selected; delivery identity will use the Facebook Page." });
  }
  warnings.push({
    code: "PAUSED_ONLY",
    message: "All created Meta campaign, ad set, and ad objects will remain paused.",
  });

  return { errors, warnings };
}

export async function runRemoteMetaValidation(snapshot: MetaPublishSnapshot) {
  const errors: MetaValidationIssue[] = [];
  const { accessToken } = await getMetaConnectionWithToken(
    snapshot.organizationId,
    snapshot.connection.id,
  );
  const gateway = getMetaAdsGateway();
  const inspection = await gateway.inspectToken(accessToken);
  if (!inspection.valid) {
    errors.push({ code: "TOKEN_INVALID", message: "The Meta access credential is no longer valid." });
    return { errors, checkedAt: new Date().toISOString() };
  }
  const externalIds = [
    snapshot.adAccount.externalId,
    snapshot.page.externalId,
    snapshot.instagramAccount?.externalId,
    snapshot.dataset?.externalId,
  ].filter((value): value is string => Boolean(value));
  const access = await Promise.all(
    externalIds.map((externalId) => gateway.checkAssetAccess(accessToken, externalId)),
  );
  if (access.some((available) => !available)) {
    errors.push({ code: "REMOTE_ASSET_INACCESSIBLE", message: "Meta could not confirm access to every selected asset." });
  }
  return { errors, checkedAt: new Date().toISOString() };
}

function startOfToday(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
