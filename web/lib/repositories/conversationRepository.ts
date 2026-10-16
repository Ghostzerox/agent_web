import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  conversations,
  messages,
  users,
  memoryCandidates,
  memoryItems,
  type ConversationRecord,
  type MessageCitation,
  type MessageRecord,
} from "@/lib/db/schema";
import type { ResponseVerification } from "@/lib/ai/messages";
import * as schema from "@/lib/db/schema";

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

export type ConversationMode = ConversationRecord["mode"];
export type MessageRole = MessageRecord["role"];
export type MessageStatus = MessageRecord["status"];

export type ConversationSummary = ConversationRecord;
export type ConversationDetail = ConversationRecord & {
  messages: MessageRecord[];
};

export type CreateConversationInput = {
  title: string;
  mode: ConversationMode;
};

export type UpdateConversationInput = {
  title?: string;
  mode?: ConversationMode;
  expectedVersion: number;
};

export type AppendMessageInput = {
  parentMessageId: string | null;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  model: string | null;
  citations: MessageCitation[];
  verification?: ResponseVerification | null;
};

export class RepositoryError extends Error {
  constructor(
    public readonly code:
      | "CONVERSATION_NOT_FOUND"
      | "MESSAGE_NOT_FOUND"
      | "INVALID_MESSAGE_PARENT"
      | "INVALID_ACTIVE_LEAF"
      | "VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export interface ConversationRepositoryPort {
  listConversations(): Promise<ConversationSummary[]>;
  createConversation(input: CreateConversationInput): Promise<ConversationSummary>;
  getConversation(id: string): Promise<ConversationDetail | null>;
  deleteConversation(id: string, options?: { deleteRelatedMemories: boolean }): Promise<boolean>;
  updateConversation(
    id: string,
    input: UpdateConversationInput,
  ): Promise<ConversationSummary>;
  appendMessage(
    conversationId: string,
    input: AppendMessageInput,
  ): Promise<{ conversation: ConversationSummary; message: MessageRecord }>;
  setActiveLeaf(
    conversationId: string,
    messageId: string | null,
    expectedVersion: number,
  ): Promise<ConversationSummary>;
}

export class ConversationRepository<
  TQueryResult extends PgQueryResultHKT,
> implements ConversationRepositoryPort {
  constructor(
    private readonly database: PgDatabase<
      TQueryResult,
      typeof schema
    >,
  ) {}

  private async ensureLocalUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  async listConversations(): Promise<ConversationSummary[]> {
    await this.ensureLocalUser();
    return this.database
      .select()
      .from(conversations)
      .where(eq(conversations.userId, LOCAL_USER_ID))
      .orderBy(desc(conversations.updatedAt), desc(conversations.id));
  }

  async createConversation(
    input: CreateConversationInput,
  ): Promise<ConversationSummary> {
    await this.ensureLocalUser();
    const [conversation] = await this.database
      .insert(conversations)
      .values({
        userId: LOCAL_USER_ID,
        title: input.title,
        mode: input.mode,
      })
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<ConversationDetail | null> {
    await this.ensureLocalUser();
    const [conversation] = await this.database
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.userId, LOCAL_USER_ID),
        ),
      )
      .limit(1);

    if (!conversation) return null;

