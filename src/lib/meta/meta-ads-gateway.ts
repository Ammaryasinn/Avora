import "server-only";

import { z } from "zod";

import { getMetaConfiguration } from "./config";
import type {
  MetaAdAccountAsset,
  MetaAdsGateway,
  MetaBusinessAsset,
  MetaDatasetAsset,
  MetaPageAsset,
  MetaTargetResult,
} from "./contracts";
import { MetaApiError } from "./errors";

const graphErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.union([z.string(), z.number()]).optional(),
    error_subcode: z.union([z.string(), z.number()]).optional(),
    fbtrace_id: z.string().optional(),
  }),
});

function dateFromSeconds(value: unknown) {
  return typeof value === "number" && value > 0 ? new Date(value * 1_000) : undefined;
}

function ownedBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy;
}

function safeProviderMessage(message?: string) {
  if (!message) return "Meta rejected the request.";
  return message
    .replace(/((?:access_token|client_secret|code)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/\b\d{8,}\b/g, "[asset-id]")
    .slice(0, 500);
}

class GraphMetaAdsGateway implements MetaAdsGateway {
  private get baseUrl() {
    return `https://graph.facebook.com/${getMetaConfiguration().graphApiVersion}`;
  }

  private async request<T>(
    path: string,
    accessToken: string | null,
    init?: RequestInit,
    ambiguousOnNetworkFailure = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/${path.replace(/^\//, "")}`, {
        ...init,
        headers: {
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...init?.headers,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new MetaApiError({
        message: "Meta could not be reached.",
        retryable: !ambiguousOnNetworkFailure,
        ambiguous: ambiguousOnNetworkFailure,
      });
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = graphErrorSchema.safeParse(payload);
      const code = parsed.success ? String(parsed.data.error.code ?? "") || undefined : undefined;
      const retryAfterHeader = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfterHeader
        ? Number.parseInt(retryAfterHeader, 10) || undefined
        : undefined;
      throw new MetaApiError({
        message: safeProviderMessage(
          parsed.success ? parsed.data.error.message : undefined,
        ),
        code,
        subcode: parsed.success
          ? String(parsed.data.error.error_subcode ?? "") || undefined
          : undefined,
        metaType: parsed.success ? parsed.data.error.type : undefined,
        traceId: parsed.success ? parsed.data.error.fbtrace_id : undefined,
        httpStatus: response.status,
        retryAfterSeconds,
        retryable:
          response.status >= 500 || ["4", "17", "32", "613"].includes(code ?? ""),
      });
    }

    return payload as T;
  }

  async exchangeAuthorizationCode(code: string) {
    const config = getMetaConfiguration();
    const initialQuery = new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.oauthRedirectUri,
      code,
    });
    const initial = await this.request<{ access_token: string; expires_in?: number }>(
      `oauth/access_token?${initialQuery}`,
      null,
    );

    const longLivedQuery = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: config.appId,
      client_secret: config.appSecret,
      fb_exchange_token: initial.access_token,
    });
    try {
      const extended = await this.request<{ access_token: string; expires_in?: number }>(
        `oauth/access_token?${longLivedQuery}`,
        null,
      );
      return {
        accessToken: extended.access_token,
        expiresAt: extended.expires_in
          ? new Date(Date.now() + extended.expires_in * 1_000)
          : undefined,
      };
    } catch (error) {
      if (!(error instanceof MetaApiError) || error.retryable) throw error;
      return {
        accessToken: initial.access_token,
        expiresAt: initial.expires_in
          ? new Date(Date.now() + initial.expires_in * 1_000)
          : undefined,
      };
    }
  }

  async inspectToken(accessToken: string) {
    const config = getMetaConfiguration();
    const query = new URLSearchParams({
      input_token: accessToken,
      access_token: `${config.appId}|${config.appSecret}`,
    });
    const result = await this.request<{
      data: {
        is_valid?: boolean;
        scopes?: string[];
        expires_at?: number;
        data_access_expires_at?: number;
      };
    }>(`debug_token?${query}`, null);

    return {
      valid: result.data.is_valid === true,
      scopes: result.data.scopes ?? [],
      expiresAt: dateFromSeconds(result.data.expires_at),
      dataAccessExpiresAt: dateFromSeconds(result.data.data_access_expires_at),
    };
  }

  getIdentity(accessToken: string) {
    return this.request<{ id: string; name?: string }>("me?fields=id,name", accessToken);
  }

  async revokeToken(accessToken: string, metaUserId: string) {
    await this.request(`${metaUserId}/permissions`, accessToken, { method: "DELETE" }, true);
  }

  async listBusinesses(accessToken: string): Promise<MetaBusinessAsset[]> {
    const result = await this.request<{
      data?: Array<{ id: string; name: string; verification_status?: string }>;
    }>("me/businesses?fields=id,name,verification_status&limit=100", accessToken);
    return (result.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      verificationStatus: item.verification_status,
    }));
  }

  async listAdAccounts(accessToken: string): Promise<MetaAdAccountAsset[]> {
    const result = await this.request<{
      data?: Array<{
        id: string;
        name: string;
        currency: string;
        timezone_name?: string;
        timezone_offset_hours_utc?: number;
        account_status?: string | number;
        disable_reason?: string | number;
      }>;
    }>(
      "me/adaccounts?fields=id,name,currency,timezone_name,timezone_offset_hours_utc,account_status,disable_reason&limit=100",
      accessToken,
    );
    return (result.data ?? []).map((item) => ({
      id: item.id.replace(/^act_/, ""),
      name: item.name,
      currency: item.currency,
      timezoneName: item.timezone_name,
      timezoneOffsetMinutes:
        typeof item.timezone_offset_hours_utc === "number"
          ? Math.round(item.timezone_offset_hours_utc * 60)
          : undefined,
      accountStatus:
        item.account_status === undefined ? undefined : String(item.account_status),
      disableReason:
        item.disable_reason === undefined ? undefined : String(item.disable_reason),
    }));
  }

  async listPages(accessToken: string): Promise<MetaPageAsset[]> {
    const result = await this.request<{
      data?: Array<{
        id: string;
        name: string;
        tasks?: string[];
        instagram_business_account?: { id: string; username?: string; name?: string };
      }>;
    }>(
      "me/accounts?fields=id,name,tasks,instagram_business_account{id,username,name}&limit=100",
      accessToken,
    );
    return (result.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      tasks: item.tasks ?? [],
      instagramAccount: item.instagram_business_account,
    }));
  }

  async listDatasets(
    accessToken: string,
    adAccountIds: string[],
  ): Promise<MetaDatasetAsset[]> {
    const results = await Promise.all(
      adAccountIds.map(async (adAccountId) => {
        const result = await this.request<{ data?: Array<{ id: string; name: string }> }>(
          `act_${adAccountId}/adspixels?fields=id,name&limit=100`,
          accessToken,
        );
        return (result.data ?? []).map((item) => ({ ...item, adAccountId }));
      }),
    );
    return results.flat();
  }

  async searchLocations(accessToken: string, query: string): Promise<MetaTargetResult[]> {
    const params = new URLSearchParams({
      type: "adgeolocation",
      location_types: JSON.stringify(["region", "city"]),
      q: query,
      limit: "10",
    });
    const result = await this.request<{
      data?: Array<{ key: string; name: string; country_code?: string }>;
    }>(`search?${params}`, accessToken);
    return (result.data ?? []).map((item) => ({
      id: item.key,
      name: item.name,
      countryCode: item.country_code,
    }));
  }

  async searchInterests(accessToken: string, query: string): Promise<MetaTargetResult[]> {
    const params = new URLSearchParams({ type: "adinterest", q: query, limit: "10" });
    const result = await this.request<{ data?: Array<{ id: string; name: string }> }>(
      `search?${params}`,
      accessToken,
    );
    return result.data ?? [];
  }

  async checkAssetAccess(accessToken: string, externalId: string) {
    const result = await this.request<{ id?: string }>(
      `${externalId}?fields=id`,
      accessToken,
    );
    return result.id === externalId || result.id === `act_${externalId}`;
  }

  async uploadImage(input: Parameters<MetaAdsGateway["uploadImage"]>[0]) {
    const body = new FormData();
    body.set(
      "filename",
      new Blob([ownedBytes(input.bytes)], { type: input.mimeType }),
      input.filename,
    );
    const result = await this.request<{
      images?: Record<string, { hash?: string; id?: string }>;
    }>(
      `act_${input.adAccountExternalId}/adimages`,
      input.accessToken,
      { method: "POST", body },
      true,
    );
    const image = Object.values(result.images ?? {})[0];
    if (!image?.hash) throw new MetaApiError({ message: "Meta did not return an image hash." });
    return { hash: image.hash, id: image.id };
  }

  async findObjectByMarker(input: Parameters<MetaAdsGateway["findObjectByMarker"]>[0]) {
    const result = await this.request<{ data?: Array<{ id: string; name?: string }> }>(
      `act_${input.adAccountExternalId}/${input.type}?fields=id,name&limit=100`,
      input.accessToken,
    );
    return result.data?.find((item) => item.name?.includes(input.marker))?.id ?? null;
  }

  async createCampaign(input: Parameters<MetaAdsGateway["createCampaign"]>[0]) {
    return this.createNamedObject(
      input.accessToken,
      `act_${input.adAccountExternalId}/campaigns`,
      {
        name: input.name,
        objective: input.objective,
        status: "PAUSED",
        special_ad_categories: JSON.stringify(input.specialAdCategories),
      },
    );
  }

  async createAdSet(input: Parameters<MetaAdsGateway["createAdSet"]>[0]) {
    const fields: Record<string, string> = {
      name: input.name,
      campaign_id: input.campaignExternalId,
      status: "PAUSED",
      targeting: JSON.stringify(input.targeting),
      optimization_goal: input.optimizationGoal,
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      [input.budgetType === "DAILY" ? "daily_budget" : "lifetime_budget"]:
        input.budgetMinorUnits,
    };
    if (input.startTime) fields.start_time = input.startTime;
    if (input.endTime) fields.end_time = input.endTime;
    if (input.promotedObject) fields.promoted_object = JSON.stringify(input.promotedObject);
    return this.createNamedObject(
      input.accessToken,
      `act_${input.adAccountExternalId}/adsets`,
      fields,
    );
  }

  async createCreative(input: Parameters<MetaAdsGateway["createCreative"]>[0]) {
    const objectStorySpec: Record<string, unknown> = {
      page_id: input.pageExternalId,
      link_data: {
        message: input.message,
        name: input.headline,
        description: input.description,
        link: input.destinationUrl,
        image_hash: input.imageHash,
        call_to_action: { type: input.callToAction },
      },
    };
    if (input.instagramExternalId) {
      objectStorySpec.instagram_actor_id = input.instagramExternalId;
    }
    return this.createNamedObject(
      input.accessToken,
      `act_${input.adAccountExternalId}/adcreatives`,
      { name: input.name, object_story_spec: JSON.stringify(objectStorySpec) },
    );
  }

  async createAd(input: Parameters<MetaAdsGateway["createAd"]>[0]) {
    return this.createNamedObject(
      input.accessToken,
      `act_${input.adAccountExternalId}/ads`,
      {
        name: input.name,
        adset_id: input.adSetExternalId,
        creative: JSON.stringify({ creative_id: input.creativeExternalId }),
        status: "PAUSED",
      },
    );
  }

  async getObjectStatus(input: Parameters<MetaAdsGateway["getObjectStatus"]>[0]) {
    const result = await this.request<{
      configured_status?: string;
      effective_status?: string;
      review_feedback?: unknown;
    }>(
      `${input.externalId}?fields=configured_status,effective_status,review_feedback`,
      input.accessToken,
    );
    return {
      configuredStatus: result.configured_status,
      effectiveStatus: result.effective_status,
      reviewFeedback: result.review_feedback,
    };
  }

  private async createNamedObject(
    accessToken: string,
    path: string,
    fields: Record<string, string>,
  ) {
    const body = new URLSearchParams(fields);
    const result = await this.request<{ id?: string }>(
      path,
      accessToken,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      },
      true,
    );
    if (!result.id) throw new MetaApiError({ message: "Meta did not return an object identifier." });
    return result.id;
  }
}

const gateway = new GraphMetaAdsGateway();

export function getMetaAdsGateway(): MetaAdsGateway {
  return gateway;
}
