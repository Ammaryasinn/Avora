import "server-only";

import { OrganizationRole } from "@/generated/prisma/enums";
import { getDatabase } from "@/lib/db/database";
import {
  selectRelevantWhatsAppProducts,
  whatsappProductKeywords,
} from "@/lib/whatsapp/ai-product-retrieval.mjs";

type WhatsAppProductCandidate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: string;
  status: string;
  archivedAt: Date | null;
  variants: Array<{
    name: string;
    size: string | null;
    color: string | null;
    price: string | null;
    inventory: { quantityOnHand: number; quantityReserved: number } | null;
  }>;
};

type RelevantWhatsAppProduct = WhatsAppProductCandidate & {
  availability: "IN_STOCK" | "OUT_OF_STOCK" | "UNKNOWN";
  linkedToLeadOrCampaign: boolean;
};

export class WhatsAppAIReplyPolicyError extends Error {}

export async function getLatestWhatsAppInboundMessage(
  organizationId: string,
  conversationId: string,
) {
  const database = getDatabase();
  const select = {
    id: true,
    textBody: true,
    providerTimestamp: true,
    receivedAt: true,
    createdAt: true,
  } as const;
  const [providerTimestamp, receivedAt, createdAt] = await Promise.all([
    database.message.findFirst({
      where: { organizationId, conversationId, direction: "INBOUND", providerTimestamp: { not: null } },
      orderBy: { providerTimestamp: "desc" },
      select,
    }),
    database.message.findFirst({
      where: { organizationId, conversationId, direction: "INBOUND", providerTimestamp: null, receivedAt: { not: null } },
      orderBy: { receivedAt: "desc" },
      select,
    }),
    database.message.findFirst({
      where: { organizationId, conversationId, direction: "INBOUND", providerTimestamp: null, receivedAt: null },
      orderBy: { createdAt: "desc" },
      select,
    }),
  ]);
  return [providerTimestamp, receivedAt, createdAt]
    .filter((message): message is NonNullable<typeof message> => message !== null)
    .sort((left, right) => {
      const leftAt = left.providerTimestamp ?? left.receivedAt ?? left.createdAt;
      const rightAt = right.providerTimestamp ?? right.receivedAt ?? right.createdAt;
      return rightAt.getTime() - leftAt.getTime();
    })[0] ?? null;
}

function productFacts(product: RelevantWhatsAppProduct, currencyCode: string) {
  return {
    name: product.name,
    description: product.description?.slice(0, 600) ?? null,
    category: product.category,
    price: `${currencyCode} ${product.price}`,
    availability: product.availability,
    variants: product.variants.slice(0, 8).map((variant) => ({
      name: variant.name,
      size: variant.size,
      color: variant.color,
      price: variant.price ? `${currencyCode} ${variant.price}` : null,
      availability: variant.inventory
        ? variant.inventory.quantityOnHand - variant.inventory.quantityReserved > 0
          ? "IN_STOCK"
          : "OUT_OF_STOCK"
        : "UNKNOWN",
    })),
  };
}

