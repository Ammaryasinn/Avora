import "server-only";

import { fal } from "@fal-ai/client";

import type {
  ProviderPollResult,
  VirtualTryOnAIProvider,
  VirtualTryOnRequest,
} from "./contracts";
import { getAIConfiguration } from "./config";

let configured = false;

function configureFal() {
  if (configured) {
    return;
  }

  const credentials = process.env.FAL_KEY?.trim();

  if (!credentials) {
    throw new Error("fal.ai is not configured.");
  }

  fal.config({ credentials });
  configured = true;
}

function extractUrls(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const candidates = [record.image, record.images, record.output];
  const urls: string[] = [];

  for (const candidate of candidates) {
    const values = Array.isArray(candidate) ? candidate : [candidate];

    for (const entry of values) {
      if (typeof entry === "string" && entry.startsWith("https://")) {
        urls.push(entry);
      } else if (entry && typeof entry === "object") {
        const url = (entry as Record<string, unknown>).url;

        if (typeof url === "string" && url.startsWith("https://")) {
          urls.push(url);
        }
      }
    }
  }

  return [...new Set(urls)];
}

export class FalVirtualTryOnProvider implements VirtualTryOnAIProvider {
  readonly providerKey = "fal";
  readonly modelId = getAIConfiguration().fal.virtualTryOnModel;

  async generateVirtualTryOn(input: VirtualTryOnRequest) {
    configureFal();
    const result = await fal.queue.submit(this.modelId, {
      input: {
        person_image_url: input.personImageUrl,
        clothing_image_url: input.productImageUrl,
        preserve_pose: true,
      },
      webhookUrl: input.webhookUrl,
    });

    return {
      providerRequestId: result.request_id,
      providerStatus: result.status,
    };
  }

  async pollVirtualTryOn(requestId: string): Promise<ProviderPollResult> {
    configureFal();
    const status = await fal.queue.status(this.modelId, { requestId });

    if (status.status !== "COMPLETED") {
      return {
        state: status.status === "IN_PROGRESS" ? "running" : "queued",
        providerStatus: status.status,
      };
    }

    const result = await fal.queue.result(this.modelId, { requestId });
    return {
      state: "completed",
      providerStatus: "COMPLETED",
      outputUrls: extractUrls(result.data),
    };
  }
}
