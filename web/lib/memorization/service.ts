import { z } from "zod";
import type { PluginCapabilityGateway } from "@/lib/plugins/capabilityGateway";
import { checkSpelling, spellingOptionsSchema } from "@/lib/memorization/spelling";
import { PLUGIN_STORAGE_MAX_VALUE_BYTES } from "@/lib/repositories/pluginStorageRepository";
import {
  memorizationMaterialSchema,
  memorizationUnitInputSchema,
  materialStorageKey,
  MAX_MEMORIZATION_MATERIALS,
  MEMORIZATION_PLUGIN_ID,
  nextReviewInstant,
  scoreRecitation,
  summarizeMaterial,
  type MemorizationMaterial,
} from "@/lib/memorization/domain";
import {
  pluginStorageEntrySchema,
  taskDraftResultSchema,
  USER_INITIATED_PLUGIN_CONTEXT,
} from "@/lib/plugins/pluginApiV1";

const modelEvaluationSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    feedback: z.string().trim().min(1).max(500),
    missedPoints: z.array(z.string().trim().min(1).max(160)).max(6),
    model: z.string().min(1),
  })
  .strict();

export const createMemorizationMaterialInputSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    sourceText: z.string().trim().min(1).max(6_000),
    units: z.array(memorizationUnitInputSchema).min(1).max(24),
  })
  .strict();

export const reviewMemorizationUnitInputSchema = z
  .object({
    unitId: z.string().uuid(),
    recitation: z.string().min(1).max(4_000).refine((value) => value.trim().length > 0),
    expectedVersion: z.number().int().positive(),
    mode: z.enum(["semantic", "verbatim"]).optional(),
    spellingOptions: spellingOptionsSchema.optional(),
  })
  .strict();

export const deleteMemorizationMaterialInputSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

import type { MemorizationTaskDraft, MemorizationReviewResult } from "@/lib/memorization/domain";

export type MemorizationGatewayPort = Pick<PluginCapabilityGateway, "invoke">;

function deterministicFeedback(score: number): string {
  if (score >= 90) return "复述覆盖完整，可以进入较长间隔复习。";
  if (score >= 80) return "主体准确，建议对照原文补齐个别表述。";
  if (score >= 60) return "已抓住部分要点，请重点核对遗漏和逻辑顺序。";
  return "当前复述与原文重合较少，建议分句理解后尽快再复习。";
}

function fitMaterialHistory(material: MemorizationMaterial): MemorizationMaterial {
  while (material.attempts.length > 1 && new TextEncoder().encode(JSON.stringify(material)).byteLength > PLUGIN_STORAGE_MAX_VALUE_BYTES) material.attempts.shift();
  if (new TextEncoder().encode(JSON.stringify(material)).byteLength > PLUGIN_STORAGE_MAX_VALUE_BYTES) throw new MemorizationServiceError("MATERIAL_TOO_LARGE", "材料超过单条存储上限，请拆分后保存；原有记录未修改。");
  return material;
}

