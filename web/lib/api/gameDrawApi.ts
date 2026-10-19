import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createGameDrawRepository, type GameDrawRepository } from "@/lib/repositories/gameDrawRepository";
import { createDrawGenerationService } from "@/lib/game/draws/generation";
import { DrawError } from "@/lib/game/draws/contracts";
import { itemDesignSchema } from "@/lib/game/worlds/assetContracts";
import { ExplorationError } from "@/lib/game/exploration/contracts";
import { WorldDesignError } from "@/lib/game/worlds/contracts";

const confirm = z.object({ expectedVersion: z.number().int().positive(), confirmed: z.literal(true) }).strict();
export function createGameDrawApi(repository: GameDrawRepository, generation = createDrawGenerationService(repository)) {
  return async (request: Request, parts: string[] = []) => {
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
    try {
      const [id, action] = parts; if (parts.length > 2) throw new DrawError("DRAW_NOT_FOUND", "获取入口不存在。");
      if (id) z.uuid().parse(id);
      if (request.method === "GET" && !id) {
        const params = new URL(request.url).searchParams;
        return respond({ data: await repository.list(z.uuid().parse(params.get("sessionId")), z.uuid().parse(params.get("parentTurnId"))) });
      }
      if (request.method === "GET" && id && !action) return respond({ data: await repository.get(id) });
      if (request.method !== "POST" && request.method !== "PATCH") return respond({ error: { code: "METHOD_NOT_ALLOWED", message: "不支持此操作。" } }, 405);
      let body: unknown; try { body = await request.json(); } catch { return respond({ error: { code: "INVALID_JSON", message: "请输入有效JSON。" } }, 400); }
      let data;
      if (!id && request.method === "POST") {
        const input = z.object({ sessionId: z.uuid(), input: z.unknown() }).strict().parse(body); data = await repository.prepare(input.sessionId, input.input);
      } else if (id && request.method === "PATCH" && !action) {
        const input = z.object({ expectedVersion: z.number().int().positive(), item: itemDesignSchema }).strict().parse(body); data = await repository.edit(id, input.expectedVersion, input.item);
      } else if (id && request.method === "POST" && action === "generate") data = await generation.generate(id, body, request.signal);
      else if (id && request.method === "POST" && action === "settle") { const input = confirm.parse(body); data = await repository.settle(id, input.expectedVersion); }
      else if (id && request.method === "POST" && action === "cancel") { z.object({ confirmed: z.literal(true) }).strict().parse(body); data = await repository.cancel(id); }
      else throw new DrawError("DRAW_NOT_FOUND", "获取入口不存在。");
      return respond({ data });
    } catch (error) {
      if (error instanceof ZodError) return respond({ error: { code: "INVALID_REQUEST", message: "抽取字段 / 确认无效，请检查数量与物品格式。", retryable: false } }, 400);
      if (error instanceof DrawError) return respond({ error: { code: error.code, message: error.message, retryable: false } }, error.code === "DRAW_NOT_FOUND" ? 404 : error.code === "DRAW_CONFLICT" ? 409 : 422);
      if (error instanceof ExplorationError || error instanceof WorldDesignError) return respond({ error: { code: error.code, message: error.message, retryable: false } }, 422);
      console.error("[item-draw] Failed", { name: error instanceof Error ? error.name : "UnknownError" });
      return respond({ error: { code: "INTERNAL_ERROR", message: "操作未完成，请重读服务端回执；不要重新抽样。", retryable: false } }, 500);
    }
  };
}
export const getGameDrawApi = () => createGameDrawApi(createGameDrawRepository(getDatabase()));