    const conversationMessages = await this.database
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    return { ...conversation, messages: conversationMessages };
  }

  async deleteConversation(id: string, options?: { deleteRelatedMemories: boolean }): Promise<boolean> {
    await this.ensureLocalUser();
    return this.database.transaction(async (transaction) => {
    const [existing] = await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, LOCAL_USER_ID))).for("update");
    if (!existing) return false;
    const candidates = await transaction.select({ id: memoryCandidates.id, status: memoryCandidates.status }).from(memoryCandidates).where(and(eq(memoryCandidates.userId, LOCAL_USER_ID), eq(memoryCandidates.sourceConversationId, id))).for("update");
    if (options?.deleteRelatedMemories) {
      await transaction.delete(memoryItems).where(and(eq(memoryItems.userId, LOCAL_USER_ID), eq(memoryItems.sourceConversationId, id)));
      if (candidates.length) await transaction.delete(memoryItems).where(and(eq(memoryItems.userId, LOCAL_USER_ID), inArray(memoryItems.candidateId, candidates.map((candidate) => candidate.id))));
    }
    if (candidates.length) {
      const ids = candidates.map((candidate) => candidate.id);
      const retained = await transaction.select({ candidateId: memoryItems.candidateId }).from(memoryItems).where(inArray(memoryItems.candidateId, ids));
      const kept = new Set(retained.map((item) => item.candidateId));
      const unused = ids.filter((candidateId) => !kept.has(candidateId));
      if (unused.length) await transaction.delete(memoryCandidates).where(and(eq(memoryCandidates.userId, LOCAL_USER_ID), inArray(memoryCandidates.id, unused)));
      await transaction.update(memoryCandidates).set({ sourceConversationId: null, sourceMessageId: null, evidenceQuote: "", content: "来源已删除", reason: "来源已删除；已确认事实独立保留", version: sql`${memoryCandidates.version} + 1`, updatedAt: new Date() }).where(and(eq(memoryCandidates.userId, LOCAL_USER_ID), inArray(memoryCandidates.id, ids)));
    }
    const deleted = await transaction
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.userId, LOCAL_USER_ID),
        ),
      )
      .returning({ id: conversations.id });
    return deleted.length > 0;
    });
  }

  async updateConversation(
    id: string,
    input: UpdateConversationInput,
  ): Promise<ConversationSummary> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select({ version: conversations.version })
        .from(conversations)
        .where(
          and(eq(conversations.id, id), eq(conversations.userId, LOCAL_USER_ID)),
        )
        .for("update")
        .limit(1);
      if (!conversation) {
        throw new RepositoryError(
          "CONVERSATION_NOT_FOUND",
          "Conversation was not found.",
        );
      }
      if (conversation.version !== input.expectedVersion) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation version does not match.",
        );
      }

      const [updated] = await transaction
        .update(conversations)
        .set({
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          updatedAt: new Date(),
          version: sql`${conversations.version} + 1`,
        })
        .where(
          and(
            eq(conversations.id, id),
            eq(conversations.userId, LOCAL_USER_ID),
            eq(conversations.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!updated) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation changed while its settings were being updated.",
        );
      }
      return updated;
    });
  }

  async appendMessage(
    conversationId: string,
    input: AppendMessageInput,
  ): Promise<{ conversation: ConversationSummary; message: MessageRecord }> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);

      if (!conversation) {
        throw new RepositoryError(
          "CONVERSATION_NOT_FOUND",
          "Conversation was not found.",
        );
      }

      if (input.parentMessageId) {
        const [parent] = await transaction
          .select({ conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.id, input.parentMessageId))
          .limit(1);

        if (!parent) {
          throw new RepositoryError(
            "MESSAGE_NOT_FOUND",
            "Parent message was not found.",
          );
        }
        if (parent.conversationId !== conversationId) {
          throw new RepositoryError(
            "INVALID_MESSAGE_PARENT",
            "Parent message belongs to another conversation.",
          );
        }
      }

      const [message] = await transaction
        .insert(messages)
        .values({
          conversationId,
          parentMessageId: input.parentMessageId,
          role: input.role,
          content: input.content,
          status: input.status,
          model: input.model,
          citations: input.citations,
          verification: input.verification ?? null,
        })
        .returning();

      const [updated] = await transaction
        .update(conversations)
        .set({
          activeLeafMessageId: message.id,
          updatedAt: new Date(),
          version: sql`${conversations.version} + 1`,
        })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.version, conversation.version),
          ),
        )
        .returning();

      if (!updated) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation changed while the message was being appended.",
        );
      }

      return { conversation: updated, message };
    });
  }

  async setActiveLeaf(
    conversationId: string,
    messageId: string | null,
    expectedVersion: number,
  ): Promise<ConversationSummary> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);

      if (!conversation) {
        throw new RepositoryError(
          "CONVERSATION_NOT_FOUND",
          "Conversation was not found.",
        );
      }
      if (conversation.version !== expectedVersion) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation version does not match.",
        );
      }

      if (messageId) {
        const [leaf] = await transaction
          .select({ conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);

        if (!leaf) {
          throw new RepositoryError(
            "MESSAGE_NOT_FOUND",
            "Active leaf message was not found.",
          );
        }
        if (leaf.conversationId !== conversationId) {
          throw new RepositoryError(
            "INVALID_MESSAGE_PARENT",
            "Active leaf belongs to another conversation.",
          );
        }

        const [child] = await transaction
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.parentMessageId, messageId))
          .limit(1);
        if (child) {
          throw new RepositoryError(
            "INVALID_ACTIVE_LEAF",
            "Selected message has descendants and is not a leaf.",
          );
        }
      } else {
        const [existingMessage] = await transaction
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .limit(1);
        if (existingMessage) {
          throw new RepositoryError(
            "INVALID_ACTIVE_LEAF",
            "A non-empty conversation must select a leaf message.",
          );
        }
      }

      const [updated] = await transaction
        .update(conversations)
        .set({
          activeLeafMessageId: messageId,
          updatedAt: new Date(),
          version: sql`${conversations.version} + 1`,
        })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, LOCAL_USER_ID),
            eq(conversations.version, expectedVersion),
          ),
        )
        .returning();

      if (!updated) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation changed while the active branch was being selected.",
        );
      }

      return updated;
    });
  }
}

export function createConversationRepository<
  TQueryResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TQueryResult, typeof schema>,
): ConversationRepository<TQueryResult> {
  return new ConversationRepository(database);
}
