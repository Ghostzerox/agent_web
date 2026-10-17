import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  scheduledTasks,
  taskRuns,
  users,
  type ScheduledTaskRecord,
  type TaskScheduleValue,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { annotateActionReminders } from "@/lib/tasks/actionReminders";

export type CreateTaskInput = {
  title: string;
  prompt: string | null;
  kind?: ScheduledTaskRecord["kind"];
  scheduleType: ScheduledTaskRecord["scheduleType"];
  scheduleValue: TaskScheduleValue;
  timezone: string;
  nextRunAt: Date;
};

export type UpdateTaskInput = CreateTaskInput & {
  status: ScheduledTaskRecord["status"];
  expectedVersion: number;
};

export class TaskRepositoryError extends Error {
  constructor(
    readonly code: "TASK_NOT_FOUND" | "VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "TaskRepositoryError";
  }
}

export interface TaskRepositoryPort {
  list(): Promise<ScheduledTaskRecord[]>;
  get(id: string): Promise<ScheduledTaskRecord | null>;
  create(input: CreateTaskInput): Promise<ScheduledTaskRecord>;
  update(id: string, input: UpdateTaskInput): Promise<ScheduledTaskRecord>;
  delete(id: string): Promise<boolean>;
}

export class TaskRepository<
  TQueryResult extends PgQueryResultHKT,
> implements TaskRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  private async ensureLocalUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  async list(): Promise<ScheduledTaskRecord[]> {
    await this.ensureLocalUser();
    const tasks = await this.database
      .select()
      .from(scheduledTasks)
      .where(eq(scheduledTasks.userId, LOCAL_USER_ID))
      .orderBy(desc(scheduledTasks.updatedAt), desc(scheduledTasks.id));
    return annotateActionReminders(this.database,tasks);
  }

  async get(id: string): Promise<ScheduledTaskRecord | null> {
    await this.ensureLocalUser();
    const [task] = await this.database
      .select()
      .from(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.id, id),
          eq(scheduledTasks.userId, LOCAL_USER_ID),
        ),
      )
      .limit(1);
    return task ?? null;
  }

  async create(input: CreateTaskInput): Promise<ScheduledTaskRecord> {
    await this.ensureLocalUser();
    const [task] = await this.database
      .insert(scheduledTasks)
      .values({
        userId: LOCAL_USER_ID,
        title: input.title,
        prompt: input.prompt,
        kind: input.kind ?? "reminder",
        scheduleType: input.scheduleType,
        scheduleValue: input.scheduleValue,
        timezone: input.timezone,
        nextRunAt: input.nextRunAt,
        status: "active",
      })
      .returning();
    return task;
  }

  async update(
    id: string,
    input: UpdateTaskInput,
  ): Promise<ScheduledTaskRecord> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          version: scheduledTasks.version,
          kind: scheduledTasks.kind,
        })
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.id, id),
            eq(scheduledTasks.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);
      if (!current) {
        throw new TaskRepositoryError("TASK_NOT_FOUND", "Task was not found.");
      }
      if (current.version !== input.expectedVersion) {
        throw new TaskRepositoryError(
          "VERSION_CONFLICT",
          "Task version does not match.",
        );
      }

      const [updated] = await transaction
        .update(scheduledTasks)
        .set({
          title: input.title,
          prompt: input.prompt,
          kind: input.kind ?? current.kind,
          scheduleType: input.scheduleType,
          scheduleValue: input.scheduleValue,
          timezone: input.timezone,
          nextRunAt: input.status === "active" ? input.nextRunAt : null,
          status: input.status,
          version: sql`${scheduledTasks.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scheduledTasks.id, id),
            eq(scheduledTasks.userId, LOCAL_USER_ID),
            eq(scheduledTasks.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated) {
        throw new TaskRepositoryError(
          "VERSION_CONFLICT",
          "Task changed while it was being updated.",
        );
      }

      await transaction
        .update(taskRuns)
        .set({
          status: "cancelled",
          leaseExpiresAt: null,
          finishedAt: new Date(),
          errorCode: "TASK_UPDATED",
          errorMessage: "Task changed before this run completed.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taskRuns.taskId, id),
            inArray(taskRuns.status, ["queued", "claimed", "running"]),
          ),
        );
      return updated;
    });
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureLocalUser();
    const deleted = await this.database
      .delete(scheduledTasks)
      .where(
        and(
          eq(scheduledTasks.id, id),
          eq(scheduledTasks.userId, LOCAL_USER_ID),
        ),
      )
      .returning({ id: scheduledTasks.id });
    return deleted.length > 0;
  }
}

export function createTaskRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
): TaskRepository<TQueryResult> {
  return new TaskRepository(database);
}
