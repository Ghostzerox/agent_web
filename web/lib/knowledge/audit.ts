import type { MemoryModuleId } from "@/lib/memory/domainPolicy";
import type { KnowledgeRetrievalResult } from "./retrieval";
export type KnowledgeRunContext = { consumer: MemoryModuleId; collectionIds: string[]; result: KnowledgeRetrievalResult };
/** Metadata only: no query, title, excerpt or document body. */
export type KnowledgeRetrievalAudit = {
  schemaVersion: 1; strategyVersion: string; consumer: MemoryModuleId; collectionIds: string[];
  status: KnowledgeRetrievalResult["status"]; candidateCount: number; estimatedTokens: number; durationMs: number;
  sources: Array<{ documentId: string; chunkId: string; collectionId: string; version: number; contentHash: string; chunkHash: string; startLine: number; endLine: number; rank: number; score: number }>;
};
export function knowledgeAudit(context: KnowledgeRunContext): KnowledgeRetrievalAudit {
  return { schemaVersion: 1, strategyVersion: context.result.version, consumer: context.consumer, collectionIds: context.collectionIds, status: context.result.status, candidateCount: context.result.candidateCount, estimatedTokens: context.result.estimatedTokens, durationMs: context.result.durationMs,
    sources: context.result.hits.map((hit, index) => ({ documentId: hit.documentId, chunkId: hit.chunkId, collectionId: hit.collectionId, version: hit.version, contentHash: hit.contentHash, chunkHash: hit.chunkHash, startLine: hit.startLine, endLine: hit.endLine, rank: index + 1, score: hit.score })) };
}
