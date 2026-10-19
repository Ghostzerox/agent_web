import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createGameWorldRepository, type GameWorldRepository } from "@/lib/repositories/gameWorldRepository";
import { createWorldGenerationService } from "@/lib/game/worlds/generation";
import { worldDraftIssues } from "@/lib/game/worlds/compile";
import { createWorldSaveSchema, publishWorldSchema, WorldDesignError } from "@/lib/game/worlds/contracts";
import { GameNarrativeGenerationError } from "@/lib/game/gameNarrativeGenerator";
import { ExplorationError } from "@/lib/game/exploration/contracts";

export function createGameWorldApi(repository: GameWorldRepository,
  generator = createWorldGenerationService(repository)) {
  return async (request: Request, parts: string[] = []): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
    try {
      const [id, action] = parts;
      if (parts.length > 2) return response({ error: { code: "NOT_FOUND", message: "入口不存在。" } }, 404);
      if (id) z.uuid().parse(id);
      if (request.method === "GET" && !id) return response({ data: await repository.list() });
      if (request.method === "GET" && id && !action) {
        const draft = await repository.get(id);
        return response({ data: { ...draft, issues: worldDraftIssues(draft.input, draft.content), revisions: await repository.revisions(id) } });
      }
      if (request.method === "GET" || !["POST", "PATCH"].includes(request.method)) return response({ error: { code: "METHOD_NOT_ALLOWED", message: "不支持此操作。" } }, 405);
      let input: unknown;
      try { input = await request.json(); } catch { return response({ error: { code: "INVALID_JSON", message: "请输入有效JSON。" } }, 400); }
      let result: unknown;
      if (request.method === "POST" && !id) result = await repository.create(input);
      else if (request.method === "PATCH" && id && !action) result = await repository.update(id, input);
      else if (request.method === "POST" && id && action === "generate") result = await generator.generate(id, input, request.signal);
      else if (request.method === "POST" && id && action === "publish") {
        const parsed = publishWorldSchema.parse(input); result = await repository.publish(id, parsed.expectedVersion);
      } else if (request.method === "POST" && id && action === "saves") {
        const parsed = createWorldSaveSchema.parse(input); result = await repository.createSave(id, parsed.revision, parsed.requestId);
      } else return response({ error: { code: "NOT_FOUND", message: "入口不存在。" } }, 404);
      return response({ data: result }, request.method === "POST" ? 201 : 200);
    } catch (error) {
      if (error instanceof ExplorationError) return response({ error: { code: "WORLD_INVALID", message: error.message, retryable: false } }, 422);
      if (error instanceof ZodError) return response({ error: { code: "INVALID_REQUEST", message: "草稿字段或确认信息无效。", details: error.issues, retryable: false } }, 400);
      if (error instanceof WorldDesignError) return response({ error: { code: error.code, message: error.message, retryable: false } },
        error.code === "WORLD_NOT_FOUND" ? 404 : error.code === "WORLD_VERSION_CONFLICT" ? 409 : 422);
      if (error instanceof GameNarrativeGenerationError) return response({ error: { code: error.code, message: error.message, retryable: error.retryable } }, 502);
      console.error(`[world-api:${requestId}] Failed`, { name: error instanceof Error ? error.name : "UnknownError" });
      return response({ error: { code: "INTERNAL_ERROR", message: "世界操作未完成；原草稿保留，请检查后手动重试。", retryable: true } }, 500);
    }
  };
}
export function getGameWorldApi() { return createGameWorldApi(createGameWorldRepository(getDatabase())); }
