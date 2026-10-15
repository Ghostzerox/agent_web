import { z } from "zod";
import { createHash } from "node:crypto";
import { modelCallSchema } from "@/lib/ai/modelUsage";
import { qualityWorkflows, QUALITY_CANDIDATE_COMMIT, QUALITY_REFERENCE_COMMIT, QUALITY_EVALUATION_SETTINGS } from "./qualityWorkflows";
import { QUALITY_DIMENSIONS } from "./promptInventory";
import { measuredUpperCost, REVIEWED_PRICE } from "./qualityCost";

const trialSchema = z.object({
  event: z.literal("trial"), caseId: z.string(), entry: z.string(), input: z.string(), fixtureSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  variant: z.enum(["reference", "candidate"]), repetition: z.number().int().min(1).max(3), contractPassed: z.boolean(), observedError: z.string().nullable(), wallTimeMs: z.number().finite().nonnegative(),
  calls: z.array(z.object({ content: z.string(), errorCode: z.string().nullable(), actualModel: z.string().nullable(), telemetry: modelCallSchema.nullable(), network: z.object({ acceptedResponses: z.number().int().nonnegative(), dnsFailures: z.number().int().nonnegative() }).optional(), requestSha256: z.string().regex(/^[a-f0-9]{64}$/u), reservedCny: z.number().finite().positive(), upperEstimatedCostCny: z.number().finite().nonnegative().nullable() }).strict()),
  humanReview: z.object({ scores: z.record(z.enum(QUALITY_DIMENSIONS), z.union([z.number().min(0).max(4), z.literal("not-applicable")]).nullable()), criticalFailure: z.boolean().nullable(), rationale: z.string().nullable() }).strict(),
}).strict();
export type QualityTrial = z.infer<typeof trialSchema>;

export function parseQualityRun(jsonl: string) {
  const header = z.object({ event: z.literal("start"), referenceCommit: z.literal(QUALITY_REFERENCE_COMMIT), candidateCommit: z.literal(QUALITY_CANDIDATE_COMMIT), settings: z.literal(QUALITY_EVALUATION_SETTINGS) }).parse(JSON.parse(jsonl.split(/\r?\n/u).find((line) => line.trim()) ?? "null"));
  return { header, trials: parseQualityTrials(jsonl) };
}

export function parseQualityTrials(jsonl: string): QualityTrial[] {
  const keys = new Set<string>();
  const workflows = new Map(qualityWorkflows().map((item) => [item.id, item]));
  return jsonl.split(/\r?\n/u).filter((line) => line.trim()).flatMap((line) => {
    const raw: unknown = JSON.parse(line);
    if (!raw || typeof raw !== "object" || !("event" in raw) || raw.event !== "trial") return [];
    const trial = trialSchema.parse(raw);
    const fixture = workflows.get(trial.caseId);
    if (!fixture || fixture.entry !== trial.entry || fixture.input !== trial.input) throw new Error("Unrecognized or changed quality fixture");
    if (createHash("sha256").update(JSON.stringify({ entry: trial.entry, input: trial.input })).digest("hex") !== trial.fixtureSha256) throw new Error("Quality fixture fingerprint mismatch");
    for (const call of trial.calls) {
      const expectedCost = measuredUpperCost(call.telemetry, call.network);
      if ((expectedCost === null) !== (call.upperEstimatedCostCny === null) || (expectedCost !== null && Math.abs(expectedCost - call.upperEstimatedCostCny!) > 1e-10)) throw new Error("Quality cost does not match recorded usage");
    }
    if (trial.contractPassed && (!trial.calls.length || trial.observedError !== null || trial.calls.some((call) => call.errorCode !== null || call.telemetry?.status !== "completed"))) throw new Error("Inconsistent contract completion record");
    const key = `${trial.caseId}/${trial.variant}/${trial.repetition}`;
    if (keys.has(key)) throw new Error("Duplicate quality trial");
    keys.add(key);
    return [trial];
  });
}

