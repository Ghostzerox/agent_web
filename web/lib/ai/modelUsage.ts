import { z } from "zod";

export const MODEL_BUSINESSES = ["chat", "agent-task", "news", "books", "reflection", "memorization", "problem-solving", "review-card", "game", "context-summary"] as const;
export type ModelBusiness = (typeof MODEL_BUSINESSES)[number];
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const tokenUsageSchema = z.object({
  inputTokens: count,
  outputTokens: count,
  cachedInputTokens: count,
  uncachedInputTokens: count,
  reasoningTokens: count,
}).strict();
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export function parseTokenUsage(payload: unknown): TokenUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { usage?: unknown }).usage;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const read = (v: unknown): number | null => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  const inputTokens = read(value.prompt_tokens);
  const outputTokens = read(value.completion_tokens);
  const details = value.prompt_tokens_details as Record<string, unknown> | undefined;
  const completion = value.completion_tokens_details as Record<string, unknown> | undefined;
  let cachedInputTokens = read(value.prompt_cache_hit_tokens) ?? read(details?.cached_tokens);
  let uncachedInputTokens = read(value.prompt_cache_miss_tokens);
  if (inputTokens === null || (cachedInputTokens !== null && cachedInputTokens > inputTokens)) cachedInputTokens = null;
  if (inputTokens === null || (uncachedInputTokens !== null && uncachedInputTokens > inputTokens)) uncachedInputTokens = null;
  if (inputTokens !== null && cachedInputTokens !== null && uncachedInputTokens !== null && cachedInputTokens + uncachedInputTokens !== inputTokens) {
    cachedInputTokens = null;
    uncachedInputTokens = null;
  }
  if (inputTokens !== null && cachedInputTokens !== null && uncachedInputTokens === null) uncachedInputTokens = inputTokens - cachedInputTokens;
  if (inputTokens !== null && uncachedInputTokens !== null && cachedInputTokens === null) cachedInputTokens = inputTokens - uncachedInputTokens;
  return { inputTokens, outputTokens, cachedInputTokens, uncachedInputTokens, reasoningTokens: read(completion?.reasoning_tokens) };
}

export const tokenPriceSchema = z.object({
  providerOrigin: z.url(), model: z.string().min(1).max(200),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  inputPerMillion: z.number().finite().nonnegative(),
  cachedInputPerMillion: z.number().finite().nonnegative(),
  outputPerMillion: z.number().finite().nonnegative(),
  source: z.url(), asOf: z.iso.date(),
}).strict();
export type TokenPrice = z.infer<typeof tokenPriceSchema>;

export function readTokenPrices(raw: string | undefined): TokenPrice[] {
  if (!raw?.trim()) return [];
  try { return z.array(tokenPriceSchema).max(100).parse(JSON.parse(raw)); }
  catch { return []; }
}

export function estimateTokenCost(usage: TokenUsage | null, price: TokenPrice | null): number | null {
  if (!usage || !price || usage.inputTokens === null || usage.outputTokens === null) return null;
  // Missing cache statistics must not be treated as zero when rates differ.
  if (usage.cachedInputTokens === null && price.inputPerMillion !== price.cachedInputPerMillion) return null;
  const cached = usage.cachedInputTokens ?? 0;
  return ((usage.inputTokens - cached) * price.inputPerMillion + cached * price.cachedInputPerMillion + usage.outputTokens * price.outputPerMillion) / 1_000_000;
}

export const modelCallSchema = z.object({
  id: z.uuid(), business: z.enum(MODEL_BUSINESSES), providerOrigin: z.url(),
  model: z.string().min(1).max(200), startedAt: z.iso.datetime(),
  status: z.enum(["completed", "failed", "cancelled"]),
  attempts: z.number().int().min(0).max(3),
  durationMs: z.number().finite().nonnegative(), firstTokenMs: z.number().finite().nonnegative().nullable(),
  usage: tokenUsageSchema.nullable(), finishReason: z.string().max(80).nullable(),
  errorCode: z.string().max(80).nullable(),
  price: tokenPriceSchema.nullable(), estimatedCost: z.number().finite().nonnegative().nullable(),
  requestCharacters: count.optional(), maxOutputTokens: count.optional(),
  promptVersion: z.string().min(1).max(100).optional(),
  operationId: z.uuid().optional(),
}).strict();
export type ModelCallTelemetry = z.infer<typeof modelCallSchema>;

export function summarizeModelCalls(calls: readonly ModelCallTelemetry[]) {
  const groups = new Map<string, {
    providerOrigin: string; model: string; business: ModelBusiness; calls: number; attempts: number;
    failures: number; cancelled: number; usageKnown: number; cacheKnown: number;
    inputTokens: number | null; outputTokens: number | null; cachedInputTokens: number | null;
    comparableCacheInputTokens: number | null; cacheHitRate: number | null;
    pricedCalls: number; costs: Record<string, number>; durationMs: number;
  }>();
  for (const call of calls) {
    const key = JSON.stringify([call.providerOrigin, call.model, call.business]);
    const group = groups.get(key) ?? {
      providerOrigin: call.providerOrigin, model: call.model, business: call.business,
      calls: 0, attempts: 0, failures: 0, cancelled: 0, usageKnown: 0, cacheKnown: 0,
      inputTokens: null, outputTokens: null, cachedInputTokens: null, comparableCacheInputTokens: null,
      cacheHitRate: null, pricedCalls: 0, costs: {}, durationMs: 0,
    };
    group.calls++;
    group.attempts += call.attempts;
    group.failures += Number(call.status === "failed");
    group.cancelled += Number(call.status === "cancelled");
    group.durationMs += call.durationMs;
    if (call.usage?.inputTokens !== null && call.usage?.inputTokens !== undefined) {
      group.usageKnown++;
      group.inputTokens = (group.inputTokens ?? 0) + call.usage.inputTokens;
    }
    if (call.usage?.outputTokens !== null && call.usage?.outputTokens !== undefined) group.outputTokens = (group.outputTokens ?? 0) + call.usage.outputTokens;
    if (call.usage?.inputTokens !== null && call.usage?.inputTokens !== undefined && call.usage.cachedInputTokens !== null) {
      group.cacheKnown++;
      group.cachedInputTokens = (group.cachedInputTokens ?? 0) + call.usage.cachedInputTokens;
      group.comparableCacheInputTokens = (group.comparableCacheInputTokens ?? 0) + call.usage.inputTokens;
    }
    if (call.price && call.estimatedCost !== null) {
      group.pricedCalls++;
      group.costs[call.price.currency] = (group.costs[call.price.currency] ?? 0) + call.estimatedCost;
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, cacheHitRate: group.comparableCacheInputTokens ? (group.cachedInputTokens ?? 0) / group.comparableCacheInputTokens : null }));
}
