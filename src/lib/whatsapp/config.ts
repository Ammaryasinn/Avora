import "server-only";

const supportedGraphVersions = new Set(["v26.0"]);

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WhatsApp integration.`);
  return value;
}

function integer(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function hasValidEncryptionKey() {
  const value = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim();
  return Boolean(value && Buffer.from(value, "base64").byteLength === 32);
}

function explicitBoolean(name: string) {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function callbackUrl() {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (!url.hostname || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
      return null;
    }
    return new URL("/api/webhooks/whatsapp", url.origin).toString();
  } catch {
    return null;
  }
}

export function getWhatsAppConfiguration() {
  const webhook = getWhatsAppWebhookConfiguration();
  const graphApiVersion = webhook.graphApiVersion;
  if (!supportedGraphVersions.has(graphApiVersion)) {
    throw new Error("WHATSAPP_GRAPH_API_VERSION is not in Avora's server allowlist.");
  }
  if (!hasValidEncryptionKey()) {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  const outboundEnabled = explicitBoolean("WHATSAPP_OUTBOUND_ENABLED");
  if (outboundEnabled === null) {
    throw new Error("WHATSAPP_OUTBOUND_ENABLED must be explicitly set to true or false.");
  }

  return {
    appId: required("WHATSAPP_META_APP_ID"),
    appSecret: webhook.appSecret,
    graphApiVersion,
    verifyToken: webhook.verifyToken,
    tokenKeyVersion: required("WHATSAPP_TOKEN_ENCRYPTION_KEY_VERSION"),
    inboundEnabled: webhook.inboundEnabled,
    outboundEnabled,
    rawRetentionDays: webhook.rawRetentionDays,
    maxAttempts: webhook.maxAttempts,
    leaseSeconds: webhook.leaseSeconds,
  };
}

export function getWhatsAppWebhookConfiguration() {
  const graphApiVersion = required("WHATSAPP_GRAPH_API_VERSION");
  if (!supportedGraphVersions.has(graphApiVersion)) {
    throw new Error("WHATSAPP_GRAPH_API_VERSION is not in Avora's server allowlist.");
  }
  return {
    appSecret: required("WHATSAPP_META_APP_SECRET"),
    graphApiVersion,
    verifyToken: required("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    inboundEnabled: process.env.WHATSAPP_INBOUND_ENABLED === "true",
    rawRetentionDays: integer("WHATSAPP_RAW_EVENT_RETENTION_DAYS", 7, 1, 30),
    maxAttempts: integer("WHATSAPP_WEBHOOK_MAX_ATTEMPTS", 8, 1, 20),
    leaseSeconds: integer("WHATSAPP_WEBHOOK_LEASE_SECONDS", 60, 15, 300),
  };
}

export function getWhatsAppAvailability() {
  const requiredNames = [
    "APP_URL",
    "WHATSAPP_META_APP_ID",
    "WHATSAPP_META_APP_SECRET",
    "WHATSAPP_GRAPH_API_VERSION",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "WHATSAPP_TOKEN_ENCRYPTION_KEY",
    "WHATSAPP_TOKEN_ENCRYPTION_KEY_VERSION",
    "WHATSAPP_WEBHOOK_WORKER_SECRET",
    "WHATSAPP_INBOUND_ENABLED",
    "WHATSAPP_OUTBOUND_ENABLED",
  ];
  const missing = requiredNames.filter((name) => !process.env[name]?.trim());
  if (
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim() &&
    !hasValidEncryptionKey()
  ) {
    missing.push("WHATSAPP_TOKEN_ENCRYPTION_KEY (invalid format)");
  }
  if (!callbackUrl() && process.env.APP_URL?.trim()) {
    missing.push("APP_URL (invalid callback origin)");
  }
  if (process.env.WHATSAPP_INBOUND_ENABLED?.trim().toLowerCase() !== "true") {
    missing.push("WHATSAPP_INBOUND_ENABLED must be true");
  }
  const outboundEnabled = explicitBoolean("WHATSAPP_OUTBOUND_ENABLED");
  if (process.env.WHATSAPP_OUTBOUND_ENABLED?.trim() && outboundEnabled === null) {
    missing.push("WHATSAPP_OUTBOUND_ENABLED must be true or false");
  }

  return {
    configured: missing.length === 0,
    inboundEnabled: process.env.WHATSAPP_INBOUND_ENABLED === "true",
    outboundEnabled: outboundEnabled ?? false,
    missing,
  };
}

export function getWhatsAppCallbackUrl() {
  return callbackUrl();
}

export function isWhatsAppOutboundEnabled() {
  return explicitBoolean("WHATSAPP_OUTBOUND_ENABLED") === true;
}