export function createMemorizationService(
  gatewayOrFactory: MemorizationGatewayPort | (() => MemorizationGatewayPort),
  now: () => Date = () => new Date(),
) {
  const gateway = () =>
    typeof gatewayOrFactory === "function" ? gatewayOrFactory() : gatewayOrFactory;

  async function storage(operation: unknown): Promise<unknown> {
    const result = await gateway().invoke({
      pluginId: MEMORIZATION_PLUGIN_ID,
      capabilityId: "storage.read-write",
      payload: operation,
      context: USER_INITIATED_PLUGIN_CONTEXT,
    });
    return result.data;
  }

  async function readMaterial(id: string): Promise<{
    material: MemorizationMaterial;
    storageVersion: number;
  } | null> {
    const result = await storage({ operation: "get", key: materialStorageKey(id) });
    if (result === null) return null;
    const entry = pluginStorageEntrySchema.parse(result);
    return {
      material: memorizationMaterialSchema.parse(entry.value),
      storageVersion: entry.version,
    };
  }

  async function listMaterials() {
    const result = z.array(pluginStorageEntrySchema).parse(await storage({
      operation: "list",
      prefix: "memorization/materials/",
      limit: MAX_MEMORIZATION_MATERIALS,
    }));
    return result
      .map((entry) => memorizationMaterialSchema.parse(entry.value))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  return {
    async list() {
      return (await listMaterials()).map(summarizeMaterial);
    },

    get(id: string) {
      return readMaterial(id);
    },

    async update(id: string, rawInput: unknown) {
      const input = createMemorizationMaterialInputSchema.extend({ expectedVersion: z.number().int().positive() }).parse(rawInput);
      const stored = await readMaterial(id);
      if (!stored) return null;
      if (stored.storageVersion !== input.expectedVersion) throw new MemorizationServiceError("MATERIAL_VERSION_CONFLICT", "材料已变化，请刷新。");
      // Preserve review history only for unchanged content and cue. Changed units start fresh.
      const available = [...stored.material.units];
      const units = input.units.map((unit) => {
        const match = available.findIndex((old) => old.content === unit.content && old.cue === unit.cue);
        return match >= 0 ? available.splice(match, 1)[0] : { ...unit, id: crypto.randomUUID(), reviewCount: 0, lastScore: null, nextReviewAt: null, weakPoints: [] };
      });
      const ids = new Set(units.map((unit) => unit.id));
      const material = fitMaterialHistory(memorizationMaterialSchema.parse({ ...stored.material, title: input.title, sourceText: input.sourceText, units, attempts: stored.material.attempts.filter((attempt) => ids.has(attempt.unitId)), updatedAt: now().toISOString() }));
      const saved = pluginStorageEntrySchema.parse(await storage({ operation: "set", key: materialStorageKey(id), value: material, expectedVersion: input.expectedVersion }));
      return { material, storageVersion: saved.version };
    },

    async delete(id: string, rawInput: unknown) {
      const input = deleteMemorizationMaterialInputSchema.parse(rawInput);
      return storage({
        operation: "delete",
        key: materialStorageKey(id),
        expectedVersion: input.expectedVersion,
      });
    },

    async create(rawInput: unknown) {
      const input = createMemorizationMaterialInputSchema.parse(rawInput);
      const current = await listMaterials();
      if (current.length >= MAX_MEMORIZATION_MATERIALS) {
        throw new MemorizationServiceError(
          "MATERIAL_LIMIT_REACHED",
          `最多保留 ${MAX_MEMORIZATION_MATERIALS} 份背书材料。`,
        );
      }
      const timestamp = now().toISOString();
      const material: MemorizationMaterial = {
        schemaVersion: 1,
        id: crypto.randomUUID(),
        title: input.title,
        sourceText: input.sourceText,
        units: input.units.map((unit) => ({
          ...unit,
          id: crypto.randomUUID(),
          reviewCount: 0,
          lastScore: null,
          nextReviewAt: null,
          weakPoints: [],
        })),
        attempts: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const saved = pluginStorageEntrySchema.parse(await storage({
        operation: "set",
        key: materialStorageKey(material.id),
        value: fitMaterialHistory(memorizationMaterialSchema.parse(material)),
        expectedVersion: 0,
      }));
      return { material, storageVersion: saved.version };
    },

    async review(id: string, rawInput: unknown): Promise<MemorizationReviewResult | null> {
      const input = reviewMemorizationUnitInputSchema.parse(rawInput);
      const stored = await readMaterial(id);
      if (!stored) return null;
      if (stored.storageVersion !== input.expectedVersion) {
        throw new MemorizationServiceError(
          "MATERIAL_VERSION_CONFLICT",
          "材料已发生变化，请刷新后重试。",
        );
      }
      const unit = stored.material.units.find((item) => item.id === input.unitId);
      if (!unit) {
        throw new MemorizationServiceError("UNIT_NOT_FOUND", "复习单元不存在。");
      }

      const spelling = input.mode === "verbatim" ? checkSpelling(unit.content, input.recitation, input.spellingOptions) : undefined;
      const localScore = spelling?.score ?? scoreRecitation(unit.content, input.recitation);
      let score = localScore;
      let source: "model" | "deterministic" = "deterministic";
      let feedback = spelling ? `逐字检查：${spelling.distance} 处编辑差异${spelling.truncated ? "，仅显示前 60 处" : ""}；按所选大小写、标点和空白规则，不评价语义。` : `模型评价不可用；以下仅为字面覆盖参考，不代表语义正确率。${deterministicFeedback(score)}`;
      let missedPoints = spelling ? [] : score >= 90 ? [] : ["请对照原文核对遗漏的关键词与逻辑关系。"];
      let model: string | null = null;
      if (!spelling) try {
        const result = await gateway().invoke({
          pluginId: MEMORIZATION_PLUGIN_ID,
          capabilityId: "model.generate",
          payload: {
            operation: "memorization.evaluate",
            input: {
              materialTitle: stored.material.title,
              cue: unit.cue,
              target: unit.content,
              recitation: input.recitation,
              localScore,
            },
          },
          context: USER_INITIATED_PLUGIN_CONTEXT,
        });
        const evaluation = modelEvaluationSchema.parse(result.data);
        // Lexical overlap is a fallback, not evidence against equivalent paraphrases.
        score = evaluation.score;
        source = "model";
        feedback = evaluation.feedback;
        missedPoints = evaluation.missedPoints;
        model = evaluation.model;
      } catch {
        // The deterministic evaluator keeps review usable when model access is
        // unconfigured, unavailable, or not granted. The Gateway still audits denial.
      }

      const reviewedAt = now();
      const nextReviewAt = nextReviewInstant(reviewedAt, score);
      const attempt = {
        id: crypto.randomUUID(),
        unitId: unit.id,
        score,
        localScore,
        source,
        mode: input.mode ?? "semantic",
        ...(spelling ? { spelling: { ...spelling, changes: spelling.changes.slice(0, 3), truncated: spelling.truncated || spelling.changes.length > 3 } } : {}),
        feedback,
        missedPoints,
        reviewedAt: reviewedAt.toISOString(),
        nextReviewAt: nextReviewAt.toISOString(),
      } as const;
      const material = memorizationMaterialSchema.parse({
        ...stored.material,
        units: stored.material.units.map((item) =>
          item.id === unit.id
            ? {
                ...item,
                reviewCount: item.reviewCount + 1,
                lastScore: score,
                nextReviewAt: nextReviewAt.toISOString(),
                weakPoints: missedPoints,
              }
            : item,
        ),
        attempts: [...stored.material.attempts, attempt].slice(-40),
        updatedAt: reviewedAt.toISOString(),
      });
      fitMaterialHistory(material);
      const saved = pluginStorageEntrySchema.parse(await storage({
        operation: "set",
        key: materialStorageKey(material.id),
        value: material,
        expectedVersion: input.expectedVersion,
      }));
      let taskDraft: MemorizationTaskDraft | null = null;
      let taskDraftUnavailable = false;
      try {
        const draft = await gateway().invoke({
          pluginId: MEMORIZATION_PLUGIN_ID,
          capabilityId: "task.create-draft",
          payload: {
            intent: "review",
            activityId: "memorization.review",
            title: `复习：${material.title}`,
            prompt: `打开背书训练，复习“${material.title}”中薄弱的知识单元。`,
            runAt: nextReviewAt.toISOString(),
          },
          context: USER_INITIATED_PLUGIN_CONTEXT,
        });
        taskDraft = taskDraftResultSchema.parse(draft.data);
      } catch {
        taskDraftUnavailable = true;
      }
      return {
        material,
        storageVersion: saved.version,
        evaluation: { score, localScore, source, feedback, missedPoints, model, ...(spelling ? { spelling } : {}) },
        taskDraft,
        taskDraftUnavailable,
      };
    },
  };
}

export class MemorizationServiceError extends Error {
  constructor(
    readonly code:
      | "MATERIAL_LIMIT_REACHED"
      | "MATERIAL_TOO_LARGE"
      | "MATERIAL_VERSION_CONFLICT"
      | "UNIT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "MemorizationServiceError";
  }
}
