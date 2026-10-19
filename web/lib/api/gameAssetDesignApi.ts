import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createGameAssetDesignRepository, type GameAssetDesignRepository } from "@/lib/repositories/gameAssetDesignRepository";
import { createAssetGenerationService } from "@/lib/game/worlds/assetGeneration";
import { confirmAssetDesignSchema } from "@/lib/game/worlds/assetContracts";
import { assetDesignIssues } from "@/lib/game/worlds/assetValidation";
import { WorldDesignError } from "@/lib/game/worlds/contracts";
import { ExplorationError } from "@/lib/game/exploration/contracts";
import { GameNarrativeGenerationError } from "@/lib/game/gameNarrativeGenerator";

export function createGameAssetDesignApi(repository: GameAssetDesignRepository, generator = createAssetGenerationService(repository)) {
  return async (request: Request, parts: string[] = []) => {
    const requestId = crypto.randomUUID();
    const respond = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-request-id": requestId } });
    try {
      const [id, action] = parts;
      if (parts.length > 2) return respond({ error: { code: "NOT_FOUND", message: "设计入口不存在。" } }, 404);
      if (id) z.uuid().parse(id);
      if (request.method === "GET" && !id) return respond({ data: await repository.list(z.uuid().parse(new URL(request.url).searchParams.get("worldId"))) });
      if (request.method === "GET" && id && !action) {
        const row = await repository.get(id); const world = await repository.worldAt(row.worldId);
        return respond({ data: { ...row, currentWorldVersion: world.version, issues: assetDesignIssues(row.sourceSnapshot.input, row.sourceSnapshot.content, row.content) } });
      }
      if (!["POST", "PATCH"].includes(request.method)) return respond({ error: { code: "METHOD_NOT_ALLOWED", message: "不支持此操作。" } }, 405);
      let input: unknown;
      try { input = await request.json(); } catch { return respond({ error: { code: "INVALID_JSON", message: "请输入有效JSON。" } }, 400); }
      let result: unknown;
      if (request.method === "POST" && !id) result = await repository.create(input);
      else if (request.method === "PATCH" && id && !action) result = await repository.update(id, input);
      else if (request.method === "POST" && id && action === "generate") result = await generator.generate(id, input, request.signal);
      else if (request.method === "POST" && id && (action === "confirm" || action === "rebase")) {
        const parsed = confirmAssetDesignSchema.parse(input);
        result = action === "confirm" ? await repository.confirm(id, parsed.expectedVersion, parsed.expectedWorldVersion) : await repository.rebase(id, parsed.expectedVersion, parsed.expectedWorldVersion);
      } else return respond({ error: { code: "NOT_FOUND", message: "设计入口不存在。" } }, 404);
      return respond({ data: result }, request.method === "POST" ? 201 : 200);
    } catch (error) {
      if (error instanceof ZodError) return respond({ error: { code: "INVALID_REQUEST", message: "设计字段或确认信息无效，请检查非空字段与容量。", details: error.issues, retryable: false } }, 400);
      if (error instanceof WorldDesignError) return respond({ error: { code: error.code, message: error.message, retryable: false } }, error.code === "WORLD_NOT_FOUND" ? 404 : error.code === "WORLD_VERSION_CONFLICT" ? 409 : 422);
      if (error instanceof ExplorationError) return respond({ error: { code: "WORLD_INVALID", message: error.message, retryable: false } }, 422);
      if (error instanceof GameNarrativeGenerationError) return respond({ error: { code: error.code, message: error.message, retryable: false } }, 502);
      console.error(`[asset-design:${requestId}] Failed`, { name: error instanceof Error ? error.name : "UnknownError" });
      return respond({ error: { code: "INTERNAL_ERROR", message: "设计未完成；原稿和世界保留，请检查后手动重试。", retryable: false } }, 500);
    }
  };
}
export function getGameAssetDesignApi() { return createGameAssetDesignApi(createGameAssetDesignRepository(getDatabase())); }
