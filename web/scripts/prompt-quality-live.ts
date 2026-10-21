import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { openSync, writeSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import type { ModelProvider, ModelStreamRequest } from "../lib/ai/server/modelProvider";
import type { ModelCallTelemetry } from "../lib/ai/modelUsage";
import { EvaluationBudget, measuredUpperCost, reserveCallCny, REVIEWED_PRICE } from "../evals/r3/qualityCost";
import { qualityWorkflows, loadReferenceModules, QUALITY_REFERENCE_COMMIT, QUALITY_CANDIDATE_COMMIT, QUALITY_EVALUATION_SETTINGS } from "../evals/r3/qualityWorkflows";
import { QUALITY_DIMENSIONS, PROMPT_SOURCE_FILES } from "../evals/r3/promptInventory";
import { parseQualityRun } from "../evals/r3/qualityReport";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const argument = (flag: string) => { const at = process.argv.indexOf(flag); return at < 0 ? undefined : process.argv[at + 1]; };
type BridgeResult = { content: string; errorCode: string | null; actualModel: string | null; telemetry: ModelCallTelemetry | null; network?: { acceptedResponses: number; dnsFailures: number } };

function bridge(request: ModelStreamRequest, maxOutputTokens: number): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "agent-web-web-1", "node", "--import", "tsx", "/tmp/r3-prompt-quality-worker.mjs"], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Evaluation bridge timed out")); }, 75000);
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    // Never echo Docker/Provider stderr, which might include operational details.
    child.stderr.resume();
    child.on("error", () => { clearTimeout(timeout); reject(new Error("Evaluation bridge unavailable")); });
    child.on("close", () => { clearTimeout(timeout); try { resolve(JSON.parse(output)); } catch { reject(new Error("Invalid evaluation bridge output")); } });
    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify({ request, maxOutputTokens, resolvedAddress: argument("--resolved-address") }));
  });
}

