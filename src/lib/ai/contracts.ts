import "server-only";

export type GeneratedCopy = {
  headline: string;
  primaryText: string;
  callToAction: string;
  caption: string;
};

export type GeneratedImage = {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  revisedPrompt?: string;
};

export type AIUsage = {
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  providerCostUsd?: string;
  metadata?: Record<string, unknown>;
};

export type ModerationResult = {
  allowed: boolean;
  flagged: boolean;
  categories: Record<string, boolean>;
  providerRequestId?: string;
};

export type TextGenerationRequest = {
  prompt: string;
  safetyIdentifier: string;
  variantCount: number;
};

export type ImageGenerationRequest = {
  prompt: string;
  safetyIdentifier: string;
  variantCount: number;
  aspectRatio: "1:1" | "4:5" | "9:16";
};

export type ImageEditRequest = {
  prompt: string;
  safetyIdentifier: string;
  source: GeneratedImage;
  variantCount: number;
  aspectRatio: "1:1" | "4:5" | "9:16";
};

export type VirtualTryOnRequest = {
  personImageUrl: string;
  productImageUrl: string;
  category: "tops" | "bottoms" | "one-pieces";
  webhookUrl?: string;
};

export type QueuedProviderRequest = {
  providerRequestId: string;
  providerStatus: string;
};

export type ProviderPollResult =
  | { state: "queued" | "running"; providerStatus: string }
  | {
      state: "completed";
      providerStatus: string;
      outputUrls: string[];
      usage?: AIUsage;
    };

export interface TextAIProvider {
  readonly providerKey: string;
  readonly modelId: string;
  moderateText(input: string): Promise<ModerationResult>;
  generateText(input: TextGenerationRequest): Promise<{
    providerRequestId: string;
    variants: GeneratedCopy[];
    usage: AIUsage;
  }>;
}

export interface ImageAIProvider {
  readonly providerKey: string;
  readonly modelId: string;
  moderateImage(imageUrl: string): Promise<ModerationResult>;
  generateImage(input: ImageGenerationRequest): Promise<{
    providerRequestId?: string;
    images: GeneratedImage[];
    usage: AIUsage;
  }>;
  editImage(input: ImageEditRequest): Promise<{
    providerRequestId?: string;
    images: GeneratedImage[];
    usage: AIUsage;
  }>;
}

export interface VirtualTryOnAIProvider {
  readonly providerKey: string;
  readonly modelId: string;
  generateVirtualTryOn(
    input: VirtualTryOnRequest,
  ): Promise<QueuedProviderRequest>;
  pollVirtualTryOn(requestId: string): Promise<ProviderPollResult>;
}

export interface VideoAIProvider {
  generateVideo(): Promise<never>;
}
