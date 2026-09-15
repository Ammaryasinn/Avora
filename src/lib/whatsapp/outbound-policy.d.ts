export const WHATSAPP_CUSTOMER_SERVICE_WINDOW_MS: number;

export type InboundTimestampSource = {
  providerTimestamp: Date | string | null;
  receivedAt: Date | string | null;
  createdAt: Date | string;
};

export type WhatsAppCustomerServiceWindow = {
  latestInboundAt: Date | null;
  closesAt: Date | null;
  isOpen: boolean;
};

export type WhatsAppOutboundBlockReason =
  | "FEATURE_DISABLED"
  | "ROLE_NOT_ALLOWED"
  | "CONVERSATION_ARCHIVED"
  | "CONNECTION_INACTIVE"
  | "CONNECTION_CREDENTIALS_MISSING"
  | "CONTACT_BLOCKED"
  | "CONTACT_ARCHIVED"
  | "CONTACT_OPTED_OUT"
  | "CUSTOMER_SERVICE_WINDOW_CLOSED";

export function resolveLatestInboundAt(messages: InboundTimestampSource[]): Date | null;

export function getWhatsAppCustomerServiceWindow(
  latestInboundAt: Date | string | null,
  now?: Date | string,
): WhatsAppCustomerServiceWindow;

export function evaluateWhatsAppOutboundEligibility(input: {
  featureEnabled: boolean;
  role: string;
  conversationArchived: boolean;
  connectionStatus: string;
  connectionDisconnected: boolean;
  hasUsableToken: boolean;
  contactStatus: string;
  consentStatus: string;
  latestInboundAt: Date | string | null;
  now?: Date | string;
}): {
  canSend: boolean;
  reason: WhatsAppOutboundBlockReason | null;
  message: string;
  window: WhatsAppCustomerServiceWindow;
};
