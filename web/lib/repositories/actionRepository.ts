import { createHash } from "node:crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { ActionError, actionCommandSchema, actionDefinitionSchema, businessDay, shiftDay, ruleFor, isPlanned, type ActionItem, type ActionEntry, type ActionSnapshot, type ActionCommand } from "@/lib/tasks/actions";

export function createActionRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof schema>) {
  const owned = eq(schema.actionItems.userId, LOCAL_USER_ID);
  async function read(from: string, to: string, now: Date): Promise<ActionSnapshot> {
    return db.transaction(async (tx) => {
      // One consistent snapshot with the same per-user lock as writes.
      await tx.insert(schema.users).values({ id: LOCAL_USER_ID }).onConflictDoNothing();
      await tx.select().from(schema.users).where(eq(schema.users.id, LOCAL_USER_ID)).for("update");
      const items = await tx.select({ id: schema.actionItems.id, version: schema.actionItems.version, data: schema.actionItems.data }).from(schema.actionItems).where(owned).limit(1001);
      const entries = await tx.select({ data: schema.actionEntries.data }).from(schema.actionEntries).innerJoin(schema.actionItems, eq(schema.actionEntries.itemId, schema.actionItems.id)).where(and(owned, gte(schema.actionEntries.day, from), lte(schema.actionEntries.day, to))).limit(20001);
      if (items.length > 1000 || entries.length > 20000) throw new ActionError("数据过多，请缩小日期范围或归档后分批处理。", 413);
      return { today: businessDay(now), items, entries: entries.map((e) => e.data) };
    });
  }
  return {
    read,
    async mutate(raw: ActionCommand, now = new Date()): Promise<ActionItem> {
      const input = actionCommandSchema.parse(raw), today = businessDay(now);
      const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      return db.transaction(async (tx) => {
        await tx.insert(schema.users).values({ id: LOCAL_USER_ID }).onConflictDoNothing();
        await tx.select().from(schema.users).where(eq(schema.users.id, LOCAL_USER_ID)).for("update");
        const [replay] = await tx.select().from(schema.actionEvents).where(and(eq(schema.actionEvents.id, input.mutationId), eq(schema.actionEvents.userId, LOCAL_USER_ID)));
        if (replay) {
          if (replay.fingerprint !== fingerprint) throw new ActionError("该操作编号已用于不同内容，请刷新后重新操作。");
          const [item] = await tx.select().from(schema.actionItems).where(and(owned, eq(schema.actionItems.id, replay.itemId)));
          if (!item) throw new ActionError("记录不存在。", 404);
          return { id: item.id, version: item.version, data: item.data };
        }
        let item: ActionItem;
        if (input.operation === "create") {
          const data = actionDefinitionSchema.parse(input.data);
          if (data.completedOn || data.linkedTaskId || data.status !== "active") throw new ActionError("新事项必须未完成、未绑定提醒且处于启用状态。", 400);
          if (data.kind === "habit" ? data.startsOn < today || data.rules.length !== 1 || data.rules[0].effectiveFrom !== data.startsOn || data.rules[0].paused : data.rules.length !== 0) throw new ActionError("习惯从今天或未来开始，须有一个同日生效的启用规则；其他事项不带习惯规则。", 400);
          if (data.dueOn && data.dueOn < data.startsOn) throw new ActionError("截止日不能早于开始日。", 400);
          if (data.kind === "goal" && data.goalId) throw new ActionError("首期目标不支持嵌套。", 400);
          await validateGoal(data.goalId);
          const count = await tx.select({ id: schema.actionItems.id }).from(schema.actionItems).where(owned).limit(1000);
          if (count.length >= 1000) throw new ActionError("首期最多1000个事项，未静默截断。", 413);
          const [created] = await tx.insert(schema.actionItems).values({ userId: LOCAL_USER_ID, data }).returning();
          item = { id: created.id, version: created.version, data: created.data };
        } else {
          const [current] = await tx.select().from(schema.actionItems).where(and(owned, eq(schema.actionItems.id, input.id))).for("update");
          if (!current) throw new ActionError("事项不存在。", 404);
          if (current.version !== input.expectedVersion) throw new ActionError("另一端已更新，草稿保留；请刷新后核对并重试。");
          const data = structuredClone(current.data);
          if (input.operation === "update") {
            await validateGoal(input.goalId);
            if (input.goalId === current.id || (data.kind === "goal" && input.goalId)) throw new ActionError("目标不能嵌套或关联自己。", 400);
            if (input.dueOn && input.dueOn < data.startsOn) throw new ActionError("截止日不能早于开始日。", 400);
            if (data.kind === "habit" && data.status !== input.status) {
              const effectiveFrom = data.startsOn > today ? data.startsOn : shiftDay(today, 1);
              const base = ruleFor(current, effectiveFrom);
              if (base) {
                const paused = input.status !== "active";
                data.rules = [...data.rules.filter((r) => r.effectiveFrom !== effectiveFrom).map((r) => r.effectiveFrom > effectiveFrom ? { ...r, paused } : r), { ...base, effectiveFrom, paused }].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
                if (data.rules.length > 400) throw new ActionError("规则版本已达400，请另建新习惯。", 413);
              }
            }
            Object.assign(data, { title: input.title, note: input.note, dueOn: input.dueOn, goalId: input.goalId, status: input.status });
          } else if (input.operation === "record") {
            if (data.kind === "goal") throw new ActionError("目标进度来自子任务与关联习惯，不能直接打卡。", 400);
            if (data.status !== "active" && input.state !== "revoked") throw new ActionError("请先恢复事项，再记录行动。");
            if (input.day > today || input.day < data.startsOn || input.day < shiftDay(today, -365)) throw new ActionError("仅允许开始日之后、过去365天内的实际行动，不允许未来打卡。", 400);
            const rule = ruleFor(current, input.day);
            if (data.kind === "habit" && !isPlanned(current, input.day, rule) && input.state !== "revoked") throw new ActionError("该日不在有效习惯计划内。", 400);
            if (input.state === "done" && data.kind === "habit" && input.value <= 0) throw new ActionError("完成量须大于0。", 400);
            if (data.kind === "todo") {
              // A to-do has one real completion, unlike a recurring habit.
              if (data.completedOn && data.completedOn !== input.day && input.state !== "revoked") throw new ActionError("此待办已完成，先撤销原记录再更正日期。");
              if (input.state === "revoked" && data.completedOn && data.completedOn !== input.day) throw new ActionError("请撤销实际完成日的记录。");
              data.completedOn = input.state === "done" ? input.day : null;
            }
            const entry: ActionEntry = { itemId: current.id, day: input.day, value: input.state === "done" ? input.value : 0, state: input.state, note: input.note, rule, recordedAt: now.toISOString(), backfill: input.day < today };
            await tx.insert(schema.actionEntries).values({ itemId: current.id, day: input.day, data: entry }).onConflictDoUpdate({ target: [schema.actionEntries.itemId, schema.actionEntries.day], set: { data: entry } });
          } else if (input.operation === "rule") {
            if (data.kind !== "habit" || input.rule.effectiveFrom <= today || input.rule.effectiveFrom < data.startsOn || data.rules.length >= 400) throw new ActionError("规则只允许从未来日期生效；历史不被重算，最多400个版本。", 400);
            if (input.rule.effectiveFrom <= data.rules.at(-1)!.effectiveFrom) throw new ActionError("新规则必须晚于最后一个规则版本生效。", 400);
            data.rules.push(input.rule);
          } else {
            if (data.kind === "goal") throw new ActionError("请为目标的具体行动绑定提醒。", 400);
            if (input.taskId) {
              const [task] = await tx.select().from(schema.scheduledTasks).where(and(eq(schema.scheduledTasks.id, input.taskId), eq(schema.scheduledTasks.userId, LOCAL_USER_ID)));
              if (!task || task.kind !== "reminder") throw new ActionError("只能绑定自己现有的普通提醒，不能改变AI任务含义。", 400);
              const others = await tx.select().from(schema.actionItems).where(owned);
              if (others.some((a) => a.id !== current.id && a.data.linkedTaskId === input.taskId)) throw new ActionError("此提醒已绑定其他事项，请先解绑。");
            }
            data.linkedTaskId = input.taskId;
          }
          const [saved] = await tx.update(schema.actionItems).set({ data, version: current.version + 1 }).where(and(owned, eq(schema.actionItems.id, current.id), eq(schema.actionItems.version, current.version))).returning();
          item = { id: saved.id, version: saved.version, data: saved.data };
        }
        await tx.insert(schema.actionEvents).values({ id: input.mutationId, userId: LOCAL_USER_ID, itemId: item.id, fingerprint, data: { input, item, recordedAt: now.toISOString() }, createdAt: now });
        return item;

        async function validateGoal(id: string | null) {
          if (!id) return;
          const [goal] = await tx.select().from(schema.actionItems).where(and(owned, eq(schema.actionItems.id, id)));
          if (!goal || goal.data.kind !== "goal" || goal.data.status === "archived") throw new ActionError("关联目标不存在或已归档。", 400);
        }
      });
    },
  };
}
