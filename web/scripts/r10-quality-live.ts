import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, writeSync, closeSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelCallTelemetry } from "../lib/ai/modelUsage";
import type { ModelStreamRequest } from "../lib/ai/server/modelProvider";
import { EvaluationBudget, measuredUpperCost, reserveCallCny, REVIEWED_PRICE } from "../evals/r3/qualityCost";
import { runCreationQuality, runWorldFullQuality, syntheticQualityReply } from "../evals/r10/creationQuality";

const argument = (flag: string) => { const index = process.argv.indexOf(flag); return index < 0 ? undefined : process.argv[index + 1]; };
type Result = { content: string; errorCode: string | null; actualModel: string | null; telemetry: ModelCallTelemetry | null; network?: { acceptedResponses: number; dnsFailures: number } };
function bridge(request: ModelStreamRequest, maxOutputTokens: number): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "agent-web-web-1", "node", "--import", "tsx", "/tmp/r3-prompt-quality-worker.mjs"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = ""; const timeout = setTimeout(() => { child.kill(); reject(new Error("BRIDGE_TIMEOUT")); }, 75000);
    child.stdout.on("data", (chunk) => { output += String(chunk); }); child.stderr.resume(); child.stdin.on("error", () => undefined);
    child.on("error", () => { clearTimeout(timeout); reject(new Error("BRIDGE_UNAVAILABLE")); });
    child.on("close", () => { clearTimeout(timeout); try { resolve(JSON.parse(output)); } catch { reject(new Error("BRIDGE_INVALID_OUTPUT")); } });
    child.stdin.end(JSON.stringify({ request, maxOutputTokens, resolvedAddress: argument("--resolved-address") }));
  });
}
async function main() {
  const run = process.argv.includes("--world-full") ? runWorldFullQuality : runCreationQuality;
  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ mode: "offline", ...(await run(async (_id, request) => syntheticQualityReply(request))), realModelCalls: 0 })); return;
  }
  const limit = Number(argument("--budget-cny")); if (!(limit > 0 && limit <= 0.50)) throw new Error("This batch is capped at CNY 0.50 from the shared remaining budget");
  const reviewedOn = argument("--pricing-reviewed-on");
  if (new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date()) !== reviewedOn) throw new Error("Reverify official model prices today before spending");
  const budget = new EvaluationBudget(limit);
  // Exclusive new synthetic artifact; never overwrite previous/partial cost evidence.
  const file = openSync(resolve("evals/r10", `quality-live-${Date.now()}.jsonl`), "wx", 0o600);
  const emit = (entry: object) => writeSync(file, `${JSON.stringify(entry)}\n`);
  emit({ event: "start", date: new Date().toISOString(), scope: "one-synthetic-journey-not-general-quality-or-net-savings", budgetCny: limit,
    price: { ...REVIEWED_PRICE, asOf: reviewedOn }, settings: { thinking: "disabled-for-controlled-probe-only", syntheticDataOnly: true, applicationDefaultsChanged: false,
      automaticBatchRetries: false, transportRetries: "existing-provider-policy; recorded in telemetry.attempts" } });
  let failure: string | null = null; let journey: unknown = null;
  try {
    journey = await run(async (id, request) => {
      const serialized = JSON.stringify(request);
      if (id.startsWith("actor-")) {
        if (/SYNTH_HOST_ONLY|SYNTH_CHARACTER_HOST_ONLY|SYNTH_PRIVATE_THOUGHT|SYNTH_OOC/u.test(serialized)) throw new Error("ACTOR_REQUEST_SCOPE_FAILED");
        if (id === "actor-before-knowledge" && serialized.includes("SYNTH_PORT_RUMOR")) throw new Error("FUTURE_KNOWLEDGE_LEAK");
        if (id === "actor-after-sourced-rumor" && (!serialized.includes("SYNTH_PORT_RUMOR") || !serialized.includes("rumor"))) throw new Error("MISSING_SOURCED_RUMOR");
      }
      // A paid test reservation, not a production output default.
      const maxOutputTokens = process.argv.includes("--world-full") ? 4096 : 3072; const reservation = reserveCallCny(request.messages, maxOutputTokens);
      if (!budget.claim(reservation)) throw new Error("BUDGET_STOP");
      emit({ event: "reserved", id, reservationCny: reservation, requestSha256: createHash("sha256").update(serialized).digest("hex") });
      let result: Result = { content: "", errorCode: "BRIDGE_FAILED", actualModel: null, telemetry: null };
      try { result = await bridge(request, maxOutputTokens); }
      finally {
        const measured = measuredUpperCost(result.telemetry, result.network); budget.settle(reservation, measured);
        emit({ event: "response", id, request, requestCharacters: serialized.length, maxOutputTokens, reservationCny: reservation, upperCostCny: measured,
          ...result, review: { by: null, assessment: null }, budget: budget.snapshot() });
        console.log(JSON.stringify({ id, error: result.errorCode, upperCostCny: measured, budget: budget.snapshot() }));
      }
      if (result.errorCode || budget.snapshot().haltedForUnknownOrExcessUsage) throw new Error(result.errorCode ?? "UNKNOWN_OR_EXCESS_COST");
      return result.content;
    });
  } catch (error) { failure = error instanceof Error ? error.message : "PROBE_FAILED"; process.exitCode = 1; }
  finally { const final = { event: "complete", failure, journey, budget: budget.snapshot() }; emit(final); closeSync(file); console.log(JSON.stringify(final)); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "PROBE_SETUP_FAILED"); process.exitCode = 1; });
