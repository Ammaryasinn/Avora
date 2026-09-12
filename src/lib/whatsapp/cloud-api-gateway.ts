import "server-only";

import { getWhatsAppConfiguration } from "./config";

type GraphErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class WhatsAppCloudApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "WhatsAppCloudApiError";
  }
}

async function graphRequest<T>(path: string, accessToken: string, init?: RequestInit) {
  const { graphApiVersion } = getWhatsAppConfiguration();
  const response = await fetch(`https://graph.facebook.com/${graphApiVersion}/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  const payload = await response.json() as T & GraphErrorPayload;
  if (!response.ok) {
    throw new WhatsAppCloudApiError(
      payload.error?.message ?? "WhatsApp Cloud API request failed.",
      response.status,
      payload.error?.code,
    );
  }
  return payload;
}

export interface WhatsAppCloudApiGateway {
  inspectPhoneNumber(phoneNumberId: string, accessToken: string): Promise<{
    id: string;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
  }>;
  verifyPhoneNumberOwnership(
    wabaId: string,
    phoneNumberId: string,
    accessToken: string,
  ): Promise<void>;
  subscribeWaba(wabaId: string, accessToken: string): Promise<void>;
}

class MetaWhatsAppCloudApiGateway implements WhatsAppCloudApiGateway {
  async inspectPhoneNumber(phoneNumberId: string, accessToken: string) {
    const value = await graphRequest<{
      id: string;
      display_phone_number?: string;
      verified_name?: string;
    }>(`${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name`, accessToken);
    return {
      id: value.id,
      displayPhoneNumber: value.display_phone_number ?? null,
      verifiedName: value.verified_name ?? null,
    };
  }

  async verifyPhoneNumberOwnership(
    wabaId: string,
    phoneNumberId: string,
    accessToken: string,
  ) {
    const value = await graphRequest<{ data?: { id: string }[] }>(
      `${encodeURIComponent(wabaId)}/phone_numbers?fields=id&limit=100`,
      accessToken,
    );
    if (!value.data?.some((phone) => phone.id === phoneNumberId)) {
      throw new WhatsAppCloudApiError(
        "The supplied phone number does not belong to the supplied WhatsApp Business Account.",
        400,
      );
    }
  }

  async subscribeWaba(wabaId: string, accessToken: string) {
    await graphRequest<{ success: boolean }>(
      `${encodeURIComponent(wabaId)}/subscribed_apps`,
      accessToken,
      { method: "POST", body: "{}" },
    );
  }
}

const gateway = new MetaWhatsAppCloudApiGateway();

export function getWhatsAppCloudApiGateway(): WhatsAppCloudApiGateway {
  return gateway;
}
