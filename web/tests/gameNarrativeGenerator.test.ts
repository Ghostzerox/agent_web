import { describe, expect, it, vi } from "vitest";
import { ModelConfigError } from "@/lib/ai/server/modelConfig";
import {
  ModelProviderError,
  type ModelProvider,
  type ModelStreamRequest,
} from "@/lib/ai/server/modelProvider";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";

async function* streamText(...parts: string[]) {
  for (const text of parts) yield { type: "delta" as const, text };
  yield { type: "done" as const };
}

describe("Game narrative generator", () => {
  it("uses the server provider and never places the API key in messages", async () => {
    const stream = vi.fn((request: ModelStreamRequest, signal?: AbortSignal) => {
      void request;
      void signal;
      return streamText("雾门", "开启");
    });
    const generator = createGameNarrativeGenerator({
      getConfig: vi.fn().mockResolvedValue({
        apiKey: "server-secret",
        baseUrl: "https://provider.example/v1",
        model: "game-model",
      }),
      createProvider: vi.fn().mockReturnValue({ stream } satisfies ModelProvider),
    });
    const messages = [
      { role: "system" as const, content: "虚构世界" },
      { role: "user" as const, content: "进入港口" },
    ];
    await expect(generator.generate(messages)).resolves.toEqual({
      content: "雾门开启",
      model: "game-model",
    });
    expect(stream.mock.calls[0][0].messages).toEqual(messages);
    expect(JSON.stringify(stream.mock.calls[0][0])).not.toContain("server-secret");
  });

  it("maps missing configuration, provider failure and empty output", async () => {
    const missing = createGameNarrativeGenerator({
      getConfig: vi.fn().mockRejectedValue(new ModelConfigError(["modelCredential"])),
      createProvider: vi.fn(),
    });
    await expect(missing.generate([])).rejects.toMatchObject({
      code: "MODEL_CONFIGURATION_ERROR",
      retryable: false,
    });

    const failed = createGameNarrativeGenerator({
      getConfig: vi.fn().mockResolvedValue({ apiKey: "key", baseUrl: "https://example.com", model: "m" }),
      createProvider: () => ({
        async *stream() {
          throw new ModelProviderError("PROVIDER_RATE_LIMITED", "Rate limited.", true);
        },
      }),
    });
    await expect(failed.generate([])).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryable: true,
    });

    const empty = createGameNarrativeGenerator({
      getConfig: vi.fn().mockResolvedValue({ apiKey: "key", baseUrl: "https://example.com", model: "m" }),
      createProvider: () => ({ stream: () => streamText() }),
    });
    await expect(empty.generate([])).rejects.toMatchObject({
      code: "GAME_OUTPUT_EMPTY",
      retryable: false,
    });
  });
});
