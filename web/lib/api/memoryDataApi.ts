import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createMemoryDataRepository, MemoryDataError } from "@/lib/repositories/memoryDataRepository";
import { createMemoryControlRepository, MemoryControlError } from "@/lib/repositories/memoryControlRepository";
import { memoryControlsSchema } from "@/lib/memory/controls";
export function createMemoryDataApi(data: ReturnType<typeof createMemoryDataRepository>, controls: ReturnType<typeof createMemoryControlRepository>) {
  return { async handle(request: Request, path: string[] = []) {
    const headers = { "cache-control": "no-store", "x-request-id": crypto.randomUUID() };
    try {
      let body: unknown;
      if (request.method !== "GET") { const text = await request.text(); if (new TextEncoder().encode(text).length > 30000) throw new MemoryDataError("请求过大。", 413); body = JSON.parse(text); }
      let result: unknown;
      if (path.length === 1 && request.method === "GET" && path[0] === "manifest") result = await data.manifest();
      else if (path.length === 1 && request.method === "GET" && path[0] === "usage") result = await data.usage();
      else if (path.length === 1 && request.method === "GET" && path[0] === "controls") result = await controls.get();
      else if (path.length === 1 && request.method === "PATCH" && path[0] === "controls") { const input = z.object({ settings: memoryControlsSchema, expectedVersion: z.number().int().min(0) }).strict().parse(body); result = await controls.update(input.settings, input.expectedVersion); }
      else if (path.length === 1 && request.method === "POST" && path[0] === "export") result = await data.export(body);
      else throw new MemoryDataError("不存在此操作；文件预演没有恢复/覆盖接口。", 405);
      return Response.json({ data: result }, { headers });
    } catch (error) {
      const known = error instanceof MemoryDataError || error instanceof MemoryControlError;
      const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
      return Response.json({ error: { code: known ? "MEMORY_DATA_CONFLICT" : invalid ? "INVALID_REQUEST" : "MEMORY_DATA_UNAVAILABLE", message: known ? error.message : invalid ? "输入格式不正确。" : "服务端数据暂不可用，请稍后重试；未显示成功或自动重复提交。", retryable: !known && !invalid } }, { headers, status: known ? error.status : invalid ? 400 : 503 });
    }
  } };
}
export function getMemoryDataApi() { const db = getDatabase(); return createMemoryDataApi(createMemoryDataRepository(db), createMemoryControlRepository(db)); }
