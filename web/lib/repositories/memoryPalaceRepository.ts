import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/lib/db/schema";
import { memoryPalaces, users, memoryItems, knowledgeDocuments, knowledgeCollections } from "@/lib/db/schema";
import { LOCAL_USER_ID } from "./conversationRepository";
import { createKnowledgeRepository } from "./knowledgeRepository";
import { MEMORY_DOMAIN_POLICIES } from "@/lib/memory/domainPolicy";
import { summaryHash } from "@/lib/conversation/summary";
import { createPalaceSchema, palaceOperationSchema, palaceRoomForLocus, assertPalaceSource, validateLayout, PalaceError, orderPalaceRecall, type PalaceView, type PalaceSourceInput, type PalaceRoom, type PalaceLocus } from "@/lib/memory/palace";
import type { createMemorizationService } from "@/lib/memorization/service";
import type { MemorizationUnit } from "@/lib/memorization/domain";
import type { RecallStrategy } from "@/lib/memorization/learningTools";
type LearningPort = Pick<ReturnType<typeof createMemorizationService>, "list" | "get" | "review">;
type MaterialReads = Map<string, ReturnType<LearningPort["get"]>>;
import type { PalaceSourceView, PalaceCatalog, PalaceRecallPlan } from "@/lib/memory/palace";
export class MemoryPalaceRepository<T extends PgQueryResultHKT> {
  constructor(private readonly db: PgDatabase<T, typeof schema>, private readonly learning: LearningPort) {}
  async list() { return this.db.select().from(memoryPalaces).where(eq(memoryPalaces.userId, LOCAL_USER_ID)).orderBy(desc(memoryPalaces.updatedAt)); }
  async get(id: string): Promise<PalaceView> { const [row] = await this.db.select().from(memoryPalaces).where(and(eq(memoryPalaces.id, id), eq(memoryPalaces.userId, LOCAL_USER_ID))); if (!row) throw new PalaceError("宫殿不存在或无权访问。", 404); return row; }
  async create(raw: unknown) {
    const input = createPalaceSchema.parse(raw);
    return this.db.transaction(async (tx) => {
      await tx.insert(users).values({ id: LOCAL_USER_ID }).onConflictDoNothing(); await tx.select({ id: users.id }).from(users).where(eq(users.id, LOCAL_USER_ID)).for("update");
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(memoryPalaces).where(eq(memoryPalaces.userId, LOCAL_USER_ID));
      if (count >= 10) throw new PalaceError("最多10个宫殿，请先整理布局。");
      return (await tx.insert(memoryPalaces).values({ ...input, userId: LOCAL_USER_ID }).returning())[0];
    });
  }
  async source(purpose: PalaceView["purpose"], module: PalaceRoom["module"], source: PalaceSourceInput, expected?: string, reads?: MaterialReads): Promise<PalaceSourceView> {
    assertPalaceSource(purpose, module, source);
    if (source.kind === "memory") {
      const [meta] = await this.db.select({ version: memoryItems.version, validUntil: memoryItems.validUntil }).from(memoryItems).where(and(eq(memoryItems.id, source.id), eq(memoryItems.userId, LOCAL_USER_ID)));
      if (!meta) return { status: "missing" }; if (meta.validUntil && meta.validUntil <= new Date()) return { status: "expired" };
      const revision = await summaryHash({ kind: "memory", id: source.id, version: meta.version }); if (expected && revision !== expected) return { status: "changed" };
      const [row] = await this.db.select().from(memoryItems).where(and(eq(memoryItems.id, source.id), eq(memoryItems.userId, LOCAL_USER_ID), eq(memoryItems.version, meta.version), or(isNull(memoryItems.validUntil), gt(memoryItems.validUntil, new Date()))));
      if (!row) return { status: "changed" };
      return { status: "ready", revision, title: `${row.kind} · v${row.version}`, text: row.content, url: row.sourceConversationId ? `/chat?session=${row.sourceConversationId}` : "/memory", useCount: row.useCount, lastUsedAt: row.lastUsedAt?.toISOString() ?? null };
    }
    if (source.kind === "knowledge") {
      const [meta] = await this.db.select({ id: knowledgeDocuments.id, version: knowledgeDocuments.version, hash: knowledgeDocuments.contentHash, module: knowledgeCollections.module }).from(knowledgeDocuments).innerJoin(knowledgeCollections, and(eq(knowledgeCollections.id, knowledgeDocuments.collectionId), eq(knowledgeCollections.userId, knowledgeDocuments.userId))).where(and(eq(knowledgeDocuments.id, source.id), eq(knowledgeDocuments.userId, LOCAL_USER_ID), eq(knowledgeCollections.userId, LOCAL_USER_ID), eq(knowledgeCollections.module, module as typeof knowledgeCollections.$inferSelect.module))).limit(1);
      if (!meta || !MEMORY_DOMAIN_POLICIES[module].collectionModules.includes(meta.module)) return { status: "missing" };
      const revision = await summaryHash({ kind: "knowledge", id: meta.id, version: meta.version, hash: meta.hash }); if (expected && revision !== expected) return { status: "changed" };
      try { const row = await createKnowledgeRepository(this.db).getDocument(source.id, meta.version); return { status: "ready", revision, title: `${row.title} · v${row.version}`, text: row.content.slice(0, 5000), url: `/memory?document=${row.id}&version=${row.version}&line=1` }; } catch { return { status: "changed" }; }
    }
    // Per-route request only: one authorized read per material, never a cross-request body cache.
    if (reads && !reads.has(source.id)) reads.set(source.id, this.learning.get(source.id));
    const stored = await (reads?.get(source.id) ?? this.learning.get(source.id));
    if (!stored) return { status: "missing" }; const unit = stored.material.units.find((value) => value.id === source.unitId); if (!unit) return { status: "changed" };
    const revision = await summaryHash({ kind: "unit", id: source.id, sourceText: stored.material.sourceText, unitId: unit.id, cue: unit.cue, content: unit.content });
    if (expected && revision !== expected) return { status: "changed" };
    return { status: "ready", revision, title: stored.material.title, text: unit.content, url: "/study/memorization", unit, storageVersion: stored.storageVersion };
  }
  async catalog(module: PalaceRoom["module"]): Promise<PalaceCatalog> {
    const memories = ["professional", "companion", "reflection"].includes(module) ? await this.db.select({ id: memoryItems.id, content: memoryItems.content }).from(memoryItems).where(and(eq(memoryItems.userId, LOCAL_USER_ID), or(isNull(memoryItems.validUntil), gt(memoryItems.validUntil, new Date())))).orderBy(desc(memoryItems.updatedAt)).limit(101) : [];
    const documents = module !== "companion" ? await this.db.select({ id: knowledgeDocuments.id, title: knowledgeDocuments.title }).from(knowledgeDocuments).innerJoin(knowledgeCollections, and(eq(knowledgeDocuments.collectionId, knowledgeCollections.id), eq(knowledgeDocuments.userId, knowledgeCollections.userId))).where(and(eq(knowledgeDocuments.userId, LOCAL_USER_ID), eq(knowledgeCollections.userId, LOCAL_USER_ID), eq(knowledgeCollections.module, module as typeof knowledgeCollections.$inferSelect.module))).orderBy(desc(knowledgeDocuments.updatedAt)).limit(201) : [];
    const materials = module === "memorization" ? await this.learning.list() : [];
    return { memories: memories.slice(0, 100).map(({ id, content }) => ({ id, title: content.slice(0, 80) })), documents: documents.slice(0, 200), materials, truncated: memories.length > 100 || documents.length > 200 };
  }
  async mutate(id: string, raw: unknown) {
    const input = palaceOperationSchema.parse(raw);
    // Gateway operations own their transaction. Do not nest them inside a layout transaction.
    // CAS below binds this read to the saved room/purpose; subsequent use revalidates source revision.
    let binding: PalaceLocus["binding"] | undefined;
    if (input.operation === "add-locus" || input.operation === "rebind") {
      const snapshot = await this.get(id);
      if (snapshot.version !== input.expectedVersion) throw new PalaceError("布局已变化，请刷新。");
      const targetRoom = input.operation === "add-locus" ? snapshot.rooms.find((r) => r.id === input.roomId) : palaceRoomForLocus(snapshot, input.locusId);
      if (!targetRoom) throw new PalaceError("房间不存在。", 404);
      const resolved = await this.source(snapshot.purpose, targetRoom.module, input.source);
      if (resolved.status !== "ready" || !resolved.revision) throw new PalaceError("来源已失效，请先打开原始模块核对。");
      binding = { source: input.source, revision: resolved.revision };
    }
    return this.db.transaction(async (tx) => {
      const [saved] = await tx.select().from(memoryPalaces).where(and(eq(memoryPalaces.id, id), eq(memoryPalaces.userId, LOCAL_USER_ID))).for("update");
      if (!saved) throw new PalaceError("宫殿不存在或无权访问。", 404); if (saved.version !== input.expectedVersion) throw new PalaceError("布局已变化，请刷新；未保存的联想不会覆盖新版。");
      const rooms = structuredClone(saved.rooms); const working = { ...saved, rooms };
      const room = "roomId" in input ? rooms.find((r) => r.id === input.roomId) : "locusId" in input ? palaceRoomForLocus(working, input.locusId) : null;
      if (("roomId" in input || "locusId" in input) && !room) throw new PalaceError("房间不存在。", 404);
      const locus = room && "locusId" in input ? room.loci.find((l) => l.id === input.locusId)! : null;
      switch (input.operation) {
        case "rename": working.title = input.title; break;
        case "add-room": if (saved.purpose === "learning" && input.module !== "memorization") throw new PalaceError("学习宫殿房间必须属于背书域。", 403); rooms.push({ id: crypto.randomUUID(), title: input.title, module: input.module, loci: [] }); break;
        case "rename-room": room!.title = input.title; break;
        case "delete-room": rooms.splice(rooms.findIndex((r) => r.id === input.roomId), 1); break;
        case "add-locus": room!.loci.push({ id: crypto.randomUUID(), label: input.label, association: input.association, binding: binding! }); break;
        case "edit-locus": locus!.label = input.label; locus!.association = input.association; break;
        case "rebind": locus!.binding = binding!; break;
        case "delete-locus": room!.loci.splice(room!.loci.indexOf(locus!), 1); break;
        case "move-locus": { const index = room!.loci.indexOf(locus!); const target = index + (input.direction === "up" ? -1 : 1); if (target >= 0 && target < room!.loci.length) [room!.loci[index], room!.loci[target]] = [room!.loci[target], room!.loci[index]]; break; }
      }
      validateLayout(rooms);
      return (await tx.update(memoryPalaces).set({ title: working.title, rooms, version: saved.version + 1, updatedAt: new Date() }).where(eq(memoryPalaces.id, id)).returning())[0];
    });
  }
  async delete(id: string, expectedVersion: number) { const removed = await this.db.delete(memoryPalaces).where(and(eq(memoryPalaces.id, id), eq(memoryPalaces.userId, LOCAL_USER_ID), eq(memoryPalaces.version, expectedVersion))).returning({ id: memoryPalaces.id }); if (!removed.length) throw new PalaceError("宫殿已变化或不存在，请刷新。"); }
  async locate(id: string, locusId: string) { const palace = await this.get(id); const room = palaceRoomForLocus(palace, locusId); const locus = room.loci.find((v) => v.id === locusId)!; return { palace, room, locus }; }
  async resolve(id: string, locusId: string) { const { palace, room, locus } = await this.locate(id, locusId); return this.source(palace.purpose, room.module, locus.binding.source, locus.binding.revision); }
  async route(id: string, roomId: string, strategy: RecallStrategy, seed: string, count: number): Promise<PalaceRecallPlan> {
    const palace = await this.get(id); const room = palace.rooms.find((r) => r.id === roomId); if (!room || room.module !== "memorization") throw new PalaceError("只能在背书房间开始路线训练。");
    const items: { locus: PalaceLocus; unit: MemorizationUnit }[] = []; const blocked: string[] = [];
    const reads: MaterialReads = new Map();
    for (const locus of room.loci) { const resolved = await this.source(palace.purpose, room.module, locus.binding.source, locus.binding.revision, reads); if (resolved.status === "ready" && resolved.unit) items.push({ locus, unit: resolved.unit }); else blocked.push(locus.id); }
    return { version: palace.version, steps: orderPalaceRecall(items, strategy, seed, new Date(), count), blocked };
  }
  async review(id: string, locusId: string, expectedVersion: number, expectedStorageVersion: number, recitation: string) {
    const { palace, room, locus } = await this.locate(id, locusId); if (palace.version !== expectedVersion) throw new PalaceError("布局已变化，请重新开始本题。");
    const source = locus.binding.source; if (room.module !== "memorization" || source.kind !== "unit") throw new PalaceError("该位置不是背书单元。", 403);
    const resolved = await this.source(palace.purpose, room.module, source, locus.binding.revision);
    if (resolved.status !== "ready" || resolved.storageVersion !== expectedStorageVersion) throw new PalaceError("材料已更正或本题可能已提交；请刷新核对复习记录，不会重复评分。");
    const result = await this.learning.review(source.id, { unitId: source.unitId, expectedVersion: expectedStorageVersion, recitation, mode: "verbatim" });
    if (!result) throw new PalaceError("材料已删除；没有保存新的评分。");
    return result;
  }
}
export function createMemoryPalaceRepository<T extends PgQueryResultHKT>(db: PgDatabase<T, typeof schema>, learning: LearningPort) { return new MemoryPalaceRepository(db, learning); }
