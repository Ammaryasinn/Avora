export type WhatsAppProductCandidate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  status: string;
  archivedAt: Date | string | null;
  variants: Array<{
    name: string;
    size: string | null;
    color: string | null;
    price: string | null;
    inventory: { quantityOnHand: number; quantityReserved: number } | null;
  }>;
};

export type RelevantWhatsAppProduct = WhatsAppProductCandidate & {
  availability: "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
  linkedToLeadOrCampaign: boolean;
};

export function whatsappProductKeywords(value: string): string[];

export function selectRelevantWhatsAppProducts(
  products: WhatsAppProductCandidate[],
  input: { customerQuestion: string; priorityProductIds: string[]; limit?: number },
): RelevantWhatsAppProduct[];
