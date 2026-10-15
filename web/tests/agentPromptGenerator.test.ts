import { describe, expect, it, vi } from "vitest";
import { ModelConfigError } from "@/lib/ai/server/modelConfig";
import {
  ModelProviderError,
  type ModelProvider,
  type ModelStreamRequest,
} from "@/lib/ai/server/modelProvider";
import {
  createAgentPromptGenerator,
} from "@/lib/tasks/agentPromptGenerator";
import { TASK_PROMPT_PROFILES, taskSystemPrompt } from "@/lib/ai/taskPromptProfiles";

async function* streamText(...parts: string[]) {
  for (const text of parts) yield { type: "delta" as const, text };
  yield { type: "done" as const };
}

describe("Agent Prompt generator", () => {
  it.each(Object.keys(TASK_PROMPT_PROFILES) as Array<keyof typeof TASK_PROMPT_PROFILES>)("selects the %s system prefix and version for text and images", async (business) => {
    const requests: ModelStreamRequest[] = [];
    const generator = createAgentPromptGenerator({
      getConfig: () => ({ apiKey: "test-key", baseUrl: "https://provider.invalid/v1", model: "mock" }),
      createProvider: () => ({ async *stream(request) { requests.push(request); yield* streamText("合成输出"); } }),
    });
    await generator.generate("本次材料", undefined, { business });
    await generator.generateWithImage?.("本次材料", "data:image/png;base64,aGVsbG8=", undefined, { business });
    for (const request of requests) {
      expect(request).toMatchObject({ business, promptVersion: TASK_PROMPT_PROFILES[business].version });
      expect(request.messages[0]).toEqual({ role: "system", content: taskSystemPrompt(business) });
      if (business !== "agent-task") expect(request.messages[0].content).not.toContain("定时任务");
    }
    expect(requests).toHaveLength(2);
  });

  it("uses the server provider directly and collects streamed output", async () => {
    const stream = vi.fn(
      (request: ModelStreamRequest, signal?: AbortSignal) => {
        void request;
        void signal;
        return streamText("第一段", "\n第二段");
      },
    );
    const generator = createAgentPromptGenerator({
      getConfig: vi.fn().mockResolvedValue({
        apiKey: "server-secret",
        baseUrl: "https://provider.example/v1",
        model: "scheduled-model",
      }),
      createProvider: vi.fn().mockReturnValue({ stream } satisfies ModelProvider),
    });

    await expect(generator.generate("总结今天的学习", new AbortController().signal))
      .resolves.toEqual({
        content: "第一段\n第二段",
        model: "scheduled-model",
      });
    const request = stream.mock.calls[0][0];
    expect(request.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      { role: "user", content: "总结今天的学习" },
    ]);
    expect(JSON.stringify(request)).not.toContain("server-secret");
  });

  it("maps missing configuration and provider failures to stable retry semantics", async () => {
    const missing = createAgentPromptGenerator({
      getConfig: vi.fn().mockRejectedValue(new ModelConfigError(["AI_API_KEY"])),
      createProvider: vi.fn(),
    });
    await expect(missing.generate("任务")).rejects.toMatchObject({
      code: "MODEL_CONFIGURATION_ERROR",
      retryable: false,
    });

    const provider = createAgentPromptGenerator({
      getConfig: vi.fn().mockResolvedValue({
        apiKey: "key",
        baseUrl: "https://provider.example/v1",
        model: "model",
      }),
      createProvider: () => ({
        async *stream() {
          throw new ModelProviderError(
            "PROVIDER_RATE_LIMITED",
            "Rate limited.",
            true,
          );
        },
      }),
    });
    await expect(provider.generate("任务")).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryable: true,
    });
  });

  it("rejects an empty provider response", async () => {
    const generator = createAgentPromptGenerator({
      getConfig: vi.fn().mockResolvedValue({
        apiKey: "key",
        baseUrl: "https://provider.example/v1",
        model: "model",
      }),
      createProvider: () => ({ stream: () => streamText() }),
    });
    await expect(generator.generate("任务")).rejects.toMatchObject({
      code: "AGENT_OUTPUT_EMPTY",
      retryable: false,
    });
  });

  it("keeps a vision image inside the provider request without exposing the key", async () => {
    const stream = vi.fn<ModelProvider["stream"]>(() => streamText("图片题已识别"));
    const generator = createAgentPromptGenerator({
      getConfig: vi.fn().mockResolvedValue({
        apiKey: "vision-secret",
        baseUrl: "https://provider.example/v1",
        model: "vision-model",
      }),
      createProvider: vi.fn().mockReturnValue({ stream } satisfies ModelProvider),
    });
    const imageDataUrl = `data:image/jpeg;base64,${Buffer.from("image").toString("base64")}`;
    await expect(generator.generateWithImage?.("识别题目", imageDataUrl)).resolves.toEqual({
      content: "图片题已识别",
      model: "vision-model",
    });
    const request = stream.mock.calls[0][0] as ModelStreamRequest;
    expect(request.messages[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "识别题目" },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    });
    expect(JSON.stringify(request)).not.toContain("vision-secret");
  });
});
