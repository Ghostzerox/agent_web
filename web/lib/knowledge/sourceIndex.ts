import { createHash } from "node:crypto";
import { splitDocument, KNOWLEDGE_CHUNK_STRATEGY, type DocumentInput } from "./documents";
import { stableJson } from "@/lib/ai/stableJson";
export const sourceHash = (text: string) => createHash("sha256").update(text).digest("hex");
export function documentSourceHash(input: DocumentInput) { return sourceHash(stableJson({ ...input, strategy: KNOWLEDGE_CHUNK_STRATEGY })); }
export function sourceSegments(content: string) { return splitDocument(content).map((part) => ({ ...part, contentHash: sourceHash(part.content) })); }
export function fallbackChunkId(documentId: string, version: number, ordinal: number) {
  const hex = sourceHash(`${documentId}/${version}/${ordinal}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function isMissingDerivedIndex(error: unknown): boolean {
  const value = error as { code?: string; cause?: unknown } | null;
  return value?.code === "42P01" || Boolean(value?.cause && isMissingDerivedIndex(value.cause));
}
