import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  conversations,
  memoryItems,
  memoryUsages,
  messages,
  promptRuns,
  knowledgeCollections,
  knowledgeDocuments,
  knowledgeChunks,
  type PromptRunRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import type { RetrievedMemory } from "@/lib/memory/memoryRetrieval";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";
import { MEMORY_DOMAIN_POLICIES, memoryModuleForConversationMode } from "@/lib/memory/domainPolicy";
import { knowledgeAudit, type KnowledgeRunContext } from "@/lib/knowledge/audit";
import { assessMemorySourceRevision, type MemoryReadContext } from "@/lib/memory/sourceReference";
import type { SummaryUse } from "@/lib/conversation/summary";
import { createConversationSummaryRepository, summaryModelKey } from "./conversationSummaryRepository";
import { createMemoryControlRepository } from "./memoryControlRepository";
import { controlFor } from "@/lib/memory/controls";
import { documentSourceHash, sourceSegments, fallbackChunkId } from "@/lib/knowledge/sourceIndex";

export class PromptRunRepositoryError extends Error {
  constructor(
    readonly code: "CONVERSATION_NOT_FOUND" | "PROMPT_CONTEXT_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "PromptRunRepositoryError";
  }
}

export type FinalPromptRunStatus = "completed" | "failed" | "cancelled";

export interface PromptRunRepositoryPort {
  start(
    envelope: PromptEnvelope,
    usedMemories?: readonly RetrievedMemory[],
    knowledge?: KnowledgeRunContext,
    summary?: SummaryUse,
  ): Promise<PromptRunRecord>;
  finish(
    id: string,
    status: FinalPromptRunStatus,
    errorCode?: string | null,
  ): Promise<PromptRunRecord | null>;
  get(id: string): Promise<PromptRunRecord | null>;
}

export class PromptRunRepository<
  TQueryResult extends PgQueryResultHKT,
