import "server-only";

const supportedGraphVersions = new Set(["v26.0"]);

export const META_OAUTH_SCOPES = [
  "public_profile",
  "ads_management",
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
] as const;

export const META_OPTIONAL_OAUTH_SCOPES = [
  "pages_manage_ads",
  "instagram_basic",
  "pages_read_user_content",
] as const;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Meta integration.`);
  return value;
}

function hasValidTokenEncryptionKey() {
  const value = process.env.META_TOKEN_ENCRYPTION_KEY?.trim();
  return Boolean(value && Buffer.from(value, "base64").byteLength === 32);
}

export function getMetaConfiguration() {
  const graphApiVersion = required("META_GRAPH_API_VERSION");
  if (!supportedGraphVersions.has(graphApiVersion)) {
    throw new Error("META_GRAPH_API_VERSION is not in Avora's server allowlist.");
  }
  if (!hasValidTokenEncryptionKey()) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }

  return {
    appId: required("META_APP_ID"),
    appSecret: required("META_APP_SECRET"),
    oauthRedirectUri: required("META_OAUTH_REDIRECT_URI"),
    graphApiVersion,
    oauthStateSecret: required("META_OAUTH_STATE_SECRET"),
    tokenKeyVersion: required("META_TOKEN_ENCRYPTION_KEY_VERSION"),
    publishingEnabled: process.env.META_PUBLISHING_ENABLED === "true",
    maxPublishConcurrency: Math.max(
      1,
      Number.parseInt(process.env.META_MAX_PUBLISH_CONCURRENCY ?? "1", 10) || 1,
    ),
  };
}

export function getMetaAvailability() {
  const requiredNames = [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_OAUTH_REDIRECT_URI",
    "META_GRAPH_API_VERSION",
    "META_TOKEN_ENCRYPTION_KEY",
    "META_TOKEN_ENCRYPTION_KEY_VERSION",
    "META_OAUTH_STATE_SECRET",
  ];
  const missing = requiredNames.filter((name) => !process.env[name]?.trim());
  if (
    process.env.META_TOKEN_ENCRYPTION_KEY?.trim() &&
    !hasValidTokenEncryptionKey()
  ) {
    missing.push("META_TOKEN_ENCRYPTION_KEY (invalid format)");
  }

  return {
    configured: missing.length === 0,
    publishingEnabled: process.env.META_PUBLISHING_ENABLED === "true",
    missing,
  };
}
