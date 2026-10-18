import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { conversations, memoryCandidates, memoryItems, messages, type ConversationRecord, type MemoryCandidateRecord } from "@/lib/db/schema";
import { type MemoryCandidateStatus } from "@/lib/memory/types";
import type { MemoryCandidateDraft } from "@/lib/memory/candidateExtractor";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type MemoryCandidateFilter = MemoryCandidateStatus | "all";

export type MemorySourceMessage = {
  conversationId: string;
  messageId: string;
  content: string;
  mode: ConversationRecord["mode"];
};

export type CandidateProposal = {
  candidate: MemoryCandidateRecord;
  created: boolean;
};

export class MemoryCandidateRepositoryError extends Error {
  constructor(
    readonly code:
      | "MEMORY_SOURCE_NOT_FOUND"
      | "MEMORY_CANDIDATE_NOT_FOUND"
      | "MEMORY_CANDIDATE_VERSION_CONFLICT"
      | "MEMORY_CANDIDATE_ALREADY_RESOLVED"
      | "MEMORY_DUPLICATE",
    message: string,
  ) {
    super(message);
    this.name = "MemoryCandidateRepositoryError";
  }
}

export interface MemoryCandidateRepositoryPort {
  list(filter?: MemoryCandidateFilter): Promise<MemoryCandidateRecord[]>;
  getSourceMessage(
    conversationId: string,
    messageId: string,
  ): Promise<MemorySourceMessage>;
  createCandidate(
    source: MemorySourceMessage,
    draft: MemoryCandidateDraft,
    now: Date,
  ): Promise<CandidateProposal>;
  confirm(
    id: string,
    content: string,
    expectedVersion: number,
    now: Date,
  ): Promise<MemoryCandidateRecord>;
  reject(
    id: string,
    expectedVersion: number,
    now: Date,
  ): Promise<MemoryCandidateRecord>;
}

export class MemoryCandidateRepository<
  TQueryResult extends PgQueryResultHKT,
