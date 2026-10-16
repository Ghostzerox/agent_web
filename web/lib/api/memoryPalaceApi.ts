import { z } from "zod";
import { getDatabase } from "@/lib/db/client";
import { getPluginCapabilityGateway } from "@/lib/plugins/capabilityGateway";
import { createMemorizationService } from "@/lib/memorization/service";
import { createMemoryPalaceRepository } from "@/lib/repositories/memoryPalaceRepository";
import { PALACE_MODULES, PalaceError } from "@/lib/memory/palace";
type Port = ReturnType<typeof createMemoryPalaceRepository>;
export function createMemoryPalaceApi(repo: Port) {
  return { async handle(request: Request, path: string[] = []) {
    const headers = { "cache-control": "no-store", "x-request-id": crypto.randomUUID() };
    try {
      const method = request.method; let body: unknown;
      if (["POST", "PATCH", "DELETE"].includes(method)) { const raw = await request.text(); if (new TextEncoder().encode(raw).length > 30000) throw new PalaceError("请求过大。", 413); body = JSON.parse(raw); }
      let data: unknown;
      if (path.length === 0 && method === "GET") data = await repo.list();
      else if (path.length === 0 && method === "POST") data = await repo.create(body);
      else if (path.length === 1 && path[0] === "catalog" && method === "GET") data = await repo.catalog(z.enum(PALACE_MODULES).parse(new URL(request.url).searchParams.get("module")));
      else {
        const id = z.uuid().parse(path[0]);
        if (path.length === 1 && method === "GET") data = await repo.get(id);
        else if (path.length === 1 && method === "PATCH") data = await repo.mutate(id, body);
        else if (path.length === 1 && method === "DELETE") { await repo.delete(id, z.object({ expectedVersion: z.number().int().positive() }).strict().parse(body).expectedVersion); data = { deleted: true }; }
        else if (path.length === 3 && path[1] === "loci" && method === "GET") data = await repo.resolve(id, z.uuid().parse(path[2]));
        else if (path.length === 2 && path[1] === "route" && method === "POST") { const input = z.object({ roomId: z.uuid(), strategy: z.enum(["ordered", "random", "weak", "due"]), seed: z.string().min(1).max(120), count: z.number().int().min(1).max(24) }).strict().parse(body); data = await repo.route(id, input.roomId, input.strategy, input.seed, input.count); }
        else if (path.length === 2 && path[1] === "review" && method === "POST") { const input = z.object({ locusId: z.uuid(), expectedVersion: z.number().int().positive(), expectedStorageVersion: z.number().int().positive(), recitation: z.string().trim().min(1).max(4000) }).strict().parse(body); data = await repo.review(id, input.locusId, input.expectedVersion, input.expectedStorageVersion, input.recitation); }
        else throw new PalaceError("不支持的宫殿操作。", 405);
      }
      return Response.json({ data }, { headers });
    } catch (error) {
      const invalid = error instanceof z.ZodError || error instanceof SyntaxError; const known = error instanceof PalaceError;
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (code.includes("VERSION_CONFLICT")) return Response.json({ error: { code: "PALACE_CONFLICT", message: "材料已变化或本题可能已提交，请核对复习记录后再试；不会自动重复评分。", retryable: false } }, { headers, status: 409 });
      const plugin = /PLUGIN|CAPABILITY|QUOTA/u.test(code);
      return Response.json({ error: { code: known ? "PALACE_CONFLICT" : invalid ? "INVALID_REQUEST" : plugin ? "LEARNING_UNAVAILABLE" : "PALACE_FAILED", message: known ? error.message : invalid ? "输入不符合宫殿格式。" : plugin ? "背书插件未授权、已停用或额度不可用；请到插件页核对，不会绕过授权读取材料。" : "宫殿操作失败，请稍后重试；未改原始资料。", retryable: false } }, { headers, status: known ? error.status : invalid ? 400 : plugin ? 403 : 500 });
    }
  } };
}
export function getMemoryPalaceApi() { return createMemoryPalaceApi(createMemoryPalaceRepository(getDatabase(), createMemorizationService(() => getPluginCapabilityGateway()))); }
