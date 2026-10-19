import { and, desc, eq, sql } from "drizzle-orm";
import { stableJson } from "@/lib/ai/stableJson";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { gameAssetDesigns as designs, gameWorldDrafts as worlds } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { createAssetDesignSchema, updateAssetDesignSchema, type AssetField } from "@/lib/game/worlds/assetContracts";
import { blankAssetDesign } from "@/lib/game/worlds/assetBlueprint";
import { worldBlueprintSchema, WorldDesignError } from "@/lib/game/worlds/contracts";
import { assetDesignIssues } from "@/lib/game/worlds/assetValidation";
import { compileWorld } from "@/lib/game/worlds/compile";
import { startWorld } from "@/lib/game/exploration/engine";

export function createGameAssetDesignRepository<H extends PgQueryResultHKT>(db: PgDatabase<H, typeof schema>) {
  const get = async (id: string) => {
    const [row] = await db.select().from(designs).where(and(eq(designs.id, id), eq(designs.userId, LOCAL_USER_ID)));
    if (!row) throw new WorldDesignError("WORLD_NOT_FOUND", "设计草稿不存在或无权访问。"); return row;
  };
  const worldAt = async (id: string, version?: number) => {
    const [world] = await db.select().from(worlds).where(and(eq(worlds.id, id), eq(worlds.userId, LOCAL_USER_ID)));
    if (!world) throw new WorldDesignError("WORLD_NOT_FOUND", "所属世界不存在。");
    if (version !== undefined && world.version !== version) throw new WorldDesignError("WORLD_VERSION_CONFLICT", "世界草稿已变化；请先审阅并重新绑定，旧设计仍保留。");
    if (!world.content) throw new WorldDesignError("WORLD_INVALID", "先填写并保存结构化世界草稿，再设计道具或人物。");
    return { ...world, content: worldBlueprintSchema.parse(world.content) };
  };
  return {
    get, worldAt,
    async list(worldId: string) {
      await worldAt(worldId);
      return db.select({ id: designs.id, name: sql<string>`${designs.content}->>'name'`, kind: sql<"item" | "character">`${designs.content}->>'kind'`,
        version: designs.version, sourceWorldVersion: designs.sourceWorldVersion, appliedWorldVersion: designs.appliedWorldVersion }).from(designs)
        .where(and(eq(designs.worldId, worldId), eq(designs.userId, LOCAL_USER_ID))).orderBy(desc(designs.updatedAt)).limit(100);
    },
    async create(raw: unknown) {
      const input = createAssetDesignSchema.parse(raw); const world = await worldAt(input.worldId, input.expectedWorldVersion);
      const existing = input.kind === "item" ? world.content.items.definitions.find((item) => item.id === input.targetId)
        : world.content.characters.find((person) => person.id === input.targetId);
      if (input.targetId && !existing && !(input.kind === "character" && input.targetId === "player")) throw new WorldDesignError("WORLD_NOT_FOUND", "要重新设计的定义不存在。");
      const content = existing ?? blankAssetDesign(input.kind, input.targetId ?? `${input.kind}-${crypto.randomUUID().slice(0, 8)}`, world.input, world.content);
      return (await db.insert(designs).values({ worldId: input.worldId, userId: LOCAL_USER_ID, brief: input.brief, content,
        sourceWorldVersion: world.version, sourceSnapshot: { input: world.input, content: world.content } }).returning())[0];
    },
    async update(id: string, raw: unknown, generated?: { receipt: { requestId: string; fingerprint: string }; fields: AssetField[] }) {
      const input = updateAssetDesignSchema.parse(raw); const previous = await get(id);
      if (previous.appliedWorldVersion) throw new WorldDesignError("WORLD_INVALID", "已纳入世界的设计只读；重新设计请创建新稿。");
      if (previous.content.id !== input.content.id || previous.content.kind !== input.content.kind) throw new WorldDesignError("WORLD_INVALID", "设计的稳定ID和类别不能被改写。");
      const origins = { ...previous.origins };
      for (const field of new Set([...Object.keys(previous.content), ...Object.keys(input.content)] as AssetField[])) if (stableJson(previous.content[field as keyof typeof previous.content]) !== stableJson(input.content[field as keyof typeof input.content])) origins[field] = generated?.fields.includes(field) ? "ai" : "user";
      if (generated) for (const field of generated.fields) origins[field] = "ai";
      const [row] = await db.update(designs).set({ brief: input.brief, content: input.content, lockedFields: [...new Set(input.lockedFields)], origins,
        generationReceipt: generated?.receipt ?? null, version: sql`${designs.version} + 1`, updatedAt: new Date() })
        .where(and(eq(designs.id, id), eq(designs.userId, LOCAL_USER_ID), eq(designs.version, input.expectedVersion), sql`${designs.appliedWorldVersion} IS NULL`)).returning();
      if (!row) throw new WorldDesignError("WORLD_VERSION_CONFLICT", "设计已更新；保留本地编辑，请审阅后重读。"); return row;
    },
    async rebase(id: string, expectedVersion: number, expectedWorldVersion: number) {
      const previous = await get(id); if (previous.appliedWorldVersion) throw new WorldDesignError("WORLD_INVALID", "已确认设计不能重新绑定。");
      const world = await worldAt(previous.worldId, expectedWorldVersion);
      const [row] = await db.update(designs).set({ sourceWorldVersion: world.version, sourceSnapshot: { input: world.input, content: world.content },
        generationReceipt: null, version: sql`${designs.version} + 1`, updatedAt: new Date() }).where(and(eq(designs.id, id), eq(designs.userId, LOCAL_USER_ID), eq(designs.version, expectedVersion), sql`${designs.appliedWorldVersion} IS NULL`)).returning();
      if (!row) throw new WorldDesignError("WORLD_VERSION_CONFLICT", "设计已更新，请重读后重新适配。"); return row;
    },
    async confirm(id: string, expectedVersion: number, expectedWorldVersion: number) {
      const initial = await get(id);
      return db.transaction(async (tx) => {
        // Always lock world before design; concurrent designs cannot silently merge into an old world version.
        const [world] = await tx.select().from(worlds).where(and(eq(worlds.id, initial.worldId), eq(worlds.userId, LOCAL_USER_ID))).for("update");
        const [row] = await tx.select().from(designs).where(and(eq(designs.id, id), eq(designs.userId, LOCAL_USER_ID))).for("update");
        if (!row || !world) throw new WorldDesignError("WORLD_NOT_FOUND", "设计或世界不存在。");
        if (row.appliedWorldVersion) return { appliedWorldVersion: row.appliedWorldVersion }; // Already applied exactly once, no new inventory or revision.
        if (row.version !== expectedVersion || world.version !== expectedWorldVersion || row.sourceWorldVersion !== world.version)
          throw new WorldDesignError("WORLD_VERSION_CONFLICT", "确认的设计或世界版本已变化；不会覆盖新设定，请重新适配。");
        const current = worldBlueprintSchema.parse(world.content); const content = row.content;
        const issues = assetDesignIssues(world.input, current, content);
        if (issues.length) throw new WorldDesignError("WORLD_INVALID", issues.join("\n"));
        const replace = <T extends { id: string }>(list: T[], entry: T) => [...list.filter((item) => item.id !== entry.id), entry];
        const merged = worldBlueprintSchema.parse(content.kind === "item" ? { ...current, items: { ...current.items, definitions: replace(current.items.definitions, content) } }
          : { ...current, characters: replace(current.characters, content) });
        const definition = compileWorld(world.id, 1, world.input, merged); startWorld(definition.id, definition.version, () => definition);
        const version = world.version + 1;
        await tx.update(worlds).set({ content: merged, origins: { ...world.origins, [content.kind === "item" ? "items" : "characters"]: "user" },
          generationReceipt: null, version, updatedAt: new Date() }).where(eq(worlds.id, world.id));
        await tx.update(designs).set({ appliedWorldVersion: version, version: row.version + 1, updatedAt: new Date() }).where(eq(designs.id, id));
        return { appliedWorldVersion: version };
      });
    },
  };
}
export type GameAssetDesignRepository = ReturnType<typeof createGameAssetDesignRepository>;
