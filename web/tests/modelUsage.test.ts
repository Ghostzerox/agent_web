import { describe, expect, it } from "vitest";
import { estimateTokenCost, modelCallSchema, parseTokenUsage, readTokenPrices, summarizeModelCalls, type ModelCallTelemetry, type TokenPrice } from "@/lib/ai/modelUsage";
import { createModelUsageApi } from "@/lib/api/modelUsageApi";

const price: TokenPrice = { providerOrigin: "https://api.deepseek.com", model: "mock", currency: "CNY", inputPerMillion: 2, cachedInputPerMillion: 0.2, outputPerMillion: 3, source: "https://api-docs.deepseek.com/", asOf: "2026-10-01" };
export function usageCall(overrides: Partial<ModelCallTelemetry> = {}): ModelCallTelemetry {
  return { id: crypto.randomUUID(), business: "chat", providerOrigin: price.providerOrigin, model: price.model, startedAt: "2026-10-01T00:00:00.000Z", status: "completed", attempts: 1, durationMs: 50, firstTokenMs: 20, finishReason: "stop", errorCode: null, usage: parseTokenUsage({ usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 } }), price: null, estimatedCost: null, ...overrides };
}

describe("model usage and cost", () => {
  it("accepts bounded template-version metadata while remaining compatible with old records", () => {
    expect(modelCallSchema.parse(usageCall()).promptVersion).toBeUndefined();
    expect(modelCallSchema.parse(usageCall({ promptVersion: "news/r3.3-v1" })).promptVersion).toBe("news/r3.3-v1");
    expect(() => modelCallSchema.parse(usageCall({ promptVersion: "x".repeat(101) }))).toThrow();
    expect(() => modelCallSchema.parse({ ...usageCall(), prompt: "private material" })).toThrow();
  });
  it("parses DeepSeek cache accounting and equivalent cached_tokens", () => {
    expect(usageCall().usage).toEqual({ inputTokens: 100, outputTokens: 20, cachedInputTokens: 80, uncachedInputTokens: 20, reasoningTokens: null });
    expect(parseTokenUsage({ usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 60 }, completion_tokens_details: { reasoning_tokens: 10 } } })).toMatchObject({ cachedInputTokens: 60, uncachedInputTokens: 40, reasoningTokens: 10 });
  });
  it("keeps absent statistics unknown, rejecting inconsistent or invalid cache counts", () => {
    expect(parseTokenUsage({ usage: null })).toBeNull();
    expect(parseTokenUsage({ usage: { prompt_tokens: 100 } })).toMatchObject({ inputTokens: 100, outputTokens: null, cachedInputTokens: null });
    expect(parseTokenUsage({ usage: { prompt_tokens: 100, prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 50 } })).toMatchObject({ cachedInputTokens: null, uncachedInputTokens: null });
    expect(parseTokenUsage({ usage: { prompt_tokens: -1, completion_tokens: 0 } })).toMatchObject({ inputTokens: null, outputTokens: 0 });
  });
  it("snapshots configured prices, never charging unknown cache as zero", () => {
    expect(readTokenPrices("oops")).toEqual([]);
    expect(readTokenPrices(JSON.stringify([price]))).toEqual([price]);
    expect(estimateTokenCost(usageCall().usage, price)).toBeCloseTo(0.000116);
    expect(estimateTokenCost(parseTokenUsage({ usage: { prompt_tokens: 100, completion_tokens: 20 } }), price)).toBeNull();
    expect(estimateTokenCost(null, price)).toBeNull();
  });
  it("uses token-weighted cache ratio, separates missing values, currencies and failed attempts", () => {
    const calls = [usageCall(), usageCall({ usage: { inputTokens: 900, outputTokens: 0, cachedInputTokens: 0, uncachedInputTokens: 900, reasoningTokens: null }, price, estimatedCost: 0.0018 }), usageCall({ usage: null, status: "cancelled", attempts: 3 })];
    expect(summarizeModelCalls(calls)[0]).toMatchObject({ calls: 3, attempts: 5, usageKnown: 2, cacheKnown: 2, cacheHitRate: 0.08, cancelled: 1, inputTokens: 1000, costs: { CNY: 0.0018 } });
    expect(summarizeModelCalls([usageCall({ usage: null })])[0]).toMatchObject({ inputTokens: null, outputTokens: null, cacheHitRate: null, costs: {} });
  });
  it("rejects prompt and key fields and serves a bounded no-store overview", async () => {
    expect(() => modelCallSchema.parse({ ...usageCall(), apiKey: "secret" })).toThrow();
    const api = createModelUsageApi({ list: async () => ({ calls: [usageCall()], truncated: true }) }, () => new Date("2026-10-01T00:00:00.000Z"));
    const response = await api.get();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ data: { since: "2026-09-24T00:00:00.000Z", recordedCalls: 1, truncated: true } });
  });
});
