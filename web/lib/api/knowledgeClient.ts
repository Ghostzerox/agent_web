import { requestJson } from "@/lib/api/jsonRequest";
import type { CollectionInput, DocumentInput } from "@/lib/knowledge/documents";
export type KnowledgeCollection = CollectionInput & { id: string; version: number; updatedAt: string };
export type KnowledgeDocumentSummary = Omit<DocumentInput, "content"> & { id: string; collectionId: string; version: number; contentHash: string; updatedAt: string };
export type KnowledgeDocument = KnowledgeDocumentSummary & { content: string; chunkStrategy: string; indexUnavailable?: boolean; chunks: { id: string; ordinal: number; content: string; startLine: number; endLine: number; heading: string; documentVersion: number }[] };
async function request<T>(path = "", method = "GET", body?: unknown): Promise<T> {
  return requestJson("/api/v1/knowledge"+path, { method, cache: "no-store", ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
    { fallbackMessage: "知识库连接失败，请重试。" });
}
export const knowledgeClient = {
  collections: () => request<KnowledgeCollection[]>(),
  createCollection: (input: CollectionInput) => request<KnowledgeCollection>("", "POST", input),
  updateCollection: (id: string, input: { title: string; description: string; expectedVersion: number }) => request<KnowledgeCollection>(`/collections/${id}`, "PATCH", input),
  deleteCollection: (id: string, expectedVersion: number) => request(`/collections/${id}`, "DELETE", { expectedVersion }),
  documents: (id: string) => request<KnowledgeDocumentSummary[]>(`/collections/${id}/documents`),
  document: (id: string, version?: number) => request<KnowledgeDocument>(`/documents/${id}${version === undefined ? "" : `?version=${version}`}`),
  rebuild: (id: string, expectedVersion: number) => request<{ documentId: string; version: number; rebuilt: boolean; chunks: number }>(`/documents/${id}/rebuild`, "POST", { expectedVersion }),
  search: (input: { consumer: CollectionInput["module"]; collectionIds: string[]; query: string }) => request<import("@/lib/knowledge/retrieval").KnowledgeRetrievalResult>("/search", "POST", input),
  save: (collectionId: string, input: DocumentInput) => request<{ id: string; duplicate: boolean }>(`/collections/${collectionId}/documents`, "POST", input),
  update: (id: string, input: DocumentInput & { expectedVersion: number }) => request<{ id: string; duplicate: boolean }>(`/documents/${id}`, "PATCH", input),
  delete: (id: string, expectedVersion: number) => request(`/documents/${id}`, "DELETE", { expectedVersion }),
};