const percentile = (values: number[], quantile: number) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * quantile) - 1)] : null;
export function summarizeQualityTrials(trials: readonly QualityTrial[]) {
  const workflows = qualityWorkflows();
  const groups = [...new Set(workflows.map((item) => item.entry))].flatMap((entry) => (["reference", "candidate"] as const).map((variant) => {
    const rows = trials.filter((trial) => trial.entry === entry && trial.variant === variant);
    const calls = rows.flatMap((trial) => trial.calls);
    const sumKnown = (field: "inputTokens" | "outputTokens" | "cachedInputTokens" | "reasoningTokens") => calls.length && calls.every((call) => call.telemetry?.usage?.[field] !== null && call.telemetry?.usage?.[field] !== undefined) ? calls.reduce((sum, call) => sum + call.telemetry!.usage![field]!, 0) : null;
    const upperCost = calls.length && calls.every((call) => call.upperEstimatedCostCny !== null) ? calls.reduce((sum, call) => sum + call.upperEstimatedCostCny!, 0) : null;
    const inputTokens = sumKnown("inputTokens");
    const cachedInputTokens = sumKnown("cachedInputTokens");
    return { entry, variant, cases: new Set(rows.map((trial) => trial.caseId)).size, trials: rows.length, expectedTrials: 15, contractPasses: rows.filter((trial) => trial.contractPassed).length, contractPassRate: rows.length ? rows.filter((trial) => trial.contractPassed).length / rows.length : null,
      modelCalls: calls.length, transportAttempts: calls.reduce((sum, call) => sum + (call.telemetry?.attempts ?? 0), 0), inputTokens, outputTokens: sumKnown("outputTokens"), cachedInputTokens, reasoningTokens: sumKnown("reasoningTokens"), cacheHitRate: inputTokens && cachedInputTokens !== null ? cachedInputTokens / inputTokens : null,
      peakRateUpperEstimatedCny: upperCost, accountedWithUnknownReservationsCny: calls.reduce((sum, call) => sum + (call.upperEstimatedCostCny ?? call.reservedCny), 0),
      medianWallTimeMs: percentile(rows.map((trial) => trial.wallTimeMs), 0.5), p95WallTimeMs: percentile(rows.map((trial) => trial.wallTimeMs), 0.95),
      errors: rows.filter((trial) => !trial.contractPassed).map(({ caseId, repetition, observedError }) => ({ caseId, repetition, observedError })),
    };
  }));
  const candidate = trials.filter((trial) => trial.variant === "candidate");
  const structuredCandidate = candidate.filter((trial) => trial.entry !== "chat" && trial.entry !== "agent-task");
  const structuredCandidatePassRate = structuredCandidate.length ? structuredCandidate.filter((trial) => trial.contractPassed).length / structuredCandidate.length : null;
  const complete = groups.every((group) => group.trials === group.expectedTrials && group.cases === 5) && trials.every((trial) => trial.calls.length > 0);
  const humanComplete = trials.length > 0 && trials.every((trial) => trial.humanReview.criticalFailure !== null && trial.humanReview.rationale?.trim() && Object.values(trial.humanReview.scores).every((score) => score !== null) && Object.values(trial.humanReview.scores).some((score) => typeof score === "number"));
  const caseScores = workflows.map((workflow) => {
    const rows = candidate.filter((trial) => trial.caseId === workflow.id);
    const values = rows.flatMap((trial) => Object.values(trial.humanReview.scores).filter((score): score is number => typeof score === "number"));
    return { caseId: workflow.id, mean: humanComplete && rows.length === 3 && values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
  });
  const semanticThresholdMet = humanComplete && complete && caseScores.every((row) => row.mean !== null && row.mean >= 3) && caseScores.filter((row) => row.mean !== null && row.mean >= 3.2).length / caseScores.length >= 0.8 && !candidate.some((trial) => trial.humanReview.criticalFailure);
  const dimensionRegressions = humanComplete && complete ? QUALITY_DIMENSIONS.flatMap((dimension) => {
    const mean = (variant: "reference" | "candidate") => {
      const values = trials.filter((trial) => trial.variant === variant).map((trial) => trial.humanReview.scores[dimension]).filter((score): score is number => typeof score === "number");
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    const reference = mean("reference");
    const candidate = mean("candidate");
    return reference !== null && candidate !== null && candidate < reference ? [{ dimension, reference, candidate, status: "needs-explanation-and-confirmation" }] : [];
  }) : [];
  const costsKnown = groups.every((group) => group.peakRateUpperEstimatedCny !== null);
  const actualModels = [...new Set(trials.flatMap((trial) => trial.calls.map((call) => call.actualModel)).filter(Boolean))];
  return { version: "r3.4/quality-cost-v1", referenceCommit: QUALITY_REFERENCE_COMMIT, candidateCommit: QUALITY_CANDIDATE_COMMIT,
    evaluation: "controlled-non-thinking-synthetic-closed-world", expectedTrials: 270, trials: trials.length, complete,
    actualModels, price: REVIEWED_PRICE, groups,
    candidateContractPassRate: candidate.length ? candidate.filter((trial) => trial.contractPassed).length / candidate.length : null,
    structuredCandidatePassRate,
    contractGate: complete ? structuredCandidatePassRate !== null && structuredCandidatePassRate >= 0.95 ? "passed" : "failed" : "incomplete",
    candidateFamiliesBelow95: groups.filter((group) => group.variant === "candidate" && group.contractPassRate !== null && group.contractPassRate < 0.95).map((group) => group.entry),
    humanQualityStatus: humanComplete ? "review-recorded-not-automatically-approved" : "not-reviewed",
    semanticGate: !complete || !humanComplete ? "not-reviewed" : !semanticThresholdMet ? "failed" : dimensionRegressions.length ? "needs-regression-review" : "thresholds-met-awaiting-acceptance",
    caseScores, dimensionRegressions,
    criticalFailures: !trials.length || trials.some((trial) => trial.humanReview.criticalFailure === null) ? null : trials.filter((trial) => trial.humanReview.criticalFailure).length,
    peakRateUpperEstimatedCny: costsKnown ? groups.reduce((sum, group) => sum + group.peakRateUpperEstimatedCny!, 0) : null,
    accountedWithUnknownReservationsCny: groups.reduce((sum, group) => sum + group.accountedWithUnknownReservationsCny, 0),
    limitations: ["Contract pass is not semantic correctness or a human score.", "Closed-world synthetic sources do not validate live news, real book bibliographies, images, long-context continuity or provider-default thinking mode.", "Reported prices use verified peak rates as an upper estimate; this is not an account invoice or a guarantee about future prices.", "Raw answers remain in the local ignored .r3-eval folder; no private conversation or real user task is used.", "Reasoning tokens are already part of output tokens, never charged twice."] };
}

export function blindReviewSheet(trials: readonly QualityTrial[]) {
  // No variant/version/request metadata is included with an answer; keep the mapping separately.
  const mapping: Record<string, string> = {};
  const order = (trial: QualityTrial) => createHash("sha256").update(`r3.4/review-order-v1/${trial.caseId}/${trial.variant}/${trial.repetition}`).digest("hex");
  const answers = [...trials].sort((left, right) => order(left).localeCompare(order(right))).map((trial, index) => {
    const reviewId = `answer-${String(index + 1).padStart(3, "0")}`;
    mapping[reviewId] = `${trial.caseId}/${trial.variant}/${trial.repetition}`;
    return { reviewId, task: trial.input, answer: trial.calls.map((call) => call.content).join("\n\n"), scores: Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [dimension, null])), criticalFailure: null, rationale: null };
  });
  return { answers, mapping };
}
