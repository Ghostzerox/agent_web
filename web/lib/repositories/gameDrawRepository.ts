import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { gameItemDraws, gameSessions } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { createGameSessionRepository, type GameSessionDetail } from "./gameSessionRepository";
import { createGameWorldRepository } from "./gameWorldRepository";
import { stableJson } from "@/lib/ai/stableJson";
import { DrawError, prepareDrawSchema, type DrawData, type DrawStatus } from "@/lib/game/draws/contracts";
import { eligibleDrawEntries, sampleDraw } from "@/lib/game/draws/pools";
import { blankDrawItem, settleDrawInventory, validateDrawItem } from "@/lib/game/draws/items";

export class GameDrawRepository<T extends PgQueryResultHKT = PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<T, typeof schema>) {}
  async get(id: string) {
    const [row] = await this.db.select().from(gameItemDraws).where(and(eq(gameItemDraws.id, id), eq(gameItemDraws.userId, LOCAL_USER_ID))).limit(1);
    if (!row) throw new DrawError("DRAW_NOT_FOUND", "抽取记录不存在。"); return row;
  }
  async context(sessionId: string, parentTurnId: string) {
    const session = await createGameSessionRepository(this.db).get(sessionId);
    if (!session) throw new DrawError("DRAW_NOT_FOUND", "存档不存在。");
    const parent = session.turns.find((turn) => turn.id === parentTurnId);
    if (!parent?.stateSnapshot.exploration) throw new DrawError("DRAW_INVALID", "请先在所选分支开启探索世界。");
    const state = parent.stateSnapshot.exploration;
    const template = await createGameWorldRepository(this.db).resolveSessionTemplate(sessionId, state.templateId, state.templateVersion);
    return { session, parent, state, template };
  }
  async list(sessionId: string, parentTurnId: string) {
    const context = await this.context(sessionId, parentTurnId);
    const rows = await this.db.select().from(gameItemDraws).where(and(eq(gameItemDraws.userId, LOCAL_USER_ID), eq(gameItemDraws.sessionId, sessionId), eq(gameItemDraws.parentTurnId, parentTurnId))).orderBy(desc(gameItemDraws.createdAt)).limit(100);
    const settledIds = context.state.acquisitions?.receipts.map((receipt) => receipt.requestId) ?? [];
    const history = settledIds.length ? await this.db.select().from(gameItemDraws).where(and(eq(gameItemDraws.userId, LOCAL_USER_ID), eq(gameItemDraws.sessionId, sessionId), eq(gameItemDraws.status, "settled"), inArray(gameItemDraws.id, settledIds))).orderBy(desc(gameItemDraws.createdAt)).limit(200) : [];
    return { sessionId, parentTurnId, version: context.session.version, status: context.session.status, coins: context.state.coins,
      templateId: context.template.id, templateVersion: context.template.version, ranks: context.template.ranks,
      fixedItems: context.template.items.filter((item) => context.template.drawPools?.some((pool) => pool.entries.some((entry) => entry.source === "fixed" && entry.definitionId === item.id))),
      pools: (context.template.drawPools ?? []).map((pool) => { const entries = eligibleDrawEntries(pool, context.state, context.template); const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
        return { pool, probabilities: entries.map((entry) => ({ entryId: entry.id, probability: entry.weight / total })) }; }),
      draws: rows, history };
  }
  private assertCurrent(session: GameSessionDetail, row: { expectedVersion: number }) {
    if (session.status !== "active" || session.version !== row.expectedVersion) throw new DrawError("DRAW_CONFLICT", "存档已变化 / 暂停，原抽样保留但不能跨分支或版本发放；请取消后在目标分支重新确认。");
  }
  async prepare(sessionId: string, raw: unknown, seed: string = randomUUID()) {
    const input = prepareDrawSchema.parse(raw); const fingerprint = createHash("sha256").update(stableJson({ sessionId, ...input })).digest("hex");
    return this.db.transaction(async (tx) => {
      await tx.select({ id: gameSessions.id }).from(gameSessions).where(and(eq(gameSessions.id, sessionId), eq(gameSessions.userId, LOCAL_USER_ID))).for("update");
      const repository = createGameDrawRepository(tx);
      const [existing] = await tx.select().from(gameItemDraws).where(eq(gameItemDraws.id, input.requestId));
      if (existing) { if (existing.userId !== LOCAL_USER_ID || existing.fingerprint !== fingerprint) throw new DrawError("DRAW_CONFLICT", "同一请求ID不能用于不同抽取。"); return existing; }
      const { session, state, template } = await repository.context(sessionId, input.parentTurnId); repository.assertCurrent(session, input);
      const [pending] = await tx.select({ id: gameItemDraws.id }).from(gameItemDraws).where(and(eq(gameItemDraws.sessionId, sessionId), eq(gameItemDraws.parentTurnId, input.parentTurnId), eq(gameItemDraws.expectedVersion, input.expectedVersion), sql`${gameItemDraws.status} IN ('sampled','ready','generating','failed')`)).limit(1);
      if (pending) throw new DrawError("DRAW_CONFLICT", "当前分支已有待处理抽取，请先确认入库或取消。");
      const pool = template.drawPools?.find((pool) => pool.id === input.poolId); if (!pool) throw new DrawError("DRAW_INVALID", "当前修订没有此卡池；旧局不会读取可变的世界草稿。");
      const sample = sampleDraw(eligibleDrawEntries(pool, state, template), seed);
      const data: DrawData = { templateId: template.id, templateVersion: template.version, pool, sample, keywords: input.keywords, item: null, attempts: [], generationClaim: null, model: null, error: null };
      if (sample.entry.source === "generated") data.item = blankDrawItem(input.requestId, data, template);
      const [row] = await tx.insert(gameItemDraws).values({ id: input.requestId, sessionId, userId: LOCAL_USER_ID, parentTurnId: input.parentTurnId, expectedVersion: input.expectedVersion, fingerprint, data, status: sample.entry.source === "fixed" ? "ready" : "sampled" }).onConflictDoNothing().returning();
      if (!row) throw new DrawError("DRAW_CONFLICT", "请求ID已被其他抽取使用，请重读原回执。");
      return row;
    });
  }
  /** All transitions lock session then draw; settlement uses the same outer transaction as appendTurn. */
  private async mutate<R>(id: string, work: (row: typeof gameItemDraws.$inferSelect, repo: GameDrawRepository<T>) => Promise<R>): Promise<R> {
    const original = await this.get(id);
    return this.db.transaction(async (tx) => {
      await tx.select({ id: gameSessions.id }).from(gameSessions).where(and(eq(gameSessions.id, original.sessionId), eq(gameSessions.userId, LOCAL_USER_ID))).for("update");
      await tx.select({ id: gameItemDraws.id }).from(gameItemDraws).where(eq(gameItemDraws.id, id)).for("update");
      const repo = createGameDrawRepository(tx); return work(await repo.get(id), repo);
    });
  }
  private async write(id: string, data: DrawData, status: DrawStatus, settledTurnId: string | null = null) {
    const [row] = await this.db.update(gameItemDraws).set({ data, status, settledTurnId, version: sql`${gameItemDraws.version} + 1`, updatedAt: new Date() }).where(eq(gameItemDraws.id, id)).returning(); return row;
  }
  async claimGeneration(id: string, attemptId: string) {
    return this.mutate(id, async (row, repo) => {
      if (row.data.attempts.includes(attemptId)) return { row, claimed: false };
      const { session } = await repo.context(row.sessionId, row.parentTurnId); repo.assertCurrent(session, row);
      if (row.data.sample.entry.source !== "generated" || !["sampled", "failed"].includes(row.status) || row.data.attempts.length >= 3) throw new DrawError("DRAW_CONFLICT", "本次不能发起生成；不会自动重试或重新抽样。最多三次明确付费尝试，也可手动填写。");
      return { claimed: true, row: await repo.write(id, { ...row.data, attempts: [...row.data.attempts, attemptId], generationClaim: attemptId, error: null }, "generating") };
    });
  }
  async finishGeneration(id: string, attemptId: string, raw: unknown, model: string) {
    return this.mutate(id, async (row, repo) => {
      if (row.status !== "generating" || row.data.generationClaim !== attemptId) return row;
      const { template } = await repo.context(row.sessionId, row.parentTurnId);
      const item = validateDrawItem(id, row.data, raw, template);
      return repo.write(id, { ...row.data, item, model, generationClaim: null, error: null }, "ready");
    });
  }
  async failGeneration(id: string, attemptId: string) {
    return this.mutate(id, async (row, repo) => row.status === "generating" && row.data.generationClaim === attemptId
      ? repo.write(id, { ...row.data, generationClaim: null, error: "生成失败或已取消；原抽样保留，实际API费用仍记账。不会自动重试。" }, "failed") : row);
  }
  async edit(id: string, expectedVersion: number, raw: unknown) {
    return this.mutate(id, async (row, repo) => {
      if (row.version !== expectedVersion || !["sampled", "failed", "ready"].includes(row.status)) throw new DrawError("DRAW_CONFLICT", "抽取状态已变化，请刷新；生成中不能编辑。");
      const { session, template } = await repo.context(row.sessionId, row.parentTurnId); repo.assertCurrent(session, row);
      const item = validateDrawItem(id, row.data, raw, template);
      return repo.write(id, { ...row.data, item, error: null }, "ready");
    });
  }
  async cancel(id: string) {
    return this.mutate(id, async (row, repo) => row.status === "settled" || row.status === "cancelled" ? row
      : repo.write(id, { ...row.data, generationClaim: null, error: "已取消，不会扣除游戏资源或发奖；进行中的模型费用可能已产生。" }, "cancelled"));
  }
  async settle(id: string, expectedVersion: number) {
    return this.mutate(id, async (row, repo) => {
      if (row.status === "settled") return row;
      if (row.status !== "ready" || row.version !== expectedVersion) throw new DrawError("DRAW_CONFLICT", "只有当前已审阅版本的就绪草稿可以入库。");
      const { session, parent, state, template } = await repo.context(row.sessionId, row.parentTurnId); repo.assertCurrent(session, row);
      if (!eligibleDrawEntries(row.data.pool, state, template).some((entry) => entry.id === row.data.sample.entry.id)) throw new DrawError("DRAW_INVALID", "抽样条目在当前分支已不可用，未扣除 / 发奖。");
      const exploration = settleDrawInventory(state, row.data, id, row.parentTurnId, template);
      exploration.receipt = { requestId: id, fingerprint: row.fingerprint };
      const next = await createGameSessionRepository(repo.db).appendTurn(session.id, { expectedVersion: session.version, parentTurnId: row.parentTurnId,
        playerContent: `确认获取：${row.data.pool.name}`, assistantContent: exploration.lastResult, model: "host-item-draw/v1", statePatch: {},
        stateSnapshot: { ...parent.stateSnapshot, exploration }, events: [], now: new Date() });
      return repo.write(id, row.data, "settled", next.activeLeafTurnId);
    });
  }
}
export const createGameDrawRepository = <T extends PgQueryResultHKT>(db: PgDatabase<T, typeof schema>) => new GameDrawRepository(db);
