import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blindReviewSheet, parseQualityRun, parseQualityTrials, summarizeQualityTrials, type QualityTrial } from "@/evals/r3/qualityReport";
import { qualityWorkflows, QUALITY_CANDIDATE_COMMIT, QUALITY_REFERENCE_COMMIT, QUALITY_EVALUATION_SETTINGS } from "@/evals/r3/qualityWorkflows";
import { QUALITY_DIMENSIONS } from "@/evals/r3/promptInventory";

function rows(reviewed = false): QualityTrial[] {
  return qualityWorkflows().flatMap((workflow) => Array.from({ length: 3 }, (_, repetition) => (["reference", "candidate"] as const).map((variant): QualityTrial => ({
    event: "trial", caseId: workflow.id, entry: workflow.entry, input: workflow.input, fixtureSha256: createHash("sha256").update(JSON.stringify({ entry: workflow.entry, input: workflow.input })).digest("hex"), variant, repetition: repetition + 1, contractPassed: true, observedError: null, wallTimeMs: 100,
    calls: [{ content: "合成回答，不是真实质量记录。", errorCode: null, actualModel: "test-model", telemetry: { id: "11111111-1111-4111-8111-111111111111", business: workflow.entry, providerOrigin: "https://api.deepseek.com", model: "deepseek-flash", startedAt: "2026-10-15T14:00:00.000Z", status: "completed", attempts: 1, durationMs: 100, firstTokenMs: 20, finishReason: "stop", errorCode: null, price: null, estimatedCost: null, usage: { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 800, uncachedInputTokens: 200, reasoningTokens: null } }, requestSha256: "a".repeat(64), reservedCny: 0.05, upperEstimatedCostCny: 0.001232 }],
    humanReview: { scores: Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [dimension, reviewed ? 4 : null])) as QualityTrial["humanReview"]["scores"], criticalFailure: reviewed ? false : null, rationale: reviewed ? "Synthetic test of gate calculations, not a real review" : null },
  })))).flat();
}

describe("R3.4 quality/cost report", () => {
  it("does not mix different thinking modes or template revisions on import or resume", () => {
    const header = { event: "start", referenceCommit: QUALITY_REFERENCE_COMMIT, candidateCommit: QUALITY_CANDIDATE_COMMIT, settings: QUALITY_EVALUATION_SETTINGS };
    expect(parseQualityRun(JSON.stringify(header)).trials).toEqual([]);
    expect(() => parseQualityRun(JSON.stringify({ ...header, settings: "default thinking" }))).toThrow();
    expect(() => parseQualityRun(JSON.stringify({ ...header, candidateCommit: "other" }))).toThrow();
    expect(() => parseQualityRun(JSON.stringify(rows()[0]))).toThrow();
  });
  it("does not turn empty or unscored data into a quality or free-cost pass", () => {
    expect(summarizeQualityTrials([])).toMatchObject({ complete: false, contractGate: "incomplete", humanQualityStatus: "not-reviewed", semanticGate: "not-reviewed", peakRateUpperEstimatedCny: null, criticalFailures: null });
    expect(summarizeQualityTrials(rows())).toMatchObject({ complete: true, contractGate: "passed", humanQualityStatus: "not-reviewed", semanticGate: "not-reviewed" });
  });
  it("requires the frozen 3.2/80% and 3.0 floor and never hides a critical failure behind averages", () => {
    const trials = rows(true);
    expect(summarizeQualityTrials(trials).semanticGate).toBe("thresholds-met-awaiting-acceptance");
    trials.find((trial) => trial.variant === "candidate")!.humanReview.criticalFailure = true;
    expect(summarizeQualityTrials(trials).semanticGate).toBe("failed");
    for (const trial of trials.filter((trial) => trial.variant === "candidate")) {
      trial.humanReview.criticalFailure = false;
      for (const dimension of QUALITY_DIMENSIONS) trial.humanReview.scores[dimension] = 3;
    }
    expect(summarizeQualityTrials(trials).semanticGate).toBe("failed");
  });
  it("flags dimension regression even when the overall candidate mean is high", () => {
    const trials = rows(true);
    for (const trial of trials.filter((trial) => trial.variant === "candidate")) trial.humanReview.scores.naturalness = 3;
    expect(summarizeQualityTrials(trials)).toMatchObject({ semanticGate: "needs-regression-review", dimensionRegressions: [expect.objectContaining({ dimension: "naturalness" })] });
  });
  it("counts supplementary model calls and preserves unknown costs instead of treating them as zero", () => {
    const trials = rows();
    trials[0].calls.push({ ...trials[0].calls[0], upperEstimatedCostCny: null });
    const report = summarizeQualityTrials(trials);
    expect(report.peakRateUpperEstimatedCny).toBeNull();
    expect(report.groups[0]).toMatchObject({ modelCalls: 16, peakRateUpperEstimatedCny: null });
  });
  it("rejects duplicate trials, changed inputs and mismatched fixture fingerprints", () => {
    const [trial] = rows();
    expect(() => parseQualityTrials([trial, trial].map((row) => JSON.stringify(row)).join("\n"))).toThrow("Duplicate");
    expect(() => parseQualityTrials(JSON.stringify({ ...trial, input: "changed" }))).toThrow();
    expect(() => parseQualityTrials(JSON.stringify({ ...trial, fixtureSha256: "0".repeat(64) }))).toThrow();
    expect(() => parseQualityTrials(JSON.stringify(trial))).not.toThrow();
    expect(() => parseQualityTrials(JSON.stringify({ ...trial, calls: [{ ...trial.calls[0], upperEstimatedCostCny: 0 }] }))).toThrow("cost");
    expect(() => parseQualityTrials(JSON.stringify({ ...trial, observedError: "PROVIDER_UNAVAILABLE" }))).toThrow("Inconsistent");
  });
  it("exports separate blind answers and mappings without labels or request metadata", () => {
    const sheet = blindReviewSheet(rows().slice(0, 12));
    expect(sheet.answers).toHaveLength(12);
    expect(Object.keys(sheet.mapping)).toHaveLength(12);
    expect(JSON.stringify(sheet.answers)).not.toMatch(/reference|candidate|requestSha256|promptVersion/u);
    expect(blindReviewSheet(rows().slice(0, 12))).toEqual(sheet);
  });
  it("does not count N/A-only rows as completed reviews or accept N/A without rationale", () => {
    const trials = rows(true);
    for (const trial of trials) for (const dimension of QUALITY_DIMENSIONS) trial.humanReview.scores[dimension] = "not-applicable";
    expect(summarizeQualityTrials(trials).semanticGate).toBe("not-reviewed");
  });
});
