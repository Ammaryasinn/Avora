import "server-only";

import { AICapability } from "@/generated/prisma/enums";

import type { VideoAIProvider } from "./contracts";
import { FalVirtualTryOnProvider } from "./fal-provider";
import { OpenAIProvider } from "./openai-provider";

const openAI = new OpenAIProvider();
const falVirtualTryOn = new FalVirtualTryOnProvider();

const disabledVideoProvider: VideoAIProvider = {
  async generateVideo() {
    throw new Error("Video generation is not enabled in Milestone 2A.");
  },
};

export function getProviderForCapability(capability: AICapability) {
  switch (capability) {
    case AICapability.GENERATE_TEXT:
    case AICapability.GENERATE_IMAGE:
    case AICapability.EDIT_IMAGE:
      return openAI;
    case AICapability.GENERATE_VIRTUAL_TRY_ON:
      return falVirtualTryOn;
    case AICapability.GENERATE_VIDEO:
      return disabledVideoProvider;
  }
}