async function main() {
  const workflows = qualityWorkflows();
  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ status: "dry-run", realModelCalls: 0, cases: workflows.map(({ id, entry, input }) => ({ id, entry, input })), repetitions: 3, variants: 2, plannedCalls: workflows.length * 6, price: REVIEWED_PRICE, note: "Requires explicit --execute --budget-cny and a reviewed Docker-side bridge; no credential access in dry-run." }, null, 2));
    return;
  }
  const budget = new EvaluationBudget(Number(argument("--budget-cny")));
  const reviewedOn = argument("--pricing-reviewed-on") ?? REVIEWED_PRICE.asOf;
  if (new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date()) !== reviewedOn) throw new Error("Pricing must be re-verified for today's live evaluation before spending");
  const candidateCommit = argument("--candidate-commit") ?? QUALITY_CANDIDATE_COMMIT;
  const referenceDirectory = argument("--reference-dir");
  if (!referenceDirectory) throw new Error("Reference modules required");
  const referenceSources = ["lib/tasks/agentPromptGenerator.ts", "lib/tasks/personalBriefingGenerator.ts", "lib/tasks/bookRecommendationGenerator.ts", "lib/tasks/reflectionQuestionGenerator.ts", "lib/plugins/hostCapabilityAdapters.ts", "lib/game/gameTurnService.ts"];
  const referenceSourceHashes: Record<string, string> = {};
  for (const source of referenceSources) {
    const expected = execFileSync("git", ["show", `${QUALITY_REFERENCE_COMMIT}:web/${source}`], { encoding: "utf8", windowsHide: true }).replaceAll("\r\n", "\n").trimEnd();
    const actual = readFileSync(resolve(referenceDirectory, source.split("/").at(-1)!), "utf8").replaceAll("\r\n", "\n").trimEnd();
    if (expected !== actual) throw new Error("Reference source does not match pinned Git commit");
    referenceSourceHashes[source] = hash(actual);
  }
  const candidateSourceHashes: Record<string, string> = {};
  for (const source of PROMPT_SOURCE_FILES) {
    const expected = execFileSync("git", ["show", `${candidateCommit}:web/${source}`], { encoding: "utf8", windowsHide: true }).replaceAll("\r\n", "\n").trimEnd();
    const actual = readFileSync(resolve(source), "utf8").replaceAll("\r\n", "\n").trimEnd();
    if (expected !== actual) throw new Error("Candidate source does not match pinned Git commit");
    candidateSourceHashes[source] = hash(actual);
  }
  const output = argument("--output");
  const outputRoot = resolve(".r3-eval");
  if (!output || !resolve(output).startsWith(`${outputRoot}${sep}`)) throw new Error("An explicit new .r3-eval output artifact is required");
  // Machine-generated test artifact, like a test reporter: exclusive create, never overwrite a prior run.
  const artifact = openSync(resolve(output), "wx", 0o600);
  const emit = (record: Record<string, unknown>) => {
    writeSync(artifact, `${JSON.stringify(record)}\n`);
    console.log(JSON.stringify(record.event === "trial" ? { event: "trial", caseId: record.caseId, variant: record.variant, repetition: record.repetition, contractPassed: record.contractPassed, observedError: record.observedError } : record));
  };
  const reference = await loadReferenceModules(referenceDirectory);
  const family = argument("--family");
  const focus = argument("--cases")?.split(",");
  const selected = workflows.filter((item) => (!family || item.entry === family) && (!focus || focus.includes(item.id)));
  if (!selected.length) throw new Error("No selected workflows");
  const resumeInput = argument("--resume-input");
  if (resumeInput && candidateCommit !== QUALITY_CANDIDATE_COMMIT) throw new Error("Focused retests cannot inherit historical candidates");
  const inherited = resumeInput ? parseQualityRun(readFileSync(resumeInput, "utf8")).trials : [];
  const inheritedKeys = new Set(inherited.map((row) => `${row.caseId}/${row.variant}/${row.repetition}`));
  const repetitions = Number(argument("--repetitions") ?? 3);
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 3) throw new Error("Invalid repetitions");
  const variants = process.argv.includes("--candidate-only") ? ["candidate"] : ["reference", "candidate"];
  const queue = selected.flatMap((workflow) => Array.from({ length: repetitions }, (_, index) => variants.map((variant) => ({ workflow, repetition: index + 1, variant })))).flat().filter((job) => !inheritedKeys.has(`${job.workflow.id}/${job.variant}/${job.repetition}`));
  const records: Array<Record<string, unknown>> = [...inherited];
  emit({ event: "start", referenceCommit: QUALITY_REFERENCE_COMMIT, candidateCommit, referenceSourceHashes, candidateSourceHashes, plannedNewTrials: queue.length, inheritedTrials: inherited.length, inheritedArtifactSha256: resumeInput ? hash(readFileSync(resumeInput, "utf8")) : null, budgetCny: budget.limitCny, price: { ...REVIEWED_PRICE, asOf: reviewedOn }, dnsFallback: argument("--resolved-address") ? "host-resolved-IPv4-with-normal-TLS-verification" : null, settings: QUALITY_EVALUATION_SETTINGS, scope: focus || variants.length === 1 || repetitions !== 3 ? "focused-retest-not-canonical-comparison" : "canonical" });
  for (const trial of inherited) writeSync(artifact, `${JSON.stringify(trial)}\n`);
  async function worker() {
    while (queue.length) {
      const job = queue.shift()!;
      const calls: Array<BridgeResult & { requestSha256: string; reservedCny: number; upperEstimatedCostCny: number | null }> = [];
      let contractPassed = false;
      let observedError: string | null = null;
      const started = Date.now();
      const provider: ModelProvider = { async *stream(request) {
        // Explicit paid-evaluation reservation only; never an application default.
        const maxOutputTokens = 4096;
        const reservation = reserveCallCny(request.messages, maxOutputTokens);
        if (!budget.claim(reservation)) throw new Error("EVALUATION_BUDGET_STOP");
        let result: BridgeResult;
        try { result = await bridge(request, maxOutputTokens); }
        catch { result = { content: "", telemetry: null, actualModel: null, errorCode: "EVALUATION_BRIDGE_FAILED" }; }
        const measured = measuredUpperCost(result.telemetry, result.network);
        budget.settle(reservation, measured);
        calls.push({ ...result, requestSha256: hash(request.messages), reservedCny: reservation, upperEstimatedCostCny: measured });
        if (result.errorCode) throw new Error(result.errorCode);
        yield { type: "delta", text: result.content };
        yield { type: "done" };
      } };
      try { await job.workflow.run(provider, job.variant === "reference" ? reference : undefined); contractPassed = true; }
      catch (error) { observedError = error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error && /^[A-Z_]+$/u.test(error.message) ? error.message : "OUTPUT_CONTRACT_FAILED"; }
      const record = { event: "trial", caseId: job.workflow.id, entry: job.workflow.entry, input: job.workflow.input, fixtureSha256: hash({ entry: job.workflow.entry, input: job.workflow.input }), variant: job.variant, repetition: job.repetition, contractPassed, observedError, wallTimeMs: Date.now() - started, calls, humanReview: { scores: Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [dimension, null])), criticalFailure: null, rationale: null } };
      records.push(record);
      emit(record);
      if (observedError === "EVALUATION_BUDGET_STOP" || budget.snapshot().haltedForUnknownOrExcessUsage) queue.length = 0;
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  emit({ event: "complete", finishedTrials: records.length, realModelCalls: records.reduce((sum, record) => sum + (record.calls as unknown[]).length, 0), contractPasses: records.filter((record) => record.contractPassed).length, budget: budget.snapshot(), humanQualityStatus: "not-reviewed", priceStatus: "peak-rate-upper-estimate-not-account-invoice" });
}
main().catch(() => { console.error("Prompt quality evaluation could not run; credentials and operational details were not printed."); process.exitCode = 1; });
