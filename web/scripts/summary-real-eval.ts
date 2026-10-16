// Explicit paid synthetic probe. Credentials stay in the server container. No private chat is read.
import { summaryFixture } from "../evals/r5/summaryFixtures";
import { validateSummary, DEFAULT_SUMMARY_SETTINGS, SUMMARY_INSTRUCTION, SUMMARY_POLICY, summaryLayer } from "../lib/conversation/summary";
import { resolveModelProviderConfig } from "../lib/ai/server/modelCredentialService";
import { OpenAICompatibleProvider, type ModelStreamRequest } from "../lib/ai/server/modelProvider";
import { resolveGenerationBudget } from "../lib/ai/server/tokenBudget";
import type { ModelCallTelemetry } from "../lib/ai/modelUsage";
import { createModelUsageRepository } from "../lib/repositories/modelUsageRepository";
import { getDatabase } from "../lib/db/client";
async function main() {
  if (!process.argv.includes("--allow-paid-0.20-cny")) throw new Error("Paid probe requires explicit flag and a prior ¥0.20 reservation from the shared ledger.");
  const config = await resolveModelProviderConfig();
  const priorCost = Number(process.argv.find((arg) => arg.startsWith("--prior-cost="))?.split("=")[1] ?? 0);
  if (!Number.isFinite(priorCost) || priorCost < 0 || priorCost >= 0.20) throw new Error("Invalid prior batch cost; no calls made.");
  if (new URL(config.baseUrl).origin !== "https://api.deepseek.com" || config.model !== "deepseek-flash") throw new Error("Unverified model price: no calls made.");
  const f = summaryFixture(); const calls: Array<ModelCallTelemetry & { conservativeCostCny: number }> = []; let reserved = 0; const outputs: Record<string, unknown> = {};
  const provider = new OpenAICompatibleProvider(config, async (call) => {
    const usage = call.usage;
    // Verified 2026-10-16 official CNY peak prices: miss 2/M, hit .04/M, output 8/M.
    const cost = usage?.inputTokens != null && usage.outputTokens != null ? ((usage.inputTokens - (usage.cachedInputTokens ?? 0)) * 2 + (usage.cachedInputTokens ?? 0) * 0.04 + usage.outputTokens * 8) / 1e6 : reserved;
    calls.push({ ...call, conservativeCostCny: cost }); await createModelUsageRepository(getDatabase()).record(call);
  });
  async function generate(name: string, request: ModelStreamRequest, output: number) {
    const budget = resolveGenerationBudget(config, request.business ?? "chat"); budget.maxOutputTokens = output; budget.tokenParameter = "max_tokens";
    reserved = (request.messages.reduce((n, m) => n + new TextEncoder().encode(JSON.stringify(m)).length + 32, 0) * 2 + output * 8) / 1e6;
    if (priorCost + calls.reduce((n, c) => n + c.conservativeCostCny, 0) + reserved > 0.20 || calls.length >= 3) throw new Error("Probe budget reached; no further calls.");
    let text = ""; let done = false;
    for await (const event of provider.stream({ ...request, generationBudget: budget }, AbortSignal.timeout(90000))) { if (event.type === "delta") text += event.text; else done = true; }
    if (!done) throw new Error("Incomplete probe; no automatic retry.");
    const result = JSON.parse(text.trim().replace(/^```(?:json)?\s*/u, "").replace(/\s*```$/u, "")); outputs[name] = result; return result;
  }
  let failure: string | null = null;
  try {
    const summary = validateSummary(await generate("summary", { business: "context-summary", promptVersion: SUMMARY_POLICY, messages: [{ role: "system", content: `${SUMMARY_INSTRUCTION}\nJSON总长度不超过5000字符。` }, { role: "user", content: JSON.stringify(f.sources.map(({ id, role, content }) => ({ id, role, content }))) }] }, 2048), f.sources, DEFAULT_SUMMARY_SETTINGS);
    const prefix = { role: "system" as const, content: "你是精确的计划核对助手。只输出JSON，不添加未知事实。" };
    const question = { role: "user" as const, content: f.question };
    await generate("rawAnswer", { business: "chat", messages: [prefix, ...f.rows.map(({ role, content }) => ({ role: role as "user" | "assistant", content })), question] }, 2048);
    const layer = summaryLayer(summary);
    await generate("compactAnswer", { business: "chat", messages: [prefix, { role: layer.role, content: layer.content }, ...f.rows.slice(f.sources.length).map(({ role, content }) => ({ role: role as "user" | "assistant", content })), question] }, 2048);
  } catch { failure = "Probe failed output/timeout/source/quality validation; no automatic retry. See completed synthetic outputs and conservative cost."; }
  const matches = (value: unknown) => JSON.stringify(value && Object.fromEntries(Object.keys(f.gold).map((k) => [k, (value as Record<string, unknown>)[k]]))) === JSON.stringify(f.gold);
  const total = calls.reduce((n, c) => n + c.conservativeCostCny, 0);
  const summaryCost = calls[0]?.conservativeCostCny ?? null; const raw = calls[1]?.conservativeCostCny ?? null; const compact = calls[2]?.conservativeCostCny ?? null;
  console.log(JSON.stringify({ kind: "one-synthetic-paired-probe-not-general-quality-or-production-net-savings", date: new Date().toISOString(), model: config.model, priceSource: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/", prices: { inputPerMillion: 2, cachedInputPerMillion: 0.04, outputPerMillion: 8, currency: "CNY", basis: "peak-upper-bound-not-account-bill" }, reservedBudgetCny: 0.20, spentUpperCny: total, failure, rawAnswerMatchesGold: matches(outputs.rawAnswer), compactAnswerMatchesGold: matches(outputs.compactAnswer), costs: { summary: summaryCost, raw: raw, compact, firstUseTotal: summaryCost !== null && compact !== null ? summaryCost + compact : null, conditionalBreakEvenUses: summaryCost !== null && raw !== null && compact !== null && raw > compact ? Math.ceil(summaryCost / (raw - compact)) : null }, outputs, calls }, null, 2));
  if (failure || !matches(outputs.rawAnswer) || !matches(outputs.compactAnswer)) process.exitCode = 1;
}
void main().then(() => process.exit(process.exitCode ?? 0)).catch(() => { console.error("Paid probe stopped; inspect the reserved ledger and model telemetry before any retry. No credentials printed."); process.exit(1); });
