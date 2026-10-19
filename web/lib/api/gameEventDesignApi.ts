import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { gameSessions, gameWorldDrafts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { createGameEventDesignRepository, type GameEventDesignRepository } from "@/lib/repositories/gameEventDesignRepository";
import { createEventGenerationService } from "@/lib/game/events/generation";
import { confirmEventSchema, EventDesignError } from "@/lib/game/events/contracts";
import { eventDesignIssues } from "@/lib/game/events/validation";
import { ExplorationError } from "@/lib/game/exploration/contracts";
import { WorldDesignError } from "@/lib/game/worlds/contracts";

export function createGameEventDesignApi(repository: GameEventDesignRepository, generation = createEventGenerationService(repository)) {
  const view = async (row: Awaited<ReturnType<GameEventDesignRepository["get"]>>) => {
    const { sourceSnapshot, ...data } = row; const template = sourceSnapshot.template; const db = repository.database();
    const source = row.worldId ? (await db.select({ version: gameWorldDrafts.version }).from(gameWorldDrafts).where(and(eq(gameWorldDrafts.id, row.worldId), eq(gameWorldDrafts.userId, LOCAL_USER_ID))))[0]
      : (await db.select({ version: gameSessions.version, activeLeafTurnId: gameSessions.activeLeafTurnId }).from(gameSessions).where(and(eq(gameSessions.id, row.sessionId!), eq(gameSessions.userId, LOCAL_USER_ID))))[0];
    return { ...data, currentSourceVersion: source?.version ?? null, currentParentTurnId: source && "activeLeafTurnId" in source ? source.activeLeafTurnId : null,
      context: sourceSnapshot.context, issues: eventDesignIssues(row.content, template),
      references: { locations: template.locations.map(({ id, name }) => ({ id, name })), characters: [{ id: "player", name: "玩家" }, ...template.characters.map(({ card }) => ({ id: card.id, name: card.name }))],
        items: template.items.map(({ id, name }) => ({ id, name })), lore: template.lore.map(({ id }) => ({ id })), numericPolicy: template.numericPolicy, magic: template.acquisitionRules?.magic ?? "unspecified" } };
  };
  return async (request: Request, parts: string[] = []) => {
    const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
    try {
      const [id, action] = parts; if (parts.length > 2) throw new EventDesignError("EVENT_NOT_FOUND", "事件入口不存在。"); if (id) z.uuid().parse(id);
      if (request.method === "GET" && !id) { const params = new URL(request.url).searchParams;
        const source = params.has("worldId") ? { worldId: z.uuid().parse(params.get("worldId")) } : { sessionId: z.uuid().parse(params.get("sessionId")), parentTurnId: z.uuid().parse(params.get("parentTurnId")) };
        return respond({ data: await repository.list(source) }); }
      if (request.method === "GET" && id && !action) return respond({ data: await view(await repository.get(id)) });
      if (!["POST", "PATCH"].includes(request.method)) return respond({ error: { code: "METHOD_NOT_ALLOWED", message: "不支持此操作。" } }, 405);
      let body: unknown; try { body = await request.json(); } catch { return respond({ error: { code: "INVALID_JSON", message: "请输入有效JSON。" } }, 400); }
      let row;
      if (!id && request.method === "POST") row = await repository.create(body);
      else if (id && !action && request.method === "PATCH") row = await repository.update(id, body);
      else if (id && action === "generate" && request.method === "POST") row = await generation.generate(id, body, request.signal);
      else if (id && action === "stop" && request.method === "POST") { z.object({ confirmed: z.literal(true) }).strict().parse(body); row = await repository.stopGeneration(id); }
      else if (id && action === "confirm" && request.method === "POST") { const input = confirmEventSchema.parse(body); row = await repository.confirm(id, input.expectedVersion, input.expectedSourceVersion); }
      else if (id && action === "rebase" && request.method === "POST") { const input = confirmEventSchema.extend({ parentTurnId: z.uuid().optional() }).parse(body); row = await repository.rebase(id, input.expectedVersion, input.expectedSourceVersion, input.parentTurnId); }
      else throw new EventDesignError("EVENT_NOT_FOUND", "事件入口不存在。");
      return respond({ data: await view(row) });
    } catch (error) {
      if (error instanceof ZodError) return respond({ error: { code: "INVALID_REQUEST", message: "事件结构、字段或确认信息无效。", retryable: false } }, 400);
      if (error instanceof EventDesignError) return respond({ error: { code: error.code, message: error.message, retryable: false } }, error.code === "EVENT_NOT_FOUND" ? 404 : error.code === "EVENT_CONFLICT" ? 409 : 422);
      if (error instanceof ExplorationError || error instanceof WorldDesignError) return respond({ error: { code: error.code, message: error.message, retryable: false } }, error instanceof WorldDesignError && error.code === "WORLD_NOT_FOUND" ? 404 : 422);
      console.error("[event-design] Failed", { name: error instanceof Error ? error.name : "UnknownError" });
      return respond({ error: { code: "INTERNAL_ERROR", message: "事件操作未完成；原稿保留，请重读回执。", retryable: false } }, 500);
    }
  };
}
export const getGameEventDesignApi = () => createGameEventDesignApi(createGameEventDesignRepository(getDatabase()));