export async function buildWhatsAppAIReplyContext(input: {
  organizationId: string;
  conversationId: string;
  requestingUserId: string;
  sourceMessageId: string;
}) {
  const database = getDatabase();
  const conversation = await database.conversation.findFirst({
    where: {
      id: input.conversationId,
      organizationId: input.organizationId,
      archivedAt: null,
      contact: { organizationId: input.organizationId },
      connection: { organizationId: input.organizationId },
    },
    select: {
      id: true,
      organizationId: true,
      connectionId: true,
      status: true,
      currentAssignedOrganizationMemberId: true,
      connection: { select: { status: true, disconnectedAt: true } },
      contact: { select: { id: true, status: true, displayName: true, locale: true } },
      organization: {
        select: {
          name: true,
          businessProfile: { select: { displayName: true, industry: true, currencyCode: true } },
        },
      },
      lead: {
        select: {
          id: true,
          status: true,
          source: true,
          productId: true,
          qualification: {
            select: {
              stage: true,
              need: true,
              budget: true,
              timeline: true,
              decisionMaker: true,
              score: true,
              notes: true,
            },
          },
          followUpState: { select: { consentStatus: true } },
          campaign: {
            select: {
              name: true,
              objective: true,
              products: { select: { productId: true }, orderBy: { position: "asc" }, take: 5 },
            },
          },
          campaignCreative: {
            select: {
              label: true,
              creative: { select: { title: true, productId: true } },
            },
          },
        },
      },
      messages: {
        where: {
          contentType: "TEXT",
          textBody: { not: null },
          OR: [
            { direction: "INBOUND" },
            { direction: "OUTBOUND", currentStatus: { in: ["SENT", "DELIVERED", "READ"] } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 16,
        select: {
          id: true,
          direction: true,
          authorType: true,
          textBody: true,
          providerTimestamp: true,
          createdAt: true,
        },
      },
    },
  });
  if (!conversation) throw new WhatsAppAIReplyPolicyError("The conversation is unavailable.");

  const membership = await database.organizationMember.findFirst({
    where: { organizationId: input.organizationId, userId: input.requestingUserId },
    select: { id: true, role: true },
  });
  if (!membership || (membership.role !== OrganizationRole.OWNER && membership.role !== OrganizationRole.ADMIN)) {
    throw new WhatsAppAIReplyPolicyError("Only owners and admins can generate AI reply drafts.");
  }
  if (
    conversation.status === "HANDOFF" &&
    conversation.currentAssignedOrganizationMemberId &&
    conversation.currentAssignedOrganizationMemberId !== membership.id
  ) {
    throw new WhatsAppAIReplyPolicyError("The assigned team member should handle this conversation.");
  }
  if (conversation.contact.status === "BLOCKED" || conversation.contact.status === "ARCHIVED") {
    throw new WhatsAppAIReplyPolicyError("AI replies are unavailable for this contact.");
  }
  if (conversation.lead?.followUpState?.consentStatus === "OPTED_OUT") {
    throw new WhatsAppAIReplyPolicyError("This contact has opted out of WhatsApp follow-up.");
  }
  if (conversation.connection.status !== "CONNECTED" || conversation.connection.disconnectedAt) {
    throw new WhatsAppAIReplyPolicyError("The WhatsApp connection is unavailable.");
  }

  const latestInbound = await getLatestWhatsAppInboundMessage(input.organizationId, input.conversationId);
  const sourceMessage = latestInbound?.id === input.sourceMessageId ? latestInbound : null;
  if (!sourceMessage?.textBody) {
    throw new WhatsAppAIReplyPolicyError("A current inbound customer message is required.");
  }

  const priorityProductIds = [
    conversation.lead?.productId,
    conversation.lead?.campaignCreative?.creative?.productId,
    ...(conversation.lead?.campaign?.products.map((product) => product.productId) ?? []),
  ].filter((productId): productId is string => Boolean(productId));
  const keywords = whatsappProductKeywords(sourceMessage.textBody);
  const productWhere = {
    organizationId: input.organizationId,
    status: "ACTIVE" as const,
    archivedAt: null,
  };
  const [priorityProducts, matchedProducts] = await Promise.all([
    priorityProductIds.length
      ? database.product.findMany({
          where: { ...productWhere, id: { in: priorityProductIds } },
          take: 5,
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            price: true,
            status: true,
            archivedAt: true,
            variants: {
              orderBy: { position: "asc" },
              select: { name: true, size: true, color: true, price: true, inventory: true },
            },
          },
        })
      : Promise.resolve([]),
    keywords.length
      ? database.product.findMany({
          where: {
            ...productWhere,
            OR: keywords.flatMap((keyword) => [
              { name: { contains: keyword, mode: "insensitive" as const } },
              { category: { contains: keyword, mode: "insensitive" as const } },
              { description: { contains: keyword, mode: "insensitive" as const } },
              { variants: { some: { OR: [
                { name: { contains: keyword, mode: "insensitive" as const } },
                { size: { equals: keyword, mode: "insensitive" as const } },
                { color: { contains: keyword, mode: "insensitive" as const } },
              ] } } },
            ]),
          },
          take: 12,
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            price: true,
            status: true,
            archivedAt: true,
            variants: {
              orderBy: { position: "asc" },
              select: { name: true, size: true, color: true, price: true, inventory: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const productsById = new Map(
    [...priorityProducts, ...matchedProducts].map((product) => [
      product.id,
      {
        ...product,
        price: product.price.toFixed(2),
        variants: product.variants.map((variant) => ({
          ...variant,
          price: variant.price?.toFixed(2) ?? null,
        })),
      },
    ]),
  );
  const products = selectRelevantWhatsAppProducts(
    [...productsById.values()] as WhatsAppProductCandidate[],
    { customerQuestion: sourceMessage.textBody, priorityProductIds, limit: 4 },
  ) as RelevantWhatsAppProduct[];
  const currencyCode = conversation.organization.businessProfile?.currencyCode ?? "KES";
  const historyMessages = conversation.messages.some((message) => message.id === sourceMessage.id)
    ? conversation.messages
    : [...conversation.messages, {
        id: sourceMessage.id,
        direction: "INBOUND" as const,
        authorType: "CONTACT" as const,
        textBody: sourceMessage.textBody,
        providerTimestamp: sourceMessage.providerTimestamp,
        createdAt: sourceMessage.createdAt,
      }];
  const history = [...historyMessages]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .slice(-16)
    .map((message) => ({
      speaker: message.direction === "INBOUND" ? "CUSTOMER" : message.authorType === "AI" ? "AI_DRAFT" : "BUSINESS",
      text: message.textBody!.slice(0, 1_200),
      timestamp: (message.providerTimestamp ?? message.createdAt).toISOString(),
    }));

  return {
    conversationId: conversation.id,
    connectionId: conversation.connectionId,
    contactId: conversation.contact.id,
    leadId: conversation.lead?.id ?? null,
    sourceMessageId: sourceMessage.id,
    productIds: products.map((product) => product.id),
    promptContext: {
      business: {
        name: conversation.organization.businessProfile?.displayName ?? conversation.organization.name,
        industry: conversation.organization.businessProfile?.industry ?? null,
        currencyCode,
      },
      contact: {
        displayName: conversation.contact.displayName,
        locale: conversation.contact.locale,
      },
      conversation: {
        status: conversation.status,
        recentMessages: history,
        latestCustomerQuestion: sourceMessage.textBody,
      },
      lead: conversation.lead ? {
        status: conversation.lead.status,
        source: conversation.lead.source,
        qualification: conversation.lead.qualification ? {
          ...conversation.lead.qualification,
          notes: conversation.lead.qualification.notes?.slice(0, 1_000) ?? null,
        } : null,
        attribution: {
          campaignName: conversation.lead.campaign?.name ?? null,
          campaignObjective: conversation.lead.campaign?.objective ?? null,
          creativeLabel: conversation.lead.campaignCreative?.label ?? null,
          creativeTitle: conversation.lead.campaignCreative?.creative?.title ?? null,
        },
      } : null,
      products: products.map((product) => productFacts(product, currencyCode)),
    },
  };
}

export function createWhatsAppSalesReplyPrompt(
  context: Awaited<ReturnType<typeof buildWhatsAppAIReplyContext>>["promptContext"],
) {
  return [
    "Draft one concise, conversational WhatsApp sales reply for a human to review.",
    "Answer the customer's actual latest question using only the supplied facts.",
    "Mention price, sizes, colors, stock, attribution, or qualification details only when explicitly present.",
    "Never invent catalogue facts, inventory, discounts, delivery terms, property details, payments, orders, or completion states.",
    "Never recommend an OUT_OF_STOCK product. UNKNOWN availability is not confirmation of stock.",
    "If facts are missing, say so briefly or ask one useful qualification question.",
    "Guide toward purchase without pressure. Suggest human handoff when context is weak or confidence is low.",
    "Do not mention AI, prompts, systems, internal IDs, metadata, or unavailable internal processes.",
    "Qualification suggestions must use only facts the customer explicitly stated; use null for unsupported fields.",
    `Normalized context:\n${JSON.stringify(context)}`,
  ].join("\n\n");
}
