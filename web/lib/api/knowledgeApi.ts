import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createKnowledgeRepository, KnowledgeError, type KnowledgeRepository } from "@/lib/repositories/knowledgeRepository";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";
import { collectionInputSchema, documentInputSchema } from "@/lib/knowledge/documents";
import { createKnowledgeRetrievalRepository, knowledgeSearchInputSchema } from "@/lib/repositories/knowledgeRetrievalRepository";

type Port = Pick<KnowledgeRepository<PgQueryResultHKT>, "listCollections" | "createCollection" | "updateCollection" | "deleteCollection" | "listDocuments" | "getDocument" | "saveDocument" | "deleteDocument" | "rebuildDocument">;
const version = z.number().int().positive();
export function createKnowledgeApi(repository: Port | (() => Port), retrieval?: Pick<ReturnType<typeof createKnowledgeRetrievalRepository>, "search"> | (() => Pick<ReturnType<typeof createKnowledgeRetrievalRepository>, "search">)) {
  return { async handle(request: Request, path: string[] = []) {
    const requestId = crypto.randomUUID();
    const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
    try {
      const method = request.method;
      let body: unknown;
      if (["POST", "PATCH", "DELETE"].includes(method)) {
        if (Number(request.headers.get("content-length")) > 700_000) return reply({ error: { code: "INVALID_REQUEST", message: "请求过大。", requestId, retryable: false } }, 413);
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > 700_000) return reply({ error: { code: "INVALID_REQUEST", message: "请求过大。", requestId, retryable: false } }, 413);
        try { body = JSON.parse(raw); } catch { return reply({ error: { code: "INVALID_JSON", message: "请输入有效 JSON。", requestId, retryable: false } }, 400); }
      }
      const repo = typeof repository === "function" ? repository() : repository;
      let result: unknown;
      if (path.length === 1 && path[0] === "search" && method === "POST") {
        const query = knowledgeSearchInputSchema.parse(body);
        if (!retrieval) throw new KnowledgeError("KNOWLEDGE_CONFLICT", "资料库检索暂不可用。");
        result = await (typeof retrieval === "function" ? retrieval() : retrieval).search(query);
      }
      else if (path.length === 3 && path[0] === "documents" && path[2] === "rebuild" && method === "POST") result = await repo.rebuildDocument(z.uuid().parse(path[1]), z.object({ expectedVersion: version }).strict().parse(body).expectedVersion);
      else if (path.length === 0 && method === "GET") result = await repo.listCollections();
      else if (path.length === 0 && method === "POST") result = await repo.createCollection(collectionInputSchema.parse(body));
      else if (path[0] === "collections" && (path.length === 2 || (path.length === 3 && path[2] === "documents"))) {
        const id = z.uuid().parse(path[1]);
        if (path.length === 3 && method === "GET") result = await repo.listDocuments(id);
        else if (path.length === 3 && method === "POST") result = await repo.saveDocument(id, documentInputSchema.parse(body));
        else if (path.length === 2 && method === "PATCH") {
          const input = collectionInputSchema.omit({ module: true }).extend({ expectedVersion: version }).parse(body);
          const { expectedVersion, ...values } = input;
          result = await repo.updateCollection(id, values, expectedVersion);
        } else if (path.length === 2 && method === "DELETE") { const input = z.object({ expectedVersion: version }).strict().parse(body); await repo.deleteCollection(id, input.expectedVersion); result = { deleted: true }; }
        else return reply({ error: { code: "INVALID_REQUEST", message: "不支持的集合操作。", requestId, retryable: false } }, 405);
      } else if (path[0] === "documents" && path.length === 2) {
        const id = z.uuid().parse(path[1]);
        if (method === "GET") { const requestedVersion = new URL(request.url).searchParams.get("version"); result = requestedVersion === null ? await repo.getDocument(id) : await repo.getDocument(id, z.coerce.number().int().positive().parse(requestedVersion)); }
        else if (method === "PATCH") {
          const { expectedVersion, ...input } = documentInputSchema.extend({ expectedVersion: version }).parse(body);
          const existing = await repo.getDocument(id);
          result = await repo.saveDocument(existing.collectionId, input, { id, expectedVersion });
        } else if (method === "DELETE") { const input = z.object({ expectedVersion: version }).strict().parse(body); await repo.deleteDocument(id, input.expectedVersion); result = { deleted: true }; }
        else return reply({ error: { code: "INVALID_REQUEST", message: "不支持的文档操作。", requestId, retryable: false } }, 405);
      } else return reply({ error: { code: "INVALID_REQUEST", message: "找不到知识库操作。", requestId, retryable: false } }, 404);
      return reply({ data: result });
    } catch (error) {
      const known = error instanceof KnowledgeError;
      const invalid = error instanceof z.ZodError;
      return reply({ error: { code: known ? error.code : invalid ? "INVALID_REQUEST" : "INTERNAL_ERROR", message: known ? error.message : invalid ? "输入不符合知识库规范。" : "知识库操作失败，请稍后重试。", requestId, retryable: !known && !invalid } }, known ? error.code === "KNOWLEDGE_NOT_FOUND" ? 404 : 409 : invalid ? 400 : 500);
    }
  } };
}
export function getKnowledgeApi() { return createKnowledgeApi(() => createKnowledgeRepository(getDatabase()), () => createKnowledgeRetrievalRepository(getDatabase())); }
