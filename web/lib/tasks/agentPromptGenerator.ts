import type { ChatCompletionMessage } from "@/lib/ai/messages";
import {
  ModelProviderError,
  type ModelProvider,
} from "@/lib/ai/server/modelProvider";
import { createMeasuredProvider } from "@/lib/ai/server/measuredProvider";
import type { ModelBusiness } from "@/lib/ai/modelUsage";
import { taskPromptProfile, taskSystemPrompt } from "@/lib/ai/taskPromptProfiles";
import {
  resolveModelProviderConfig,
} from "@/lib/ai/server/modelCredentialService";
import {
  ModelConfigError,
  type ModelProviderConfig,
} from "@/lib/ai/server/modelConfig";

const MAX_AGENT_RESULT_LENGTH = 100_000;

export type AgentPromptResult = {
  content: string;
  model: string;
};

export interface AgentPromptGeneratorPort {
  generate(prompt: string, signal?: AbortSignal, options?: { business: ModelBusiness }): Promise<AgentPromptResult>;
  generateWithImage?(
    prompt: string,
    imageDataUrl: string,
    signal?: AbortSignal,
    options?: { business: ModelBusiness },
  ): Promise<AgentPromptResult>;
}

export class AgentPromptGenerationError extends Error {
  constructor(
    readonly code:
      | "MODEL_CONFIGURATION_ERROR"
      | "AGENT_PROMPT_MISSING"
      | "AGENT_OUTPUT_EMPTY"
      | "AGENT_OUTPUT_TOO_LARGE"
      | ModelProviderError["code"],
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AgentPromptGenerationError";
  }
}

type AgentPromptGeneratorDependencies = {
  getConfig: () => ModelProviderConfig | Promise<ModelProviderConfig>;
  createProvider: (config: ModelProviderConfig) => ModelProvider;
};

function promptMessages(prompt: string, business: ModelBusiness): ChatCompletionMessage[] {
  return [
    { role: "system", content: taskSystemPrompt(business) },
    { role: "user", content: prompt },
  ];
}

function promptMessagesWithImage(prompt: string, imageDataUrl: string, business: ModelBusiness) {
  return [
    { role: "system" as const, content: taskSystemPrompt(business) },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: prompt },
        { type: "image_url" as const, image_url: { url: imageDataUrl } },
      ],
    },
  ];
}

export function createAgentPromptGenerator(
  dependencies: AgentPromptGeneratorDependencies = {
    getConfig: resolveModelProviderConfig,
    createProvider: createMeasuredProvider,
  },
): AgentPromptGeneratorPort {
  const generateMessages = async (
    messages: Parameters<ModelProvider["stream"]>[0]["messages"],
    signal?: AbortSignal,
    options?: { business: ModelBusiness },
  ): Promise<AgentPromptResult> => {
    let config: ModelProviderConfig;
    try {
      config = await dependencies.getConfig();
    } catch (error) {
      if (error instanceof ModelConfigError) {
        throw new AgentPromptGenerationError(
          "MODEL_CONFIGURATION_ERROR",
          "Server model provider is not configured.",
          false,
        );
      }
      throw error;
    }

    let content = "";
    const providerController = new AbortController();
    const providerSignal = signal
      ? AbortSignal.any([signal, providerController.signal])
      : providerController.signal;
    try {
      for await (const event of dependencies
        .createProvider(config)
        .stream({ messages, business: options?.business ?? "agent-task", promptVersion: taskPromptProfile(options?.business ?? "agent-task").version }, providerSignal)) {
        if (event.type !== "delta") continue;
        content += event.text;
        if (content.length > MAX_AGENT_RESULT_LENGTH) {
          providerController.abort("Agent task output is too large.");
          throw new AgentPromptGenerationError(
            "AGENT_OUTPUT_TOO_LARGE",
            "Agent task output exceeded the supported size.",
            false,
          );
        }
      }
    } catch (error) {
      if (error instanceof AgentPromptGenerationError) throw error;
      if (error instanceof ModelProviderError) {
        throw new AgentPromptGenerationError(
          error.code,
          error.message,
          error.retryable,
        );
      }
      throw error;
    } finally {
      providerController.abort("Agent task generation finished.");
    }

    if (!content.trim()) {
      throw new AgentPromptGenerationError(
        "AGENT_OUTPUT_EMPTY",
        "Model provider returned no content for the Agent task.",
        false,
      );
    }
    return { content, model: config.model };
  };

  return {
    async generate(prompt, signal, options) {
      return generateMessages(promptMessages(prompt, options?.business ?? "agent-task"), signal, options);
    },
    async generateWithImage(prompt, imageDataUrl, signal, options) {
      return generateMessages(promptMessagesWithImage(prompt, imageDataUrl, options?.business ?? "agent-task"), signal, options);
    },
  };
}
