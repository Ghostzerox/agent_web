import { and, desc, eq, gt, gte, inArray } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  inboxItems,
  scheduledTasks,
  taskRuns,
  type InboxItemRecord,
  type TaskRunRecord,
  type BriefingFeedback,
  type BriefingSourceSignal,
  type ReflectionQuestionSignal,
} from "@/lib/db/schema";
import type { BriefingHistorySignal } from "@/lib/tasks/personalBriefingGenerator";
import type { ReflectionHistoryPort } from "@/lib/tasks/reflectionQuestionGenerator";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { assertReminderActionPending } from "@/lib/tasks/actionReminders";

export type InboxFilter = "all" | "unread" | "read";

export type CompleteReminderRunInput = {
  runId: string;
  workerId: string;
  expectedAttempt: number;
  now: Date;
};

export type CompleteAgentPromptRunInput = CompleteReminderRunInput & {
  content: string;
  model: string;
};

export type CompletePersonalBriefingRunInput = CompleteAgentPromptRunInput & {
  sources: BriefingSourceSignal[];
  questions: ReflectionQuestionSignal[];
};

export type CompleteBookRecommendationRunInput = CompleteAgentPromptRunInput;
export type CompleteReflectionQuestionRunInput = CompleteAgentPromptRunInput & {
  questions: ReflectionQuestionSignal[];
};

export type CompletedReminderRun = {
  inboxItem: InboxItemRecord;
  run: TaskRunRecord;
};

export class InboxRepositoryError extends Error {
  constructor(
    readonly code:
      | "INBOX_ITEM_NOT_FOUND"
      | "RUN_LEASE_LOST"
      | "RUN_KIND_MISMATCH"
      | "INBOX_FEEDBACK_UNSUPPORTED"
      | "INBOX_WRITE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "InboxRepositoryError";
  }
}

export interface InboxRepositoryPort extends ReflectionHistoryPort {
  list(filter?: InboxFilter): Promise<InboxItemRecord[]>;
  markStatus(
    id: string,
    status: "unread" | "read",
    now: Date,
  ): Promise<InboxItemRecord>;
  markFeedback(
    id: string,
    feedback: BriefingFeedback | null,
    now: Date,
  ): Promise<InboxItemRecord>;
  listRecentBriefingSignals(
    taskId: string,
    since: Date,
  ): Promise<BriefingHistorySignal[]>;
  delete(id: string): Promise<boolean>;
  completeReminderRun(
    input: CompleteReminderRunInput,
  ): Promise<CompletedReminderRun>;
  completeAgentPromptRun(
    input: CompleteAgentPromptRunInput,
  ): Promise<CompletedReminderRun>;
  completePersonalBriefingRun(
    input: CompletePersonalBriefingRunInput,
  ): Promise<CompletedReminderRun>;
  completeBookRecommendationRun(
    input: CompleteBookRecommendationRunInput,
  ): Promise<CompletedReminderRun>;
  completeReflectionQuestionRun(
    input: CompleteReflectionQuestionRunInput,
  ): Promise<CompletedReminderRun>;
}

export class InboxRepository<
  TQueryResult extends PgQueryResultHKT,
