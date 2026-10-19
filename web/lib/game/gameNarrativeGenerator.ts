import type { ChatCompletionMessage } from "@/lib/ai/messages";
import { GAME_PROMPT_VERSION } from "@/lib/ai/taskPromptProfiles";
import { EXPLORATION_PROMPT_VERSION } from "./exploration/prompt";
import {
  ModelProviderError,
  type ModelProvider,
} from "@/lib/ai/server/modelProvider";
import { createMeasuredProvider } from "@/lib/ai/server/measuredProvider";
import { resolveModelProviderConfig } from "@/lib/ai/server/modelCredentialService";
import { ModelConfigError, type ModelProviderConfig } from "@/lib/ai/server/modelConfig";

const MAX_GAME_RESULT_LENGTH = 100_000;

export type GameNarrativeResult = { content: string; model: string };

export interface GameNarrativeGeneratorPort {
  generate(
    messages: ChatCompletionMessage[],
    signal?: AbortSignal,
    options?: { promptVersion: string },
  ): Promise<GameNarrativeResult>;
}

export class GameNarrativeGenerationError extends Error {
  constructor(
    readonly code:
      | "MODEL_CONFIGURATION_ERROR"
      | "GAME_OUTPUT_EMPTY"
      | "GAME_OUTPUT_TOO_LARGE"
      | ModelProviderError["code"],
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "GameNarrativeGenerationError";
  }
}

type Dependencies = {
  getConfig: () => ModelProviderConfig | Promise<ModelProviderConfig>;
  createProvider: (config: ModelProviderConfig) => ModelProvider;
};

export function createGameNarrativeGenerator(
  dependencies: Dependencies = {
    getConfig: resolveModelProviderConfig,
    createProvider: createMeasuredProvider,
  },
): GameNarrativeGeneratorPort {
  return {
    async generate(messages, signal, options) {
      let config: ModelProviderConfig;
      try {
        config = await dependencies.getConfig();
      } catch (error) {
        if (error instanceof ModelConfigError) {
          throw new GameNarrativeGenerationError(
            "MODEL_CONFIGURATION_ERROR",
            "Server model provider is not configured.",
            false,
          );
        }
        throw error;
      }

      let content = "";
      const controller = new AbortController();
      const providerSignal = signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal;
      try {
        for await (const event of dependencies
          .createProvider(config)
          .stream({ messages, business: "game", promptVersion: options?.promptVersion ?? (typeof messages[0]?.content === "string" && messages[0].content.startsWith("你是叙事型探索世界") ? EXPLORATION_PROMPT_VERSION : GAME_PROMPT_VERSION) }, providerSignal)) {
          if (event.type !== "delta") continue;
          content += event.text;
          if (content.length > MAX_GAME_RESULT_LENGTH) {
            controller.abort("Game narrative output is too large.");
            throw new GameNarrativeGenerationError(
              "GAME_OUTPUT_TOO_LARGE",
              "Game narrative output exceeded the supported size.",
              false,
            );
          }
        }
      } catch (error) {
        if (error instanceof GameNarrativeGenerationError) throw error;
        if (error instanceof ModelProviderError) {
          throw new GameNarrativeGenerationError(
            error.code,
            error.message,
            error.retryable,
          );
        }
        throw error;
      } finally {
        controller.abort("Game narrative generation finished.");
      }

      if (!content.trim()) {
        throw new GameNarrativeGenerationError(
          "GAME_OUTPUT_EMPTY",
          "Model provider returned no game narrative.",
          false,
        );
      }
      return { content: content.trim(), model: config.model };
    },
  };
}
