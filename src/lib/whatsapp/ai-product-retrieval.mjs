const ignoredTerms = new Set([
  "about", "are", "available", "can", "could", "does", "have", "hello", "how",
  "into", "is", "much", "please", "price", "size", "that", "the", "this", "want", "what",
  "when", "where", "which", "with", "would", "you", "your",
]);

export function whatsappProductKeywords(value) {
  return [...new Set(
    value
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((term) => term.length >= 2 && !ignoredTerms.has(term)) ?? [],
  )].slice(0, 8);
}

function availabilityFor(product) {
  if (!product.variants.length) return "UNKNOWN";
  const tracked = product.variants.filter((variant) => variant.inventory !== null);
  if (tracked.some((variant) => variant.inventory.quantityOnHand - variant.inventory.quantityReserved > 0)) {
    return "IN_STOCK";
  }
  return tracked.length === product.variants.length ? "OUT_OF_STOCK" : "UNKNOWN";
}

function searchText(product) {
  return [
    product.name,
    product.category,
    product.description,
    ...product.variants.flatMap((variant) => [variant.name, variant.size, variant.color]),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function selectRelevantWhatsAppProducts(products, input) {
  const priorityIds = new Set(input.priorityProductIds);
  const keywords = whatsappProductKeywords(input.customerQuestion);
  return products
    .filter((product) => product.status === "ACTIVE" && !product.archivedAt)
    .map((product) => {
      const availability = availabilityFor(product);
      const text = searchText(product);
      const priority = priorityIds.has(product.id);
      const matches = keywords.filter((keyword) => text.includes(keyword)).length;
      return {
        product,
        priority,
        availability,
        score: (priority ? 100 : 0) + matches * 10 + (text.includes(input.customerQuestion.toLowerCase()) ? 5 : 0),
      };
    })
    .filter((candidate) => candidate.priority || candidate.score > 0)
    .filter((candidate) => candidate.priority || candidate.availability !== "OUT_OF_STOCK")
    .sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name))
    .slice(0, input.limit ?? 4)
    .map(({ product, availability, priority }) => ({
      ...product,
      availability,
      linkedToLeadOrCampaign: priority,
    }));
}