> implements InboxRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  list(filter: InboxFilter = "all"): Promise<InboxItemRecord[]> {
    const condition =
      filter === "all"
        ? eq(inboxItems.userId, LOCAL_USER_ID)
        : and(
            eq(inboxItems.userId, LOCAL_USER_ID),
            eq(inboxItems.status, filter),
          );
    return this.database
      .select()
      .from(inboxItems)
      .where(condition)
      .orderBy(desc(inboxItems.occurredAt), desc(inboxItems.createdAt));
  }

  async markStatus(
    id: string,
    status: "unread" | "read",
    now: Date,
  ): Promise<InboxItemRecord> {
    const [item] = await this.database
      .update(inboxItems)
      .set({
        status,
        readAt: status === "read" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(inboxItems.id, id),
          eq(inboxItems.userId, LOCAL_USER_ID),
        ),
      )
      .returning();
    if (!item) {
      throw new InboxRepositoryError(
        "INBOX_ITEM_NOT_FOUND",
        "Inbox item was not found.",
      );
    }
    return item;
  }

  async markFeedback(
    id: string,
    feedback: BriefingFeedback | null,
    now: Date,
  ): Promise<InboxItemRecord> {
    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ source: inboxItems.source })
        .from(inboxItems)
        .where(
          and(eq(inboxItems.id, id), eq(inboxItems.userId, LOCAL_USER_ID)),
        )
        .limit(1);
      if (!existing) {
        throw new InboxRepositoryError(
          "INBOX_ITEM_NOT_FOUND",
          "Inbox item was not found.",
        );
      }
      if (existing.source !== "personal_briefing") {
        throw new InboxRepositoryError(
          "INBOX_FEEDBACK_UNSUPPORTED",
          "Feedback is only supported for personal briefings.",
        );
      }
      const [updated] = await transaction
        .update(inboxItems)
        .set({ feedback, updatedAt: now })
        .where(
          and(eq(inboxItems.id, id), eq(inboxItems.userId, LOCAL_USER_ID)),
        )
        .returning();
      if (!updated) {
        throw new InboxRepositoryError(
          "INBOX_ITEM_NOT_FOUND",
          "Inbox item was not found.",
        );
      }
      return updated;
    });
  }

  async listRecentBriefingSignals(
    taskId: string,
    since: Date,
  ): Promise<BriefingHistorySignal[]> {
    const rows = await this.database
      .select({
        sources: inboxItems.briefingSources,
        feedback: inboxItems.feedback,
      })
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.userId, LOCAL_USER_ID),
          eq(inboxItems.taskId, taskId),
          eq(inboxItems.source, "personal_briefing"),
          gte(inboxItems.occurredAt, since),
        ),
      )
      .orderBy(desc(inboxItems.occurredAt));
    return rows.flatMap(({ sources, feedback }) =>
      (sources ?? []).map((source) => ({ ...source, feedback })),
    );
  }

  async listRecentReflectionQuestions(
    since: Date,
  ): Promise<ReflectionQuestionSignal[]> {
    const rows = await this.database
      .select({ questions: inboxItems.reflectionQuestions })
      .from(inboxItems)
      .where(
        and(
          eq(inboxItems.userId, LOCAL_USER_ID),
          inArray(inboxItems.source, [
            "personal_briefing",
            "reflection_question",
          ]),
          gte(inboxItems.occurredAt, since),
        ),
      )
      .orderBy(desc(inboxItems.occurredAt));
    return rows.flatMap(({ questions }) => questions ?? []);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(inboxItems)
      .where(
        and(
          eq(inboxItems.id, id),
          eq(inboxItems.userId, LOCAL_USER_ID),
        ),
      )
      .returning({ id: inboxItems.id });
    return deleted.length > 0;
  }

  completeReminderRun(
    input: CompleteReminderRunInput,
  ): Promise<CompletedReminderRun> {
    return this.completeRun(input, {
      kind: "reminder",
      body: (prompt) => prompt,
      resultSummary: "Reminder stored in durable inbox.",
    });
  }

  completeAgentPromptRun(
    input: CompleteAgentPromptRunInput,
  ): Promise<CompletedReminderRun> {
    return this.completeRun(input, {
      kind: "agent_prompt",
      body: () => input.content,
      resultSummary: `Agent response stored in durable inbox (${input.model}).`,
    });
  }

  completePersonalBriefingRun(
    input: CompletePersonalBriefingRunInput,
  ): Promise<CompletedReminderRun> {
    return this.completeRun(input, {
      kind: "personal_briefing",
      body: () => input.content,
      briefingSources: input.sources,
      reflectionQuestions: input.questions,
      resultSummary: `Personal briefing stored in durable inbox (${input.model}, ${input.sources.length} sources).`,
    });
  }

  completeReflectionQuestionRun(
    input: CompleteReflectionQuestionRunInput,
  ): Promise<CompletedReminderRun> {
    return this.completeRun(input, {
      kind: "reflection_question",
      body: () => input.content,
      reflectionQuestions: input.questions,
      resultSummary: `Reflection questions stored in durable inbox (${input.model}, ${input.questions.length} selected).`,
    });
  }

  completeBookRecommendationRun(
    input: CompleteBookRecommendationRunInput,
  ): Promise<CompletedReminderRun> {
    return this.completeRun(input, {
      kind: "book_recommendation",
      body: () => input.content,
      resultSummary: `Book recommendations stored in durable inbox (${input.model}).`,
    });
  }

  private completeRun(
    input: CompleteReminderRunInput,
    completion: {
      kind:
        | "reminder"
        | "agent_prompt"
        | "personal_briefing"
        | "book_recommendation"
        | "reflection_question";
      body: (prompt: string | null) => string | null;
      briefingSources?: BriefingSourceSignal[];
      reflectionQuestions?: ReflectionQuestionSignal[];
      resultSummary: string;
    },
  ): Promise<CompletedReminderRun> {
    return this.database.transaction(async (transaction) => {
      // Same ordering as action writes: user lock before task/run locks.
      // This serializes final reminder publication with a user's completion.
      if (completion.kind === "reminder") await transaction.select().from(schema.users).where(eq(schema.users.id,LOCAL_USER_ID)).for("update");
      const [owned] = await transaction
        .select({
          run: taskRuns,
          task: {
            id: scheduledTasks.id,
            userId: scheduledTasks.userId,
            title: scheduledTasks.title,
            prompt: scheduledTasks.prompt,
            kind: scheduledTasks.kind,
          },
        })
        .from(taskRuns)
        .innerJoin(scheduledTasks, eq(taskRuns.taskId, scheduledTasks.id))
        .where(
          and(
            eq(taskRuns.id, input.runId),
            eq(taskRuns.status, "running"),
            eq(taskRuns.claimedBy, input.workerId),
            eq(taskRuns.attempt, input.expectedAttempt),
            gt(taskRuns.leaseExpiresAt, input.now),
          ),
        )
        .for("update")
        .limit(1);
      if (!owned) {
        throw new InboxRepositoryError(
          "RUN_LEASE_LOST",
          "Run is no longer owned by this worker attempt.",
        );
      }
      if (owned.task.kind !== completion.kind) {
        throw new InboxRepositoryError(
          "RUN_KIND_MISMATCH",
          "Run task kind does not match the requested completion path.",
        );
      }

      if (completion.kind === "reminder") await assertReminderActionPending(transaction, owned.task.id, owned.run.scheduledFor);
      const [created] = await transaction
        .insert(inboxItems)
        .values({
          userId: owned.task.userId,
          taskId: owned.task.id,
          taskRunId: owned.run.id,
          source: completion.kind,
          title: owned.task.title,
          body: completion.body(owned.task.prompt),
          briefingSources: completion.briefingSources ?? null,
          reflectionQuestions: completion.reflectionQuestions ?? null,
          occurredAt: owned.run.scheduledFor,
        })
        .onConflictDoNothing({ target: inboxItems.taskRunId })
        .returning();
      const inboxItem =
        created ??
        (
          await transaction
            .select()
            .from(inboxItems)
            .where(
              and(
                eq(inboxItems.taskRunId, owned.run.id),
                eq(inboxItems.userId, owned.task.userId),
              ),
            )
            .limit(1)
        )[0];
      if (!inboxItem) {
        throw new InboxRepositoryError(
          "INBOX_WRITE_FAILED",
          "Reminder inbox item could not be persisted.",
        );
      }

      const [run] = await transaction
        .update(taskRuns)
        .set({
          status: "succeeded",
          leaseExpiresAt: null,
          finishedAt: input.now,
          resultSummary: completion.resultSummary,
          errorCode: null,
          errorMessage: null,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(taskRuns.id, input.runId),
            eq(taskRuns.status, "running"),
            eq(taskRuns.claimedBy, input.workerId),
            eq(taskRuns.attempt, input.expectedAttempt),
            gt(taskRuns.leaseExpiresAt, input.now),
          ),
        )
        .returning();
      if (!run) {
        throw new InboxRepositoryError(
          "RUN_LEASE_LOST",
          "Run lease was lost before reminder completion.",
        );
      }

      return { inboxItem, run };
    });
  }
}

export function createInboxRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new InboxRepository(database);
}