> implements PromptRunRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  start(
    envelope: PromptEnvelope,
    usedMemories: readonly RetrievedMemory[] = [],
    knowledge?: KnowledgeRunContext,
    summary?: SummaryUse,
  ): Promise<PromptRunRecord> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select({ activeLeafMessageId: conversations.activeLeafMessageId, mode: conversations.mode })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, envelope.conversation.id),
            eq(conversations.userId, LOCAL_USER_ID),
          ),
        )
        .for("share")
        .limit(1);
      if (!conversation) {
        throw new PromptRunRepositoryError(
          "CONVERSATION_NOT_FOUND",
          "Conversation was not found.",
        );
      }
      const memoryConsumer = memoryModuleForConversationMode(conversation.mode);
      if (usedMemories.length) {
        const control = controlFor((await createMemoryControlRepository(transaction).get()).settings, memoryConsumer ?? "");
        if (!control.enabled || (!control.allowSensitive && usedMemories.some((memory) => memory.sensitivity === "sensitive"))) throw new PromptRunRepositoryError("PROMPT_CONTEXT_CONFLICT", "记忆读取开关已变化，请重新生成上下文；尚未调用模型。");
      }
      if (summary) await createConversationSummaryRepository(transaction).verifyUse(envelope.conversation.id, envelope.conversation.activeLeafId, summaryModelKey(envelope.provider), summary);
      if (usedMemories.length > 0 && (!memoryConsumer || MEMORY_DOMAIN_POLICIES[memoryConsumer].personal.maxItems === 0)) {
        throw new PromptRunRepositoryError("PROMPT_CONTEXT_CONFLICT", "Conversation mode no longer allows personal memory; refresh before retrying.");
      }
      if (knowledge) {
        if (memoryConsumer !== knowledge.consumer || !memoryConsumer) throw new PromptRunRepositoryError("PROMPT_CONTEXT_CONFLICT", "资料模式已变更，请重新选择集合。");
        const policy = MEMORY_DOMAIN_POLICIES[memoryConsumer];
        const selected = await transaction.select().from(knowledgeCollections).where(and(eq(knowledgeCollections.userId, LOCAL_USER_ID), inArray(knowledgeCollections.id, knowledge.collectionIds))).orderBy(asc(knowledgeCollections.id)).for("share");
        if (!policy.knowledge.maxItems || selected.length !== knowledge.collectionIds.length || selected.some((value) => !policy.collectionModules.includes(value.module)) || knowledge.result.hits.length > policy.knowledge.maxItems || knowledge.result.estimatedTokens > policy.knowledge.maxEstimatedTokens) throw new PromptRunRepositoryError("PROMPT_CONTEXT_CONFLICT", "所选资料范围或预算已变更，请重新选择。");
        const context: MemoryReadContext = { ownerId: LOCAL_USER_ID, consumer: memoryConsumer, collections: selected.map((value) => ({ module: value.module, collectionId: value.id })), datasets: [], conversation: null, game: null };
        for (const hit of knowledge.result.hits) {
          if (knowledge.result.fallback === "source-text") {
            const [root] = await transaction.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.id, hit.documentId), eq(knowledgeDocuments.userId, LOCAL_USER_ID), eq(knowledgeDocuments.collectionId, hit.collectionId), eq(knowledgeDocuments.version, hit.version)));
            const part = root ? sourceSegments(root.content).find((value) => fallbackChunkId(root.id, root.version, value.ordinal) === hit.chunkId) : null;
            const offset = part ? hit.startLine - part.startLine : -1;
            const excerpt = part && offset >= 0 ? Array.from(part.content.split("\n").slice(offset).join("\n")).slice(0, 500).join("") : "";
            const endLine = part ? Math.min(part.endLine, hit.startLine + excerpt.split("\n").length - 1) : -1;
            if (!selected.some((value) => value.id === hit.collectionId && value.module === hit.module) || !root || !part || root.contentHash !== hit.contentHash || root.title !== hit.title || part.heading !== hit.heading || documentSourceHash({ title: root.title, sourceKey: root.sourceKey, format: root.format, content: root.content, sourceUrl: root.sourceUrl, fileName: root.fileName }) !== root.contentHash || part.contentHash !== hit.chunkHash || !excerpt || excerpt !== hit.content || endLine !== hit.endLine) throw new PromptRunRepositoryError("PROMPT_CONTEXT_CONFLICT", "原文降级来源已变化，未调用模型，请重新检索。");
            continue;
          }
          const [live] = await transaction.select({ id: knowledgeDocuments.id, version: knowledgeDocuments.version, contentHash: knowledgeDocuments.contentHash, chunkHash: knowledgeChunks.contentHash, collectionId: knowledgeDocuments.collectionId }).from(knowledgeDocuments).innerJoin(knowledgeChunks, and(eq(knowledgeChunks.documentId, knowledgeDocuments.id), eq(knowledgeChunks.documentVersion, knowledgeDocuments.version))).where(and(eq(knowledgeDocuments.userId, LOCAL_USER_ID), eq(knowledgeDocuments.id, hit.documentId), eq(knowledgeChunks.id, hit.chunkId), eq(knowledgeDocuments.collectionId, hit.collectionId))).limit(1);
          const liveReference = live ? { ...hit.reference, ownerId: LOCAL_USER_ID, sourceId: live.id, revision: { version: live.version, contentHash: live.contentHash } } : null;
          if (!assessMemorySourceRevision(context, hit.reference, liveReference, new Date()).allowed || live?.chunkHash !== hit.chunkHash) throw new PromptRunRepositoryError("PROMPT_CONTEXT_CONFLICT", "资料已更正或删除，本次尚未调用模型，请重试。");
        }
      }
      if (
        envelope.trigger === "send" &&
        conversation.activeLeafMessageId !== envelope.conversation.activeLeafId
      ) {
        throw new PromptRunRepositoryError(
          "PROMPT_CONTEXT_CONFLICT",
          "Conversation branch changed before the model run was recorded.",
        );
      }
      if (envelope.trigger === "retry") {
        const activeLeafId = envelope.conversation.activeLeafId;
        const [branchMessage] = activeLeafId
          ? await transaction
              .select({ id: messages.id })
              .from(messages)
              .where(
                and(
                  eq(messages.id, activeLeafId),
                  eq(messages.conversationId, envelope.conversation.id),
                ),
              )
              .limit(1)
          : [];
        if (!branchMessage) {
          throw new PromptRunRepositoryError(
            "PROMPT_CONTEXT_CONFLICT",
            "Retry branch was not found in the conversation.",
          );
        }
      }

      const [run] = await transaction
        .insert(promptRuns)
        .values({
          id: envelope.runId,
          userId: LOCAL_USER_ID,
          conversationId: envelope.conversation.id,
          activeLeafMessageId: envelope.conversation.activeLeafId,
          trigger: envelope.trigger,
          envelopeSchemaVersion: envelope.schemaVersion,
          composerVersion: envelope.composer.version,
          contentHash: envelope.integrity.contentHash,
          provider: envelope.provider.provider,
          baseUrl: envelope.provider.baseUrl,
          model: envelope.provider.model,
          messageCount: envelope.request.messages.length,
          containsMemory: envelope.privacy.containsMemory,
          status: "started",
          ...(knowledge ? { knowledgeRetrieval: knowledgeAudit(knowledge) } : {}),
          ...(summary ? { summaryUsage: summary } : {}),
          createdAt: new Date(envelope.createdAt),
        })
        .returning();

      const usedAt = new Date(envelope.createdAt);
      for (const memory of usedMemories) {
        const [updatedMemory] = await transaction
          .update(memoryItems)
          .set({
            lastUsedAt: usedAt,
            useCount: sql`${memoryItems.useCount} + 1`,
          })
          .where(
            and(
              eq(memoryItems.id, memory.id),
              eq(memoryItems.userId, LOCAL_USER_ID),
              eq(memoryItems.version, memory.version),
              or(
                isNull(memoryItems.validUntil),
                gt(memoryItems.validUntil, usedAt),
              ),
            ),
          )
          .returning({ id: memoryItems.id });
        if (!updatedMemory) {
          throw new PromptRunRepositoryError(
            "PROMPT_CONTEXT_CONFLICT",
            "A selected memory changed before the model run was recorded.",
          );
        }
      }
      if (usedMemories.length > 0) {
        await transaction.insert(memoryUsages).values(
          usedMemories.map((memory) => ({
            userId: LOCAL_USER_ID,
            memoryItemId: memory.id,
            promptRunId: envelope.runId,
            conversationId: envelope.conversation.id,
            queryMessageId: envelope.conversation.activeLeafId,
            rank: memory.rank,
            score: memory.score,
            estimatedTokens: memory.estimatedTokens,
            createdAt: usedAt,
          })),
        );
      }
      return run;
    });
  }

  async finish(
    id: string,
    status: FinalPromptRunStatus,
    errorCode: string | null = null,
  ): Promise<PromptRunRecord | null> {
    const [run] = await this.database
      .update(promptRuns)
      .set({ status, errorCode, completedAt: new Date() })
      .where(
        and(
          eq(promptRuns.id, id),
          eq(promptRuns.userId, LOCAL_USER_ID),
          eq(promptRuns.status, "started"),
        ),
      )
      .returning();
    return run ?? null;
  }

  async get(id: string): Promise<PromptRunRecord | null> {
    const [run] = await this.database
      .select()
      .from(promptRuns)
      .where(and(eq(promptRuns.id, id), eq(promptRuns.userId, LOCAL_USER_ID)))
      .limit(1);
    return run ?? null;
  }
}

export function createPromptRunRepository<
  TQueryResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TQueryResult, typeof schema>,
): PromptRunRepository<TQueryResult> {
  return new PromptRunRepository(database);
}
