import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { gameEventDesigns as plans, gameWorldDrafts, gameSessions } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { createGameWorldRepository } from "./gameWorldRepository";
import { createGameSessionRepository } from "./gameSessionRepository";
import { stableJson } from "@/lib/ai/stableJson";
import { compileWorld } from "@/lib/game/worlds/compile";
import { worldBlueprintSchema } from "@/lib/game/worlds/contracts";
import { withAcquiredItems } from "@/lib/game/exploration/runtimeItems";
import { refreshWorldEvents, startWorld } from "@/lib/game/exploration/engine";
import { validateWorldTemplate } from "@/lib/game/exploration/validateTemplate";
import { perceptionScope, recordPerceptions } from "@/lib/game/exploration/perception";
import { recordEventKnowledge } from "@/lib/game/events/knowledge";
import { blankEventDesign, eventDesignIssues } from "@/lib/game/events/validation";
import { createEventDesignSchema, updateEventDesignSchema, generateEventSchema, eventDefinitionSchema, EventDesignError, type EventField } from "@/lib/game/events/contracts";
import type { EventSnapshot } from "@/lib/game/events/source";
type Plan = typeof plans.$inferSelect;

export function createGameEventDesignRepository<H extends PgQueryResultHKT>(db: PgDatabase<H, typeof schema>) {
  const get = async (id: string) => { const [row] = await db.select().from(plans).where(and(eq(plans.id, id), eq(plans.userId, LOCAL_USER_ID)));
    if (!row) throw new EventDesignError("EVENT_NOT_FOUND", "事件草稿不存在。"); return row; };
  const captureWorld = async (id: string, version?: number) => {
    const world = await createGameWorldRepository(db).get(id);
    if (version !== undefined && world.version !== version) throw new EventDesignError("EVENT_CONFLICT", "世界版本已变化，请明确适配当前世界。");
    if (!world.content) throw new EventDesignError("EVENT_INVALID", "请先完成并保存基础世界草稿。");
    const template = compileWorld(id, 1, world.input, world.content);
    const snapshot: EventSnapshot = { template, context: { locationId: template.start, tick: 0, coins: template.initial.coins,
      inventory: template.instances.map(({ definitionId, quantity, owner }) => ({ definitionId, quantity, owner })), issuedUniqueItems: [],
      actors: template.characters.filter((person) => person.card.locationId === template.start).map(({ card }) => ({ id: card.id, name: card.name, goals: card.goals, relationship: card.relationship, relationshipReason: card.relationshipReason })), history: [] } };
    return { version: world.version, snapshot };
  };
  const captureSession = async (id: string, parentTurnId: string, version?: number) => {
    const session = await createGameSessionRepository(db).get(id); if (!session) throw new EventDesignError("EVENT_NOT_FOUND", "存档不存在。");
    if (version !== undefined && (session.version !== version || session.status !== "active")) throw new EventDesignError("EVENT_CONFLICT", "存档已变化或未运行，旧建议保留；请明确适配目标分支。");
    const parent = session.turns.find((turn) => turn.id === parentTurnId); const state = parent?.stateSnapshot.exploration;
    if (!parent || !state) throw new EventDesignError("EVENT_INVALID", "请选择本存档已开启探索的回合。");
    const base = await createGameWorldRepository(db).resolveSessionTemplate(id, state.templateId, state.templateVersion, parentTurnId);
    const snapshot: EventSnapshot = { template: withAcquiredItems(base, state), context: { locationId: state.locationId, tick: state.tick, coins: state.coins,
      inventory: state.instances.map(({ definitionId, quantity, owner }) => ({ definitionId, quantity, owner })),
      issuedUniqueItems: [...new Set([...(state.issuedUniqueItems ?? []), ...(state.acquisitions?.receipts.filter((receipt) => base.items.some((item) => item.id === receipt.definitionId && item.unique)).map((receipt) => receipt.definitionId) ?? [])])],
      actors: Object.values(state.characters).filter((person) => person.controller !== "user").map((person) => ({ id: person.id, name: person.name, goals: person.goals, relationship: person.relationship, relationshipReason: person.relationshipReason })),
      history: state.history.filter((entry) => entry.locationId === state.locationId).slice(-6).map(({ text, kind, source }) => ({ text, kind, source })) } };
    return { version: session.version, snapshot, session, parent, state, base };
  };
  const write = async (id: string, patch: Partial<typeof plans.$inferInsert>) => (await db.update(plans).set({ ...patch, version: sql`${plans.version} + 1`, updatedAt: new Date() }).where(eq(plans.id, id)).returning())[0];
  const mutable = (row: Plan) => { if (row.appliedWorldVersion || row.appliedTurnId || row.generation.active) throw new EventDesignError("EVENT_CONFLICT", "事件已确认或正在生成；请先停止等待 / 重读，不覆盖已确认的事件。"); };
  const current = (row: Plan) => row.worldId ? captureWorld(row.worldId, row.sourceVersion) : captureSession(row.sessionId!, row.parentTurnId!, row.sourceVersion);
  type Scoped = { get: typeof get; write: typeof write; current: typeof current; captureWorld: typeof captureWorld; captureSession: typeof captureSession; database: () => PgDatabase<H, typeof schema> };
  const mutate = async <R>(id: string, work: (row: Plan, repo: Scoped) => Promise<R>): Promise<R> => {
    const initial = await get(id);
    return db.transaction(async (tx) => {
      if (initial.worldId) await tx.select({ id: gameWorldDrafts.id }).from(gameWorldDrafts).where(and(eq(gameWorldDrafts.id, initial.worldId), eq(gameWorldDrafts.userId, LOCAL_USER_ID))).for("update");
      else await tx.select({ id: gameSessions.id }).from(gameSessions).where(and(eq(gameSessions.id, initial.sessionId!), eq(gameSessions.userId, LOCAL_USER_ID))).for("update");
      await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, id)).for("update");
      const repo = createGameEventDesignRepository(tx); return work(await repo.get(id), repo);
    });
  };
  return {
    get, captureWorld, captureSession, current, write,
    async list(source: { worldId: string } | { sessionId: string; parentTurnId: string }) {
      const context = "worldId" in source ? await captureWorld(source.worldId) : await captureSession(source.sessionId, source.parentTurnId);
      const rows = await db.select().from(plans).where(and(eq(plans.userId, LOCAL_USER_ID), "worldId" in source ? eq(plans.worldId, source.worldId)
        : and(eq(plans.sessionId, source.sessionId), eq(plans.parentTurnId, source.parentTurnId)))).orderBy(desc(plans.updatedAt)).limit(100);
      return { version: context.version, rows: rows.map((row) => ({ id: row.id, name: row.content.name, version: row.version, sourceVersion: row.sourceVersion, appliedWorldVersion: row.appliedWorldVersion, appliedTurnId: row.appliedTurnId })) };
    },
    async create(raw: unknown) {
      const input = createEventDesignSchema.parse(raw); const source = input.kind === "world" ? await captureWorld(input.worldId, input.expectedVersion) : await captureSession(input.sessionId, input.parentTurnId, input.expectedVersion);
      if (Buffer.byteLength(JSON.stringify(source.snapshot), "utf8") > 350000) throw new EventDesignError("EVENT_INVALID", "事件来源快照超出容量，请精简世界 / 分支资料后再设计。");
      const content = blankEventDesign(source.snapshot.template, `event-${crypto.randomUUID().slice(0, 8)}`, input.brief, source.snapshot.context.locationId);
      return (await db.insert(plans).values({ userId: LOCAL_USER_ID, worldId: input.kind === "world" ? input.worldId : null, sessionId: input.kind === "session" ? input.sessionId : null,
        parentTurnId: input.kind === "session" ? input.parentTurnId : null, sourceVersion: source.version, sourceSnapshot: source.snapshot, brief: input.brief, content }).returning())[0];
    },
    async update(id: string, raw: unknown) {
      const input = updateEventDesignSchema.parse(raw);
      return mutate(id, async (row, repo) => { mutable(row); if (row.version !== input.expectedVersion || input.content.id !== row.content.id) throw new EventDesignError("EVENT_CONFLICT", "事件版本变化或稳定ID被修改。");
        const origins = { ...row.origins }; for (const field of Object.keys(input.content) as EventField[]) if (stableJson(row.content[field]) !== stableJson(input.content[field])) origins[field] = "user";
        return repo.write(id, { brief: input.brief, content: input.content, lockedFields: [...new Set(input.lockedFields)], origins }); });
    },
    async rebase(id: string, expectedVersion: number, expectedSourceVersion: number, parentTurnId?: string) {
      return mutate(id, async (row, repo) => { mutable(row); if (row.version !== expectedVersion) throw new EventDesignError("EVENT_CONFLICT", "草稿已变化。");
        const source = row.worldId ? await repo.captureWorld(row.worldId, expectedSourceVersion) : await repo.captureSession(row.sessionId!, parentTurnId ?? row.parentTurnId!, expectedSourceVersion);
        return repo.write(id, { sourceVersion: source.version, sourceSnapshot: source.snapshot, ...(row.sessionId ? { parentTurnId: parentTurnId ?? row.parentTurnId } : {}) }); });
    },
    async claimGeneration(id: string, raw: unknown) {
      const input = generateEventSchema.parse(raw); const fingerprint = createHash("sha256").update(stableJson({ id, ...input })).digest("hex");
      return mutate(id, async (row, repo) => {
        const previous = row.generation.attempts.find((attempt) => attempt.id === input.requestId);
        if (previous) { if (previous.fingerprint !== fingerprint) throw new EventDesignError("EVENT_CONFLICT", "同一生成请求ID不能改变字段或版本。"); return { row, claimed: false, fields: [] as EventField[] }; }
        mutable(row); if (row.version !== input.expectedVersion) throw new EventDesignError("EVENT_CONFLICT", "生成所依据的草稿已变化。");
        await repo.current(row); const fields = [...new Set(input.fields)].filter((field) => !row.lockedFields.includes(field));
        if (!fields.length || row.generation.attempts.length >= 32) throw new EventDesignError("EVENT_INVALID", "字段已锁定或生成记录已达32次上限；没有模型调用。");
        return { claimed: true, fields, row: await repo.write(id, { generation: { attempts: [...row.generation.attempts, { id: input.requestId, fingerprint }], active: input.requestId, error: null } }) };
      });
    },
    async finishGeneration(id: string, requestId: string, patch: Record<string, unknown>, fields: EventField[]) {
      return mutate(id, async (row, repo) => { if (row.generation.active !== requestId) return row;
        if (Object.keys(patch).some((key) => !fields.includes(key as EventField)) || fields.some((field) => !(field in patch))) throw new EventDesignError("EVENT_INVALID", "模型改写了非请求字段。");
        const content = eventDefinitionSchema.parse({ ...row.content, ...patch });
        return repo.write(id, { content, origins: { ...row.origins, ...Object.fromEntries(fields.map((field) => [field, "ai"])) }, generation: { ...row.generation, active: null, error: null } }); });
    },
    async stopGeneration(id: string, requestId?: string) {
      return mutate(id, async (row, repo) => !row.generation.active || requestId && row.generation.active !== requestId ? row
        : repo.write(id, { generation: { ...row.generation, active: null, error: "生成未完成或已停止；原稿保留，不自动重试，已发生的API费用不退。" } }));
    },
    async confirm(id: string, expectedVersion: number, expectedSourceVersion: number) {
      return mutate(id, async (row, repo) => {
        if (row.appliedWorldVersion || row.appliedTurnId) return row;
        mutable(row); if (row.version !== expectedVersion || row.sourceVersion !== expectedSourceVersion) throw new EventDesignError("EVENT_CONFLICT", "确认依据的版本已变化。");
        await repo.current(row); const issues = eventDesignIssues(row.content, row.sourceSnapshot.template);
        if (issues.length) throw new EventDesignError("EVENT_INVALID", issues.join("；"));
        if (row.worldId) {
          const world = await createGameWorldRepository(repo.database()).get(row.worldId); const current = worldBlueprintSchema.parse(world.content);
          const content = { ...current, eventDesigns: [...(current.eventDesigns ?? []).filter((event) => event.id !== row.content.id), row.content] };
          const next = await createGameWorldRepository(repo.database()).update(row.worldId, { expectedVersion: row.sourceVersion, input: world.input, content, lockedSections: world.lockedSections, eventDesignsConfirmed: true });
          const compiled = compileWorld(world.id, 1, world.input, content); startWorld(compiled.id, compiled.version, () => compiled);
          return repo.write(id, { appliedWorldVersion: next.version });
        }
        const current = await repo.captureSession(row.sessionId!, row.parentTurnId!, row.sourceVersion);
        if ((current.state.eventPlanIds?.length ?? 0) >= 20) throw new EventDesignError("EVENT_INVALID", "本分支事件计划已达20项上限。");
        const template = { ...current.base, events: [...current.base.events, row.content] };
        validateWorldTemplate(withAcquiredItems(template, current.state));
        const state = structuredClone(current.state); (state.eventPlanIds ??= []).push(row.id);
        state.receipt = { requestId: row.id, fingerprint: createHash("sha256").update(`event-confirm:${row.id}:${row.version}`).digest("hex") };
        refreshWorldEvents(state, template, row.id);
        recordPerceptions(state, perceptionScope(current.session, row.parentTurnId, { requestId: row.id, state }), row.id, undefined);
        recordEventKnowledge(current.state, state, template, row.id);
        state.lastResult = state.events[row.content.id] ? "事件规则已纳入本分支并满足触发条件；尚未替你选择行动或结算奖励。" : "事件计划已纳入本分支，前置条件尚未满足；未触发、未发奖。";
        const next = await createGameSessionRepository(repo.database()).appendTurn(row.sessionId!, { parentTurnId: row.parentTurnId, expectedVersion: row.sourceVersion, playerContent: "确认本分支事件计划",
          assistantContent: state.lastResult, model: "host-event-plan/v1", stateSnapshot: { ...current.parent.stateSnapshot, exploration: state }, statePatch: {}, events: [], now: new Date() });
        return repo.write(id, { appliedTurnId: next.activeLeafTurnId });
      });
    },
    database: () => db,
  };
}
export type GameEventDesignRepository = ReturnType<typeof createGameEventDesignRepository>;
