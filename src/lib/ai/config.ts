import "server-only";

import { AICapability } from "@/generated/prisma/enums";

const openAITextModels = ["gpt-5.4-mini"] as const;
const openAIImageModels = [
  "gpt-image-2.5-flare",
  "gpt-image-2.5-sunburst",
] as const;
const openAIModerationModels = ["omni-moderation-latest"] as const;
const falVirtualTryOnModels = [
  "fal-ai/image-apps-v2/virtual-try-on",
] as const;

function allowlistedValue<const T extends readonly string[]>(
  environmentName: string,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = process.env[environmentName]?.trim() || fallback;

  if (!allowed.includes(value as T[number])) {
    throw new Error(`${environmentName} is not an allowlisted Avora model.`);
  }

  return value as T[number];
}

function positiveNumber(name: string, fallback: number) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

function enabled(name: string, fallback = true) {
  const value = process.env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return value !== "false" && value !== "0";
}

export function getAIConfiguration() {
  return {
    openAI: {
      textModel: allowlistedValue(
        "OPENAI_TEXT_MODEL",
        openAITextModels,
        "gpt-5.4-mini",
      ),
      imageModel: allowlistedValue(
        "OPENAI_IMAGE_MODEL",
        openAIImageModels,
        "gpt-image-2.5-flare",
      ),
      moderationModel: allowlistedValue(
        "OPENAI_MODERATION_MODEL",
        openAIModerationModels,
        "omni-moderation-latest",
      ),
    },
    fal: {
      virtualTryOnModel: allowlistedValue(
        "FAL_VIRTUAL_TRY_ON_MODEL",
        falVirtualTryOnModels,
        "fal-ai/image-apps-v2/virtual-try-on",
      ),
    },
    defaults: {
      monthlyBudgetUsd: positiveNumber("AI_DEFAULT_MONTHLY_BUDGET_USD", 10),
      perJobLimitUsd: positiveNumber("AI_DEFAULT_PER_JOB_LIMIT_USD", 2),
      maxConcurrentJobs: positiveNumber("AI_DEFAULT_MAX_CONCURRENT_JOBS", 2),
      maxRequestsPerMinute: positiveNumber("AI_DEFAULT_REQUESTS_PER_MINUTE", 10),
      personRetentionDays: positiveNumber("AI_PERSON_REFERENCE_RETENTION_DAYS", 7),
    },
    capabilities: {
      text: enabled("AI_TEXT_ENABLED"),
      image: enabled("AI_IMAGE_ENABLED"),
      imageEdit: enabled("AI_IMAGE_EDIT_ENABLED"),
      virtualTryOn: enabled("AI_VIRTUAL_TRY_ON_ENABLED"),
      video: false,
    },
  };
}

export function estimatedJobCostUsd(
  capability: AICapability,
  variantCount: number,
) {
  const unitCosts: Record<AICapability, number> = {
    GENERATE_TEXT: 0.03,
    GENERATE_IMAGE: 0.12,
    EDIT_IMAGE: 0.12,
    GENERATE_VIRTUAL_TRY_ON: 0.2,
    GENERATE_VIDEO: Number.POSITIVE_INFINITY,
  };

  return unitCosts[capability] * Math.max(1, variantCount);
}

export function assertCapabilityEnabled(capability: AICapability) {
  const flags = getAIConfiguration().capabilities;
  const enabledForCapability: Record<AICapability, boolean> = {
    GENERATE_TEXT: flags.text,
    GENERATE_IMAGE: flags.image,
    EDIT_IMAGE: flags.imageEdit,
    GENERATE_VIRTUAL_TRY_ON: flags.virtualTryOn,
    GENERATE_VIDEO: false,
  };

  if (!enabledForCapability[capability]) {
    throw new Error("This AI capability is currently unavailable.");
  }
}
