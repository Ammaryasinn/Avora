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

export function getWhatsAppConfiguration() {
  const webhook = getWhatsAppWebhookConfiguration();
  const graphApiVersion = webhook.graphApiVersion;
  if (!supportedGraphVersions.has(graphApiVersion)) {
    throw new Error("WHATSAPP_GRAPH_API_VERSION is not in Avora's server allowlist.");
  }
  if (!hasValidEncryptionKey()) {
    throw new Error("WHATSAPP_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  if (process.env.WHATSAPP_OUTBOUND_ENABLED === "true") {
    throw new Error("Outbound WhatsApp delivery is unavailable in Milestone 3A.");
  }

  return {
    appId: required("WHATSAPP_META_APP_ID"),
    appSecret: webhook.appSecret,
    graphApiVersion,
    verifyToken: webhook.verifyToken,
    tokenKeyVersion: required("WHATSAPP_TOKEN_ENCRYPTION_KEY_VERSION"),
    inboundEnabled: webhook.inboundEnabled,
    outboundEnabled: false as const,
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
    "WHATSAPP_META_APP_ID",
    "WHATSAPP_META_APP_SECRET",
    "WHATSAPP_GRAPH_API_VERSION",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "WHATSAPP_TOKEN_ENCRYPTION_KEY",
    "WHATSAPP_TOKEN_ENCRYPTION_KEY_VERSION",
    "WHATSAPP_WEBHOOK_WORKER_SECRET",
  ];
  const missing = requiredNames.filter((name) => !process.env[name]?.trim());
  if (
    process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY?.trim() &&
    !hasValidEncryptionKey()
  ) {
    missing.push("WHATSAPP_TOKEN_ENCRYPTION_KEY (invalid format)");
  }
  if (process.env.WHATSAPP_OUTBOUND_ENABLED === "true") {
    missing.push("WHATSAPP_OUTBOUND_ENABLED must remain false");
  }

  return {
    configured: missing.length === 0,
    inboundEnabled: process.env.WHATSAPP_INBOUND_ENABLED === "true",
    outboundEnabled: false as const,
    missing,
  };
}

export function assertWhatsAppOutboundDisabled() {
  if (process.env.WHATSAPP_OUTBOUND_ENABLED === "true") {
    throw new Error("Outbound WhatsApp delivery is unavailable in Milestone 3A.");
  }
}
