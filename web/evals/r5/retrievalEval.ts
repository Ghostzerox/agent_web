import { cpus, platform, arch } from "node:os";
import { createKnowledgePrefilter, rankKnowledge, KNOWLEDGE_RETRIEVAL_VERSION } from "@/lib/knowledge/retrieval";
import { rankMemories } from "@/lib/memory/memoryRetrieval";
import { retrievalCorpus, retrievalCases, EVAL_OWNER, EVAL_COLLECTION, type EvalRecord } from "./retrievalCorpus";
const percentile = (values: number[], percentile: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * percentile) - 1)] ?? 0;
// Mirrors SQL filtering for the pure scorer benchmark; real Repository filtering is tested separately.
export function eligibleEvalRecords(records: EvalRecord[]) { return records.filter((record) => record.ownerId === EVAL_OWNER && record.collectionId === EVAL_COLLECTION && record.eligibleCollection && record.module === "professional" && record.sourceKind === "knowledge-document" && record.rootVersion === record.version); }
export function evaluateRetrieval(scale = 1) {
  const corpus = retrievalCorpus(scale); const eligible = eligibleEvalRecords(corpus); const cases = retrievalCases();
  const budget = { maxItems: 5, maxEstimatedTokens: 1800 }; const durations: number[] = [];
  const evaluated = cases.map((item) => {
    const started = performance.now();
    const candidates = eligible.filter(createKnowledgePrefilter(item.query));
    const result = candidates.length > 1000 ? { status: "too-broad", hits: [], estimatedTokens: 0 } : rankKnowledge(candidates, item.query, budget);
    const durationMs = performance.now() - started; durations.push(durationMs);
    const selected = result.hits.map((hit) => hit.chunkId);
    const recall = item.gold.length ? item.gold.filter((id) => selected.includes(id)).length / item.gold.length : null;
    const baseline = rankMemories(eligible.map((row) => ({ id: row.chunkId, userId: row.ownerId, candidateId: row.chunkId, sourceConversationId: null, sourceMessageId: null, content: `${row.title}\n${row.heading}\n${row.content}`, kind: "fact" as const, sensitivity: "low" as const, pinned: false, validUntil: null, version: row.version, useCount: 0, lastUsedAt: null, createdAt: new Date("2026-10-01T00:00:00Z"), updatedAt: new Date("2026-10-01T00:00:00Z") })), item.query, new Date("2026-10-16T00:00:00Z"), { limit: 5, tokenBudget: 1800 });
    const baselineRecall = item.gold.length ? item.gold.filter((id) => baseline.some((memory) => memory.id === id)).length / item.gold.length : null;
    const locatorCorrect = result.hits.every((hit) => eligible.some((row) => row.chunkId === hit.chunkId && row.version === hit.version && row.contentHash === hit.contentHash && hit.startLine >= row.startLine && hit.endLine <= row.endLine && row.content.includes(hit.content)));
    return { ...item, selected, status: result.status, recall, referenceMemoryAlgorithmRecall: baselineRecall, falseRetrieval: !item.gold.length && selected.length > 0, locatorCorrect, estimatedTokens: result.estimatedTokens, durationMs };
  });
  const answered = evaluated.filter((item) => item.recall !== null); const noAnswer = evaluated.filter((item) => item.group === "no-answer");
  const groups = [...new Set(cases.map((item) => item.group))].map((group) => { const rows = evaluated.filter((item) => item.group === group); const positive = rows.filter((item) => item.recall !== null); return { group, total: rows.length, recallAt5: positive.length ? positive.reduce((sum, item) => sum + item.recall!, 0) / positive.length : null, falseRetrievals: rows.filter((item) => item.falseRetrieval).length }; });
  return { version: KNOWLEDGE_RETRIEVAL_VERSION, corpusVersion: "synthetic/r5.3-v1", measurement: "pure-scorer-plus-equivalent-prefilter-not-database-or-network", environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown" }, documents: 100 * scale, chunks: corpus.length, eligibleChunks: eligible.length, queries: cases.length,
    summary: { recallAt5: answered.reduce((sum, item) => sum + item.recall!, 0) / answered.length, referenceMemoryAlgorithmRecall: answered.reduce((sum, item) => sum + item.referenceMemoryAlgorithmRecall!, 0) / answered.length, noAnswerFalseRetrievals: noAnswer.filter((item) => item.falseRetrieval).length, noAnswerCount: noAnswer.length, isolationLeaks: evaluated.filter((item) => item.group === "isolation" && item.falseRetrieval).length, staleDeletedHits: evaluated.filter((item) => item.group === "stale-deleted" && item.falseRetrieval).length, locatorFailures: evaluated.filter((item) => !item.locatorCorrect).length, firstQueryMs: durations[0], p50Ms: percentile(durations.slice(1), 0.5), p95Ms: percentile(durations.slice(1), 0.95), maxEstimatedTokens: Math.max(...evaluated.map((item) => item.estimatedTokens)), modelCalls: 0, embeddingCalls: 0, modelCostCny: 0 }, groups, cases: evaluated };
}
