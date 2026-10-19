import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { gameWorldDrafts as drafts, gameWorldRevisions as revisions, gameWorldSaves as saves, users } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { createGameSessionRepository } from "./gameSessionRepository";
import { compileWorld, worldDraftIssues } from "@/lib/game/worlds/compile";
import { getWorldTemplate } from "@/lib/game/exploration/catalog";
import { validateWorldTemplate } from "@/lib/game/exploration/validateTemplate";
import { startWorld } from "@/lib/game/exploration/engine";
import { updateWorldDraftSchema, worldBriefSchema, WorldDesignError, type WorldOrigins } from "@/lib/game/worlds/contracts";

export function createGameWorldRepository<H extends PgQueryResultHKT>(db: PgDatabase<H, typeof schema>) {
  const get = async (id: string) => {
    const [row] = await db.select().from(drafts).where(and(eq(drafts.id, id), eq(drafts.userId, LOCAL_USER_ID)));
    if (!row) throw new WorldDesignError("WORLD_NOT_FOUND", "世界草稿不存在或无权访问。"); return row;
  };
  return {
    get,
    async list() {
      const rows = await db.select().from(drafts).where(eq(drafts.userId, LOCAL_USER_ID)).orderBy(desc(drafts.updatedAt)).limit(100);
      return rows.map((row) => ({ id: row.id, name: row.content?.overview.name ?? "未命名草稿", brief: row.input.brief.slice(0, 200), version: row.version }));
    },
    async create(raw: unknown) {
      const input = worldBriefSchema.parse(raw);
      await db.insert(users).values({ id: LOCAL_USER_ID }).onConflictDoNothing();
      return (await db.insert(drafts).values({ userId: LOCAL_USER_ID, input }).returning())[0];
    },
    async update(id: string, raw: unknown, generation?: { receipt: { requestId: string; fingerprint: string }; origins: WorldOrigins }) {
      const input = updateWorldDraftSchema.parse(raw); const previous = await get(id);
      const origins = generation?.origins ?? { ...previous.origins };
      if (!generation) for (const section of Object.keys(input.content ?? {}) as (keyof WorldOrigins)[])
        if (JSON.stringify(previous.content?.[section]) !== JSON.stringify(input.content?.[section])) origins[section] = "user";
      const [row] = await db.update(drafts).set({ input: input.input, content: input.content, lockedSections: [...new Set(input.lockedSections)], origins,
        generationReceipt: generation?.receipt ?? null, version: sql`${drafts.version} + 1`, updatedAt: new Date() })
        .where(and(eq(drafts.id, id), eq(drafts.userId, LOCAL_USER_ID), eq(drafts.version, input.expectedVersion))).returning();
      if (!row) throw new WorldDesignError("WORLD_VERSION_CONFLICT", "草稿已被其他操作更新；你的编辑保留，请刷新后比较，不会覆盖新版。");
      return row;
    },
    async revisions(id: string) {
      await get(id);
      return db.select({ revision: revisions.revision, draftVersion: revisions.draftVersion, createdAt: revisions.createdAt }).from(revisions)
        .where(and(eq(revisions.worldId, id), eq(revisions.userId, LOCAL_USER_ID))).orderBy(desc(revisions.revision));
    },
    async publish(id: string, expectedVersion: number) {
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(drafts).where(and(eq(drafts.id, id), eq(drafts.userId, LOCAL_USER_ID))).for("update");
        if (!row) throw new WorldDesignError("WORLD_NOT_FOUND", "草稿不存在。");
        if (row.version !== expectedVersion) throw new WorldDesignError("WORLD_VERSION_CONFLICT", "你确认的是旧草稿，请重新预览新版。");
        const [existing] = await tx.select().from(revisions).where(and(eq(revisions.worldId, id), eq(revisions.draftVersion, expectedVersion)));
        if (existing) return { revision: existing.revision, draftVersion: existing.draftVersion };
        const issues = worldDraftIssues(row.input, row.content);
        if (issues.length || !row.content) throw new WorldDesignError("WORLD_INVALID", issues.join("\n"));
        const [latest] = await tx.select({ revision: revisions.revision }).from(revisions).where(eq(revisions.worldId, id)).orderBy(desc(revisions.revision)).limit(1);
        const revision = (latest?.revision ?? 0) + 1; const definition = compileWorld(id, revision, row.input, row.content);
        startWorld(definition.id, definition.version, () => definition); // Reject definitions that cannot project into a playable state.
        await tx.insert(revisions).values({ worldId: id, userId: LOCAL_USER_ID, revision, draftVersion: row.version, definition });
        return { revision, draftVersion: row.version };
      });
    },
    async createSave(id: string, revision: number, requestId: string) {
      const fingerprint = `${id}:${revision}`;
      return db.transaction(async (tx) => {
        // Serialize the same user's idempotent save creation, not model generation.
        await tx.select({ id: users.id }).from(users).where(eq(users.id, LOCAL_USER_ID)).for("update");
        const [existing] = await tx.select().from(saves).where(and(eq(saves.userId, LOCAL_USER_ID), eq(saves.requestId, requestId)));
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw new WorldDesignError("WORLD_VERSION_CONFLICT", "同一请求ID不能创建不同世界存档。");
          return (await createGameSessionRepository(tx).get(existing.sessionId))!;
        }
        const [published] = await tx.select().from(revisions).where(and(eq(revisions.worldId, id), eq(revisions.revision, revision), eq(revisions.userId, LOCAL_USER_ID)));
        if (!published) throw new WorldDesignError("WORLD_NOT_FOUND", "已发布修订不存在。");
        const world = published.definition;
        const session = await createGameSessionRepository(tx).create({ title: `${world.world} · r${revision}`.slice(0, 120), kind: "interactive-story",
          world: { name: world.world, premise: world.setting?.premise ?? world.initial.message, tone: world.setting?.tone ?? "叙事探索", rules: [`exploration.v1 / ${world.id}@${world.version}`, ...(world.publicRules ?? [])], boundaries: ["虚构不进入现实记忆"] }, initialCharacter: null, now: new Date() });
        await tx.insert(saves).values({ sessionId: session.id, revisionId: published.id, userId: LOCAL_USER_ID, requestId, fingerprint });
        return session;
      });
    },
    async resolveSessionTemplate(sessionId: string, templateId: string, version: string) {
      const [row] = await db.select({ definition: revisions.definition }).from(saves).innerJoin(revisions, eq(saves.revisionId, revisions.id))
        .where(and(eq(saves.sessionId, sessionId), eq(saves.userId, LOCAL_USER_ID), eq(revisions.userId, LOCAL_USER_ID)));
      if (!row) return getWorldTemplate(templateId, version);
      if (row.definition.id !== templateId || row.definition.version !== version) throw new WorldDesignError("WORLD_INVALID", "请求的世界与存档固定修订不一致，不能切换或覆盖。");
      validateWorldTemplate(row.definition); return row.definition;
    },
  };
}
export type GameWorldRepository = ReturnType<typeof createGameWorldRepository>;
