export const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1_000;

function validDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveLatestInboundAt(messages) {
  let latest = null;
  for (const message of messages) {
    const timestamp = validDate(
      message.providerTimestamp ?? message.receivedAt ?? message.createdAt,
    );
    if (timestamp && (!latest || timestamp > latest)) latest = timestamp;
  }
  return latest;
}

export function getWhatsAppCustomerServiceWindow(latestInboundAt, now = new Date()) {
  const inboundAt = validDate(latestInboundAt);
  const evaluatedAt = validDate(now) ?? new Date();
  const closesAt = inboundAt
    ? new Date(inboundAt.getTime() + WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS)
    : null;

  return {
    latestInboundAt: inboundAt,
    closesAt,
    isOpen: Boolean(closesAt && evaluatedAt < closesAt),
  };
}

export function evaluateWhatsAppOutboundEligibility(input) {
  const window = getWhatsAppCustomerServiceWindow(input.latestInboundAt, input.now);
  const blocked = (reason, message) => ({ canSend: false, reason, message, window });

  if (!input.featureEnabled) {
    return blocked("FEATURE_DISABLED", "Outbound WhatsApp sending is disabled.");
  }
  if (input.role !== "OWNER" && input.role !== "ADMIN") {
    return blocked("ROLE_NOT_ALLOWED", "Only owners and admins can send WhatsApp messages.");
  }
  if (input.conversationArchived) {
    return blocked("CONVERSATION_ARCHIVED", "Archived conversations cannot send messages.");
  }
  if (input.connectionStatus !== "CONNECTED" || input.connectionDisconnected) {
    return blocked("CONNECTION_INACTIVE", "The WhatsApp connection is not active.");
  }
  if (!input.hasUsableToken) {
    return blocked("CONNECTION_CREDENTIALS_MISSING", "The WhatsApp connection must be reconnected.");
  }
  if (input.contactStatus === "BLOCKED") {
    return blocked("CONTACT_BLOCKED", "This contact is blocked.");
  }
  if (input.contactStatus === "ARCHIVED") {
    return blocked("CONTACT_ARCHIVED", "Archived contacts cannot receive messages.");
  }
  if (input.consentStatus === "OPTED_OUT") {
    return blocked("CONTACT_OPTED_OUT", "This contact has opted out of WhatsApp follow-up.");
  }
  if (!window.isOpen) {
    return blocked(
      "CUSTOMER_SERVICE_WINDOW_CLOSED",
      "Customer service window closed. A template message is required.",
    );
  }

  return {
    canSend: true,
    reason: null,
    message: "Free-form reply available.",
    window,
  };
}
