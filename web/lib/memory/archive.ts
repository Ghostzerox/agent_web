import { z } from "zod";
import { collectionInputSchema, documentInputSchema } from "@/lib/knowledge/documents";
import { palaceRoomSchema, validateLayout } from "./palace";
import { memoryControlsSchema } from "./controls";
export const MEMORY_PACKAGE_MAX_BYTES = 4_000_000;
const unique = (ids: string[]) => new Set(ids).size === ids.length;
export const memoryExportSelectionSchema = z.object({ memories: z.boolean(), palaces: z.boolean(), collectionIds: z.array(z.uuid()).max(10).refine(unique) }).strict().refine((v) => v.memories || v.palaces || v.collectionIds.length > 0, "请至少选择一种数据。");
export const archiveMemorySchema = z.object({ id: z.uuid(), version: z.number().int().positive(), content: z.string().min(1).max(10000), kind: z.enum(["preference", "goal", "profile", "fact"]), sensitivity: z.enum(["low", "personal", "sensitive"]), pinned: z.boolean(), validUntil: z.iso.datetime().nullable() }).strict();
export const memoryPackageSchema = z.object({
  format: z.literal("ai-study-companion.memory-package"), schemaVersion: z.literal(1), exportedAt: z.iso.datetime(),
  memories: z.array(archiveMemorySchema).max(1000),
  collections: z.array(collectionInputSchema.extend({ id: z.uuid(), version: z.number().int().positive(), documents: z.array(documentInputSchema.extend({ id: z.uuid(), version: z.number().int().positive() }).strict()).max(100) }).strict()).max(10),
  palaces: z.array(z.object({ id: z.uuid(), title: z.string().min(1).max(120), purpose: z.enum(["navigation", "learning"]), version: z.number().int().positive(), rooms: z.array(palaceRoomSchema).max(6) }).strict()).max(10),
  controls: memoryControlsSchema.optional(),
}).strict().superRefine((value, context) => {
  const ids = [...value.memories, ...value.collections, ...value.palaces, ...value.collections.flatMap((c) => c.documents)].map((r) => r.id);
  if (!unique(ids)) context.addIssue({ code: "custom", message: "文件中有重复ID。" });
  for (const collection of value.collections) if (!unique(collection.documents.map((d) => d.sourceKey))) context.addIssue({ code: "custom", message: "同一集合有重复来源标识。" });
  for (const palace of value.palaces) try { validateLayout(palace.rooms); } catch { context.addIssue({ code: "custom", message: "宫殿布局无效。" }); }
});
export type MemoryPackage = z.infer<typeof memoryPackageSchema>;
export type MemoryManifest = { memories: { id: string; version: number }[]; collections: { id: string; version: number; title: string; module: string }[]; documents: { id: string; version: number }[]; palaces: { id: string; version: number }[] };
export function parseMemoryPackage(text: string): MemoryPackage {
  if (new TextEncoder().encode(text).length > MEMORY_PACKAGE_MAX_BYTES) throw new Error("记忆包最多4MB，请分批导出。");
  return memoryPackageSchema.parse(JSON.parse(text));
}
/** Local-only dry run. Same ID/version is NOT proof of identical content or authority to restore. */
export function previewMemoryPackage(file: MemoryPackage, live: MemoryManifest) {
  const compare = (rows: { id: string; version: number }[], current: { id: string; version: number }[]) => rows.map((row) => { const existing = current.find((r) => r.id === row.id); return { id: row.id, state: !existing ? "new-id" : existing.version === row.version ? "same-id-version" : "version-conflict" }; });
  const memories = compare(file.memories, live.memories), collections = compare(file.collections, live.collections), documents = compare(file.collections.flatMap((c) => c.documents), live.documents), palaces = compare(file.palaces, live.palaces);
  const memoryIds = new Set([...file.memories, ...live.memories].map((r) => r.id)); const documentIds = new Set([...file.collections.flatMap((c) => c.documents), ...live.documents].map((r) => r.id));
  let unresolved = 0;
  for (const p of file.palaces) for (const room of p.rooms) for (const locus of room.loci) { const source = locus.binding.source; if (source.kind === "unit" || !(source.kind === "memory" ? memoryIds : documentIds).has(source.id)) unresolved++; }
  return { memories, collections, documents, palaces, unresolved, writes: 0 as const, warning: "只预览，不恢复、不覆盖、不授予权限。同ID/版本不代表正文相同；单元引用需原插件材料和授权，来源修订仍须核对。" };
}
