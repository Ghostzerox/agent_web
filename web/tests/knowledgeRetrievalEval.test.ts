import { describe, expect, it } from "vitest";
import { eligibleEvalRecords, evaluateRetrieval } from "@/evals/r5/retrievalEval";
import { retrievalCases, retrievalCorpus } from "@/evals/r5/retrievalCorpus";
describe("frozen synthetic retrieval regression", () => {
  it("retains all 80 gold queries, the 1,000-chunk corpus and counterexamples", () => {
    const cases = retrievalCases(); expect(cases).toHaveLength(80);
    expect(new Set(cases.map((item) => item.id)).size).toBe(80);
    expect(cases.filter((item) => item.group === "isolation")).toHaveLength(16);
    expect(cases.filter((item) => item.group === "no-answer")).toHaveLength(12);
    expect(retrievalCorpus()).toHaveLength(1000);
    expect(eligibleEvalRecords(retrievalCorpus()).every((row) => row.module === "professional" && row.rootVersion === row.version && row.sourceKind === "knowledge-document")).toBe(true);
  });
  it("meets fixed lexical regression gates while reporting genuine implicit-paraphrase misses", () => {
    const result = evaluateRetrieval();
    expect(result.summary.recallAt5).toBeGreaterThanOrEqual(0.85);
    expect(result.summary.noAnswerFalseRetrievals).toBe(0);
    expect(result.summary.isolationLeaks).toBe(0);
    expect(result.summary.staleDeletedHits).toBe(0);
    expect(result.summary.locatorFailures).toBe(0);
    expect(result.summary.modelCalls).toBe(0);
    expect(result.cases.filter((item) => item.recall !== null && item.recall < 1).map((item) => item.id)).toEqual(["paraphrase-9", "paraphrase-10", "paraphrase-11", "paraphrase-12"]);
  });
});
