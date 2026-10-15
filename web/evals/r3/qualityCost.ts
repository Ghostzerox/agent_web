import { estimateTokenCost, type ModelCallTelemetry } from "@/lib/ai/modelUsage";

export const REVIEWED_PRICE = {
  providerOrigin: "https://api.deepseek.com", model: "deepseek-flash", currency: "CNY",
  inputPerMillion: 2, cachedInputPerMillion: 0.04, outputPerMillion: 8,
  source: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/", asOf: "2026-10-15",
};

/** Peak rates reserve more than off-peak billing; bytes are a conservative input allowance, not a tokenizer. */
export function reserveCallCny(messages: unknown, maxOutputTokens: number): number {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 4096) throw new Error("Invalid evaluation output ceiling");
  return ((Buffer.byteLength(JSON.stringify(messages), "utf8") * 2 + 2048) * REVIEWED_PRICE.inputPerMillion + maxOutputTokens * REVIEWED_PRICE.outputPerMillion) / 1_000_000;
}

export function measuredUpperCost(call: ModelCallTelemetry | null, network?: { acceptedResponses: number; dnsFailures: number }): number | null {
  const verifiedDnsRetries = network?.acceptedResponses === 1 && call && network.dnsFailures === call.attempts - 1;
  if (!call || (call.attempts !== 1 && !verifiedDnsRetries) || !call.usage || call.usage.inputTokens === null || call.usage.outputTokens === null) return null;
  // Do not assume a missing cache field means a cache hit or a free input.
  const usage = { ...call.usage, cachedInputTokens: call.usage.cachedInputTokens ?? 0 };
  return estimateTokenCost(usage, REVIEWED_PRICE);
}

export class EvaluationBudget {
  private committed = 0;
  private reserved = 0;
  private halted = false;
  private readonly limitUnits: number;
  constructor(readonly limitCny: number) {
    if (!Number.isFinite(limitCny) || limitCny <= 0 || limitCny > 5) throw new Error("This reviewed runner supports a maximum approved budget of CNY 5");
    this.limitUnits = Math.floor(limitCny * 1_000_000_000);
  }
  claim(amount: number): boolean {
    const units = Math.ceil(amount * 1_000_000_000);
    if (!Number.isFinite(amount) || amount <= 0 || this.halted || this.committed + this.reserved + units > this.limitUnits - 10_000_000) return false;
    this.reserved += units;
    return true;
  }
  settle(reservation: number, measured: number | null) {
    this.reserved -= Math.ceil(reservation * 1_000_000_000);
    this.committed += Math.ceil((measured ?? reservation) * 1_000_000_000);
    if (measured === null || measured > reservation) this.halted = true;
  }
  snapshot() { return { limitCny: this.limitCny, upperAccountedCny: this.committed / 1_000_000_000, inFlightReservedCny: this.reserved / 1_000_000_000, haltedForUnknownOrExcessUsage: this.halted }; }
}