> implements MemoryCandidateRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  list(filter: MemoryCandidateFilter = "all"): Promise<MemoryCandidateRecord[]> {
    const condition =
      filter === "all"
        ? eq(memoryCandidates.userId, LOCAL_USER_ID)
        : and(
            eq(memoryCandidates.userId, LOCAL_USER_ID),
            eq(memoryCandidates.status, filter),
          );
    return this.database
      .select()
      .from(memoryCandidates)
      .where(condition)
      .orderBy(desc(memoryCandidates.createdAt), desc(memoryCandidates.id));
  }

  async getSourceMessage(
    conversationId: string,
    messageId: string,
  ): Promise<MemorySourceMessage> {
    const [source] = await this.database
      .select({
        conversationId: conversations.id,
        messageId: messages.id,
        content: messages.content,
        role: messages.role,
        mode: conversations.mode,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, LOCAL_USER_ID),
          eq(messages.id, messageId),
        ),
      )
      .limit(1);
    if (!source || source.role !== "user") {
      throw new MemoryCandidateRepositoryError(
        "MEMORY_SOURCE_NOT_FOUND",
        "The source user message was not found.",
      );
    }
    return source;
  }

  async createCandidate(
    source: MemorySourceMessage,
    draft: MemoryCandidateDraft,
    now: Date,
  ): Promise<CandidateProposal> {
    const [fromMessage] = await this.database
      .select()
      .from(memoryCandidates)
      .where(
        and(
          eq(memoryCandidates.userId, LOCAL_USER_ID),
          eq(memoryCandidates.sourceMessageId, source.messageId),
        ),
      )
      .limit(1);
    if (fromMessage) return { candidate: fromMessage, created: false };

    const [pendingDuplicate] = await this.database
      .select()
      .from(memoryCandidates)
      .where(
        and(
          eq(memoryCandidates.userId, LOCAL_USER_ID),
          eq(memoryCandidates.content, draft.content),
          eq(memoryCandidates.status, "pending"),
        ),
      )
      .orderBy(desc(memoryCandidates.createdAt))
      .limit(1);
    if (pendingDuplicate) {
      return { candidate: pendingDuplicate, created: false };
    }

    const [confirmedDuplicate] = await this.database
      .select({ candidate: memoryCandidates })
      .from(memoryItems)
      .innerJoin(
        memoryCandidates,
        eq(memoryItems.candidateId, memoryCandidates.id),
      )
      .where(
        and(
          eq(memoryItems.userId, LOCAL_USER_ID),
          eq(memoryItems.content, draft.content),
        ),
      )
      .limit(1);
    if (confirmedDuplicate) {
      return { candidate: confirmedDuplicate.candidate, created: false };
    }

    const [candidate] = await this.database
      .insert(memoryCandidates)
      .values({
        userId: LOCAL_USER_ID,
        sourceConversationId: source.conversationId,
        sourceMessageId: source.messageId,
        ...draft,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: memoryCandidates.sourceMessageId })
      .returning();
    if (candidate) return { candidate, created: true };

    const [concurrent] = await this.database
      .select()
      .from(memoryCandidates)
      .where(eq(memoryCandidates.sourceMessageId, source.messageId))
      .limit(1);
    if (!concurrent) {
      throw new MemoryCandidateRepositoryError(
        "MEMORY_SOURCE_NOT_FOUND",
        "The candidate source disappeared during creation.",
      );
    }
    return { candidate: concurrent, created: false };
  }

  confirm(
    id: string,
    content: string,
    expectedVersion: number,
    now: Date,
  ): Promise<MemoryCandidateRecord> {
    return this.database.transaction(async (transaction) => {
      const candidate = await this.lockPending(
        transaction,
        id,
        expectedVersion,
      );
      const [duplicate] = await transaction
        .select({ id: memoryItems.id })
        .from(memoryItems)
        .where(
          and(
            eq(memoryItems.userId, LOCAL_USER_ID),
            eq(memoryItems.content, content),
            ne(memoryItems.candidateId, candidate.id),
          ),
        )
        .limit(1);
      if (duplicate) {
        throw new MemoryCandidateRepositoryError(
          "MEMORY_DUPLICATE",
          "An identical confirmed memory already exists.",
        );
      }

      await transaction.insert(memoryItems).values({
        userId: LOCAL_USER_ID,
        candidateId: candidate.id,
        sourceConversationId: candidate.sourceConversationId,
        sourceMessageId: candidate.sourceMessageId,
        kind: candidate.kind,
        content,
        sensitivity: candidate.sensitivity,
        createdAt: now,
        updatedAt: now,
      });
      const [updated] = await transaction
        .update(memoryCandidates)
        .set({
          content,
          status: "confirmed",
          resolvedAt: now,
          updatedAt: now,
          version: sql`${memoryCandidates.version} + 1`,
        })
        .where(
          and(
            eq(memoryCandidates.id, candidate.id),
            eq(memoryCandidates.status, "pending"),
            eq(memoryCandidates.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated) {
        throw new MemoryCandidateRepositoryError(
          "MEMORY_CANDIDATE_VERSION_CONFLICT",
          "The memory candidate changed during confirmation.",
        );
      }
      return updated;
    });
  }

  reject(
    id: string,
    expectedVersion: number,
    now: Date,
  ): Promise<MemoryCandidateRecord> {
    return this.database.transaction(async (transaction) => {
      const candidate = await this.lockPending(
        transaction,
        id,
        expectedVersion,
      );
      const [updated] = await transaction
        .update(memoryCandidates)
        .set({
          status: "rejected",
          resolvedAt: now,
          updatedAt: now,
          version: sql`${memoryCandidates.version} + 1`,
        })
        .where(
          and(
            eq(memoryCandidates.id, candidate.id),
            eq(memoryCandidates.status, "pending"),
            eq(memoryCandidates.version, expectedVersion),
          ),
        )
        .returning();
      if (!updated) {
        throw new MemoryCandidateRepositoryError(
          "MEMORY_CANDIDATE_VERSION_CONFLICT",
          "The memory candidate changed during rejection.",
        );
      }
      return updated;
    });
  }

  private async lockPending(
    transaction: Parameters<
      Parameters<typeof this.database.transaction>[0]
    >[0],
    id: string,
    expectedVersion: number,
  ): Promise<MemoryCandidateRecord> {
    const [candidate] = await transaction
      .select()
      .from(memoryCandidates)
      .where(
        and(
          eq(memoryCandidates.id, id),
          eq(memoryCandidates.userId, LOCAL_USER_ID),
        ),
      )
      .for("update")
      .limit(1);
    if (!candidate) {
      throw new MemoryCandidateRepositoryError(
        "MEMORY_CANDIDATE_NOT_FOUND",
        "Memory candidate was not found.",
      );
    }
    if (candidate.version !== expectedVersion) {
      throw new MemoryCandidateRepositoryError(
        "MEMORY_CANDIDATE_VERSION_CONFLICT",
        "Memory candidate version does not match.",
      );
    }
    if (candidate.status !== "pending") {
      throw new MemoryCandidateRepositoryError(
        "MEMORY_CANDIDATE_ALREADY_RESOLVED",
        "Memory candidate has already been resolved.",
      );
    }
    return candidate;
  }
}

export function createMemoryCandidateRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return new MemoryCandidateRepository(database);
}
