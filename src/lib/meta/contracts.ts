export type MetaIdentity = { id: string; name?: string };

export type MetaBusinessAsset = {
  id: string;
  name: string;
  verificationStatus?: string;
};

export type MetaAdAccountAsset = {
  id: string;
  name: string;
  currency: string;
  timezoneName?: string;
  timezoneOffsetMinutes?: number;
  accountStatus?: string;
  disableReason?: string;
};

export type MetaPageAsset = {
  id: string;
  name: string;
  tasks: string[];
  instagramAccount?: { id: string; username?: string; name?: string };
};

export type MetaDatasetAsset = { id: string; name: string; adAccountId: string };
export type MetaTargetResult = { id: string; name: string; countryCode?: string };

export interface MetaAdsGateway {
  exchangeAuthorizationCode(code: string): Promise<{
    accessToken: string;
    expiresAt?: Date;
  }>;
  inspectToken(accessToken: string): Promise<{
    valid: boolean;
    scopes: string[];
    expiresAt?: Date;
    dataAccessExpiresAt?: Date;
  }>;
  getIdentity(accessToken: string): Promise<MetaIdentity>;
  revokeToken(accessToken: string, metaUserId: string): Promise<void>;
  listBusinesses(accessToken: string): Promise<MetaBusinessAsset[]>;
  listAdAccounts(accessToken: string): Promise<MetaAdAccountAsset[]>;
  listPages(accessToken: string): Promise<MetaPageAsset[]>;
  listDatasets(accessToken: string, adAccountIds: string[]): Promise<MetaDatasetAsset[]>;
  searchLocations(accessToken: string, query: string): Promise<MetaTargetResult[]>;
  searchInterests(accessToken: string, query: string): Promise<MetaTargetResult[]>;
  checkAssetAccess(accessToken: string, externalId: string): Promise<boolean>;
  uploadImage(input: {
    accessToken: string;
    adAccountExternalId: string;
    bytes: Uint8Array;
    filename: string;
    mimeType: string;
  }): Promise<{ hash: string; id?: string }>;
  findObjectByMarker(input: {
    accessToken: string;
    adAccountExternalId: string;
    type: "campaigns" | "adsets" | "adcreatives" | "ads";
    marker: string;
  }): Promise<string | null>;
  createCampaign(input: {
    accessToken: string;
    adAccountExternalId: string;
    name: string;
    objective: string;
    specialAdCategories: string[];
  }): Promise<string>;
  createAdSet(input: {
    accessToken: string;
    adAccountExternalId: string;
    name: string;
    campaignExternalId: string;
    budgetType: "DAILY" | "LIFETIME";
    budgetMinorUnits: string;
    startTime?: string;
    endTime?: string;
    targeting: Record<string, unknown>;
    optimizationGoal: string;
    promotedObject?: Record<string, unknown>;
  }): Promise<string>;
  createCreative(input: {
    accessToken: string;
    adAccountExternalId: string;
    name: string;
    pageExternalId: string;
    instagramExternalId?: string;
    imageHash: string;
    message: string;
    headline?: string;
    description?: string;
    destinationUrl: string;
    callToAction: string;
  }): Promise<string>;
  createAd(input: {
    accessToken: string;
    adAccountExternalId: string;
    name: string;
    adSetExternalId: string;
    creativeExternalId: string;
  }): Promise<string>;
  getObjectStatus(input: {
    accessToken: string;
    externalId: string;
  }): Promise<{ configuredStatus?: string; effectiveStatus?: string; reviewFeedback?: unknown }>;
}
