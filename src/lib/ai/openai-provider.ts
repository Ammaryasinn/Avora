import "server-only";

import { createHash } from "node:crypto";

import OpenAI, { toFile } from "openai";
import { z } from "zod";

import type {
  GeneratedCopy,
  GeneratedSalesReply,
  ImageAIProvider,
  ImageEditRequest,
  ImageGenerationRequest,
  TextAIProvider,
  TextGenerationRequest,
} from "./contracts";
import { getAIConfiguration } from "./config";

const copySchema = z.object({
  variants: z.array(
    z.object({
      headline: z.string().min(1).max(120),
      primaryText: z.string().min(1).max(2_200),
      callToAction: z.string().min(1).max(80),
      caption: z.string().min(1).max(2_200),
    }),
  ),
});

const copyJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          headline: { type: "string" },
          primaryText: { type: "string" },
          callToAction: { type: "string" },
          caption: { type: "string" },
        },
        required: ["headline", "primaryText", "callToAction", "caption"],
      },
    },
  },
  required: ["variants"],
} as const;

const salesReplySchema = z.object({
  reply: z.string().trim().min(1).max(4_000),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  handoffSuggested: z.boolean(),
  qualificationSuggestions: z.object({
    need: z.string().trim().max(500).nullable(),
    budget: z.string().trim().max(200).nullable(),
    timeline: z.string().trim().max(200).nullable(),
    decisionMaker: z.string().trim().max(200).nullable(),
  }),
});

const salesReplyJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    confidence: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
    handoffSuggested: { type: "boolean" },
    qualificationSuggestions: {
      type: "object",
      additionalProperties: false,
      properties: {
        need: { type: ["string", "null"] },
        budget: { type: ["string", "null"] },
        timeline: { type: ["string", "null"] },
        decisionMaker: { type: ["string", "null"] },
      },
      required: ["need", "budget", "timeline", "decisionMaker"],
    },
  },
  required: ["reply", "confidence", "handoffSuggested", "qualificationSuggestions"],
} as const;

function imageSize(aspectRatio: "1:1" | "4:5" | "9:16") {
  return aspectRatio === "9:16"
    ? "1024x1536" as const
    : aspectRatio === "4:5"
      ? "1024x1280" as const
      : "1024x1024" as const;
}

let client: OpenAI | undefined;

function getClient() {
  if (client) {
    return client;
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OpenAI is not configured.");
  }

  client = new OpenAI({
    apiKey,
    project: process.env.OPENAI_PROJECT_ID?.trim() || undefined,
  });
  return client;
}

export function createSafetyIdentifier(organizationId: string, userId: string) {
  return createHash("sha256")
    .update(`${organizationId}:${userId}`)
    .digest("hex");
}

export class OpenAIProvider implements TextAIProvider, ImageAIProvider {
  readonly providerKey = "openai";
  readonly modelId = getAIConfiguration().openAI.textModel;

  async moderateText(input: string) {
    const configuration = getAIConfiguration();
    const result = await getClient().moderations.create({
      model: configuration.openAI.moderationModel,
      input,
    });
    const moderation = result.results[0];

    return {
      allowed: !moderation.flagged,
      flagged: moderation.flagged,
      categories: moderation.categories as unknown as Record<string, boolean>,
      providerRequestId: result.id,
    };
  }

  async moderateImage(imageUrl: string) {
    const configuration = getAIConfiguration();
    const result = await getClient().moderations.create({
      model: configuration.openAI.moderationModel,
      input: [{ type: "image_url", image_url: { url: imageUrl } }],
    });
    const moderation = result.results[0];

    return {
      allowed: !moderation.flagged,
      flagged: moderation.flagged,
      categories: moderation.categories as unknown as Record<string, boolean>,
      providerRequestId: result.id,
    };
  }

  async generateText(input: TextGenerationRequest) {
    const response = await getClient().responses.create({
      model: getAIConfiguration().openAI.textModel,
      input: input.prompt,
      store: false,
      safety_identifier: input.safetyIdentifier,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "avora_creative_variants",
          strict: true,
          schema: copyJsonSchema,
        },
      },
    });
    const parsed = copySchema.parse(JSON.parse(response.output_text));

    return {
      providerRequestId: response.id,
      variants: parsed.variants.slice(0, input.variantCount) as GeneratedCopy[],
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    };
  }

  async generateSalesReply(input: Omit<TextGenerationRequest, "variantCount">) {
    const response = await getClient().responses.create({
      model: getAIConfiguration().openAI.textModel,
      input: input.prompt,
      store: false,
      safety_identifier: input.safetyIdentifier,
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "avora_whatsapp_sales_reply",
          strict: true,
          schema: salesReplyJsonSchema,
        },
      },
    });
    const draft = salesReplySchema.parse(JSON.parse(response.output_text)) as GeneratedSalesReply;
    return {
      providerRequestId: response.id,
      draft,
      usage: {
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    };
  }

  async generateImage(input: ImageGenerationRequest) {
    const response = await getClient().images.generate({
      model: getAIConfiguration().openAI.imageModel,
      prompt: input.prompt,
      n: input.variantCount,
      size: imageSize(input.aspectRatio),
      quality: "medium",
      output_format: "webp",
      moderation: "auto",
      user: input.safetyIdentifier,
    });
    const data = response.data ?? [];

    return {
      images: data
        .filter((image) => image.b64_json)
        .map((image) => ({
          bytes: Uint8Array.from(Buffer.from(image.b64_json!, "base64")),
          contentType: "image/webp" as const,
          revisedPrompt: image.revised_prompt,
        })),
      usage: { imageCount: data.length },
    };
  }

  async editImage(input: ImageEditRequest) {
    const image = await toFile(input.source.bytes, "source.webp", {
      type: input.source.contentType,
    });
    const response = await getClient().images.edit({
      model: getAIConfiguration().openAI.imageModel,
      image,
      prompt: input.prompt,
      n: input.variantCount,
      size: imageSize(input.aspectRatio),
      quality: "medium",
      output_format: "webp",
      user: input.safetyIdentifier,
    });
    const data = response.data ?? [];

    return {
      images: data
        .filter((output) => output.b64_json)
        .map((output) => ({
          bytes: Uint8Array.from(Buffer.from(output.b64_json!, "base64")),
          contentType: "image/webp" as const,
          revisedPrompt: output.revised_prompt,
        })),
      usage: { imageCount: data.length },
    };
  }
}
