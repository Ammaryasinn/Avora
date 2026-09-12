import "server-only";

import { getDatabase } from "@/lib/db/database";

export interface WhatsAppWebhookDispatcher {
  enqueue(deliveryId: string, organizationId: string): Promise<void>;
}

class PostgresWhatsAppWebhookDispatcher implements WhatsAppWebhookDispatcher {
  async enqueue(deliveryId: string, organizationId: string) {
    await getDatabase().whatsAppWebhookEvent.updateMany({
      where: {
        deliveryId,
        organizationId,
        status: "RECEIVED",
      },
      data: { availableAt: new Date() },
    });
  }
}

const dispatcher = new PostgresWhatsAppWebhookDispatcher();

export function getWhatsAppWebhookDispatcher(): WhatsAppWebhookDispatcher {
  return dispatcher;
}
