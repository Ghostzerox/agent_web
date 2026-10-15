import { describe, expect, it } from "vitest";
import { EvaluationBudget, measuredUpperCost, reserveCallCny } from "@/evals/r3/qualityCost";
import type { ModelCallTelemetry } from "@/lib/ai/modelUsage";

const call = (overrides: Partial<ModelCallTelemetry> = {}): ModelCallTelemetry => ({ id: "11111111-1111-4111-8111-111111111111", business: "news", providerOrigin: "https://api.deepseek.com", model: "deepseek-flash", startedAt: "2026-10-15T14:00:00.000Z", status: "completed", attempts: 1, durationMs: 100, firstTokenMs: 20, finishReason: "stop", errorCode: null, price: null, estimatedCost: null, usage: { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 800, uncachedInputTokens: 200, reasoningTokens: 0 }, ...overrides });

describe("R3.4 evaluation cost accounting", () => {
  it("prices measured cached input at verified peak rates and does not invent free missing usage", () => {
    expect(measuredUpperCost(call())).toBeCloseTo(0.001232);
    expect(measuredUpperCost(call({ usage: null }))).toBeNull();
    expect(measuredUpperCost(call({ attempts: 2 }))).toBeNull();
    expect(measuredUpperCost(call({ usage: { ...call().usage!, cachedInputTokens: null } }))).toBeCloseTo(0.0028);
  });
  it("accepts only evidenced DNS retries, not arbitrary unaccounted attempts", () => {
    expect(measuredUpperCost(call({ attempts: 2 }), { acceptedResponses: 1, dnsFailures: 1 })).toBeCloseTo(0.001232);
    expect(measuredUpperCost(call({ attempts: 2 }), { acceptedResponses: 2, dnsFailures: 0 })).toBeNull();
  });
  it("reserves concurrent calls before spending and stops on missing accounting", () => {
    const budget = new EvaluationBudget(0.1);
    expect(budget.claim(0.05)).toBe(true);
    expect(budget.claim(0.05)).toBe(false);
    budget.settle(0.05, 0.01);
    expect(budget.claim(0.05)).toBe(true);
    budget.settle(0.05, null);
    expect(budget.snapshot()).toMatchObject({ upperAccountedCny: 0.06, haltedForUnknownOrExcessUsage: true });
    expect(budget.claim(0.01)).toBe(false);
  });
  it("rejects invalid budgets and ceilings without contacting a provider", () => {
    for (const budget of [0, -1, NaN, 5.01]) expect(() => new EvaluationBudget(budget)).toThrow();
    for (const ceiling of [0, NaN, 4097]) expect(() => reserveCallCny([], ceiling)).toThrow();
    expect(reserveCallCny([{ role: "user", content: "你好" }], 4096)).toBeGreaterThan(4096 * 8 / 1_000_000);
  });
});
