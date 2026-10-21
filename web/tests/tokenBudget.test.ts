import { afterEach, describe, expect, it, vi } from "vitest";
import { inputTextCharacters, resolveGenerationBudget } from "@/lib/ai/server/tokenBudget";
import { OpenAICompatibleProvider } from "@/lib/ai/server/modelProvider";
import { deduplicateWebEvidence } from "@/lib/search/webSearch";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const config = { apiKey: "not-real", baseUrl: "https://api.deepseek.com", model: "mock" };
const consume = async (provider: OpenAICompatibleProvider, messages = [{ role: "user" as const, content: "问题" }]) => { for await (const event of provider.stream({ messages })) void event; };

describe("generation budgets", () => {
  it("imposes no default output quota in any business, while retaining explicit operator opt-in", () => {
    for (const business of ["chat", "agent-task", "news", "books", "reflection", "memorization", "problem-solving", "review-card", "game", "context-summary"] as const)
      expect(resolveGenerationBudget(config, business, {})).toMatchObject({ maxOutputTokens: null, tokenParameter: null });
    expect(resolveGenerationBudget({ baseUrl: "https://custom.example/v1" }, "chat", {})).toMatchObject({ maxOutputTokens: null, tokenParameter: null });
    expect(resolveGenerationBudget(config, "chat", { AI_OUTPUT_TOKEN_PARAMETER: "off" }).maxOutputTokens).toBeNull();
    expect(resolveGenerationBudget(config, "game", { AI_OUTPUT_TOKEN_PARAMETER: "max_completion_tokens", AI_OUTPUT_TOKEN_BUDGETS_JSON: '{"game":8192}', AI_MAX_INPUT_CHARACTERS: "32000" })).toEqual({ maxOutputTokens: 8192, tokenParameter: "max_completion_tokens", inputCharacterLimit: 32000 });
    expect(resolveGenerationBudget(config, "chat", { AI_OUTPUT_TOKEN_BUDGETS_JSON: '{"chat":-1}', AI_MAX_INPUT_CHARACTERS: "NaN" })).toMatchObject({ maxOutputTokens: null, inputCharacterLimit: 160000 });
  });
  it("counts text characters honestly without pretending an image's base64 is input tokens", () => {
    expect(inputTextCharacters([{ content: [{ type: "text", text: "你好" }, { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } }] }])).toBe(2);
  });
  it("does not secretly impose world-specific quotas and honors deliberate profile overrides", () => {
    expect(resolveGenerationBudget(config, "game", {}, "world-authoring").maxOutputTokens).toBeNull();
    expect(resolveGenerationBudget(config, "game", {}, "world-section").maxOutputTokens).toBeNull();
    expect(resolveGenerationBudget(config, "game", { AI_OUTPUT_TOKEN_BUDGETS_JSON: '{"game":4096,"world-authoring":24000}' }, "world-authoring").maxOutputTokens).toBe(24000);
    expect(resolveGenerationBudget(config, "game", { AI_OUTPUT_TOKEN_BUDGETS_JSON: '{"game":4096,"world-authoring":-1}' }, "world-authoring").maxOutputTokens).toBe(4096);
    expect(resolveGenerationBudget(config, "game", { AI_OUTPUT_TOKEN_PARAMETER: "off", AI_OUTPUT_TOKEN_BUDGETS_JSON: '{"game":4096}' }, "world-authoring").maxOutputTokens).toBeNull();
  });
  it("keeps world model capabilities and custom provider contracts, without hidden token ceilings", async () => {
    const fetcher = vi.fn(async () => Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }));
    vi.stubGlobal("fetch", fetcher);
    for (const [baseUrl, business, outputProfile] of [
      [config.baseUrl, "game", "world-authoring"], [config.baseUrl, "game", "world-section"],
      [config.baseUrl, "game", undefined], [config.baseUrl, "chat", undefined],
      ["https://custom.example/v1", "game", "world-authoring"],
    ] as const) {
      for await (const event of new OpenAICompatibleProvider({ ...config, baseUrl }).stream({ business, outputProfile, messages: [{ role: "user", content: "synthetic" }] })) void event;
    }
    const bodies = fetcher.mock.calls.map((call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string));
    expect(bodies[0]).toMatchObject({ response_format: { type: "json_object" } });
    for (const body of bodies) { expect(body).not.toHaveProperty("max_tokens"); expect(body).not.toHaveProperty("max_completion_tokens"); }
    for (const body of bodies) expect(body).not.toHaveProperty("thinking");
    expect(bodies[4]).not.toHaveProperty("max_tokens"); expect(bodies[4]).not.toHaveProperty("response_format");
  });
  it("rejects excessive input before a billable request and keeps the original content", async () => {
    vi.stubEnv("AI_MAX_INPUT_CHARACTERS", "1000");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const record = vi.fn().mockResolvedValue(undefined);
    const messages = [{ role: "user" as const, content: "长".repeat(1001) }];
    await expect(consume(new OpenAICompatibleProvider(config, record), messages)).rejects.toMatchObject({ code: "PROVIDER_CONTEXT_TOO_LARGE", retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
    expect(messages[0].content).toHaveLength(1001);
    expect(record.mock.calls[0][0]).toMatchObject({ attempts: 0, requestCharacters: 1001, status: "failed" });
  });
  it("detects length termination after usage, never returns success or repeats the request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"{partial"},"finish_reason":"length"}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":8192,"prompt_cache_hit_tokens":0}}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetcher);
    const record = vi.fn().mockResolvedValue(undefined);
    await expect(consume(new OpenAICompatibleProvider(config, record))).rejects.toMatchObject({ code: "PROVIDER_OUTPUT_TRUNCATED", retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).not.toHaveProperty("max_tokens");
    expect(record.mock.calls[0][0]).toMatchObject({ status: "failed", finishReason: "length", usage: { outputTokens: 8192 } });
  });
  it("does not accept a dropped stream as a completed answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', { headers: { "content-type": "text/event-stream" } })));
    await expect(consume(new OpenAICompatibleProvider(config))).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE", retryable: false });
  });
  it("only drops identical evidence, retaining distinct updates, publication date and source ids", () => {
    const source = { id: "S1", title: "来源", url: "https://example.com", snippet: "证据", source: "example.com", publishedAt: "2026-10-01", fetchedAt: "a" };
    const distinct = { ...source, id: "S3", snippet: "不同的新信息" };
    expect(deduplicateWebEvidence([source, { ...source, id: "S2", fetchedAt: "b" }, distinct])).toEqual([source, distinct]);
  });
});
