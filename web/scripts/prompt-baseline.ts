import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { comparePromptBaselines, promptBaselineSnapshot, runPromptBaseline } from "../evals/r3/promptBaseline";

// This command has no paid mode. Never resolve real credentials or load .env files.
globalThis.fetch = async () => { throw new Error("Network access is forbidden in the offline prompt baseline."); };
async function main() {
  const result = await runPromptBaseline();
  if (process.argv.includes("--candidate")) {
    console.log(JSON.stringify(promptBaselineSnapshot(result), null, 2));
  } else if (process.argv.includes("--review-sheet")) {
    console.log(JSON.stringify({ version: result.version, baselineSourceCommit: result.baselineSourceCommit, currentSourceHashes: result.sourceHashes, status: "not-run", provider: null, model: null, runDate: null, approvedBudget: null,
      cases: result.cases.map(({ id, fixtureSha256, requestSha256, input, criteria }) => ({ id, fixtureSha256, requestSha256, input, criteria, scores: Object.fromEntries(result.humanReview.dimensions.map((dimension) => [dimension, null])), criticalFailure: null, rationale: null, actualInputTokens: null, actualOutputTokens: null, actualCost: null })) }, null, 2));
  } else {
    const baseline = JSON.parse(readFileSync(new URL("../evals/r3/baseline-r6.json", import.meta.url), "utf8"));
    const tasks = JSON.parse(readFileSync(new URL("../evals/r3/baseline-r3.3.json", import.meta.url), "utf8"));
    const previous = JSON.parse(readFileSync(new URL("../evals/r3/baseline-r3.2.json", import.meta.url), "utf8"));
    const original = JSON.parse(readFileSync(new URL("../evals/r3/baseline.json", import.meta.url), "utf8"));
    const drift = !isDeepStrictEqual(baseline, promptBaselineSnapshot(result));
    console.log(JSON.stringify({ ...result, baselineDrift: drift, comparisonToR31: comparePromptBaselines(original, promptBaselineSnapshot(result)), comparisonToR32: comparePromptBaselines(previous, promptBaselineSnapshot(result)), comparisonToR33: comparePromptBaselines(tasks, promptBaselineSnapshot(result)) }, null, 2));
    if (drift) process.exitCode = 1;
  }
  if (result.passed !== result.total) process.exitCode = 1;
}
main().catch(() => { console.error("Offline prompt baseline failed. No real Provider was used."); process.exitCode = 1; });
