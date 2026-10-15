import { describe, expect, it } from "vitest";
import {
  createMemorizationService,
  type MemorizationGatewayPort,
} from "@/lib/memorization/service";

function gateway(options: { modelAvailable?: boolean; draftAvailable?: boolean } = {}) {
  const entries = new Map<string, { value: unknown; version: number; updatedAt: Date }>();
  const calls: Array<{ capabilityId: string; payload: unknown }> = [];
  const port: MemorizationGatewayPort = {
    async invoke(input) {
      calls.push({ capabilityId: input.capabilityId, payload: input.payload });
      if (input.capabilityId === "storage.read-write") {
        const request = input.payload as {
          operation: "get" | "set" | "list" | "delete";
          key?: string;
          prefix?: string;
          value?: unknown;
          expectedVersion?: number;
        };
        if (request.operation === "list") {
          return {
            requestId: crypto.randomUUID(),
            data: [...entries.entries()]
              .filter(([key]) => key.startsWith(request.prefix ?? ""))
              .map(([key, found]) => ({ key, byteSize: 1, ...found })),
          };
        }
        if (request.operation === "get") {
          const key = request.key ?? "";
          const found = entries.get(key);
          return {
            requestId: crypto.randomUUID(),
            data: found ? { key, byteSize: 1, ...found } : null,
          };
        }
        if (request.operation === "delete") {
          const key = request.key ?? "";
          const current = entries.get(key);
          if (!current || current.version !== request.expectedVersion) throw new Error("conflict");
          entries.delete(key);
          return { requestId: crypto.randomUUID(), data: true };
        }
        const key = request.key ?? "";
        const current = entries.get(key);
        if ((current?.version ?? 0) !== request.expectedVersion) throw new Error("conflict");
        const saved = {
          value: request.value,
          version: (current?.version ?? 0) + 1,
          updatedAt: new Date("2026-09-29T08:00:00.000Z"),
        };
        entries.set(key, saved);
        return {
          requestId: crypto.randomUUID(),
          data: { key, byteSize: 1, ...saved },
        };
      }
      if (input.capabilityId === "model.generate") {
        if (!options.modelAvailable) throw new Error("model unavailable");
        return {
          requestId: crypto.randomUUID(),
          data: {
            score: 92,
            feedback: "关键关系准确。",
            missedPoints: [],
            model: "test-model",
          },
        };
      }
      if (!options.draftAvailable) throw new Error("draft unavailable");
      const payload = input.payload as { title: string; prompt: string; runAt: string };
      return {
        requestId: crypto.randomUUID(),
        data: {
          title: payload.title,
          prompt: payload.prompt,
          kind: "reminder",
          schedule: { type: "once", runAt: payload.runAt },
        },
      };
    },
  };
  return { port, calls };
}

describe("Phase 7.3 memorization service", () => {
  it("rejects oversized material before a storage write instead of failing after an accepted draft", async () => {
    const fake = gateway(); const service = createMemorizationService(fake.port);
    await expect(service.create({ title: "过大", sourceText: "原文", units: Array.from({ length: 24 }, (_, index) => ({ cue: `单元${index}`, content: "汉".repeat(3000) })) })).rejects.toMatchObject({ code: "MATERIAL_TOO_LARGE" });
    expect(fake.calls.some((call) => call.capabilityId === "storage.read-write" && (call.payload as { operation: string }).operation === "set")).toBe(false);
  });
  it("runs strict spelling without model calls, persists review and offers a confirmation-only draft", async () => {
    const fake = gateway({ modelAvailable: true, draftAvailable: true });
    const service = createMemorizationService(fake.port);
    const saved = await service.create({ title: "English", sourceText: "Hello world", units: [{ cue: "问好", content: "Hello world" }] });
    const result = await service.review(saved.material.id, { unitId: saved.material.units[0].id, recitation: "hello world", expectedVersion: 1, mode: "verbatim" });
    expect(result).toMatchObject({ evaluation: { source: "deterministic", spelling: { exact: false, distance: 1 } }, taskDraft: { kind: "reminder" } });
    expect(fake.calls.some((call) => call.capabilityId === "model.generate")).toBe(false);
    expect((await service.get(saved.material.id))?.material.attempts[0]).toMatchObject({ mode: "verbatim" });
    await expect(service.review(saved.material.id, { unitId: saved.material.units[0].id, recitation: "Hello world", expectedVersion: 1, mode: "verbatim" })).rejects.toMatchObject({ code: "MATERIAL_VERSION_CONFLICT" });
  });
  it("preserves unchanged unit history but resets changed units and checks stale edits", async () => {
    const service = createMemorizationService(gateway().port);
    const saved = await service.create({ title: "A", sourceText: "第一段", units: [{ cue: "一", content: "第一段" }] });
    await service.review(saved.material.id, { unitId: saved.material.units[0].id, recitation: "第一段", expectedVersion: 1, mode: "verbatim" });
    const unchanged = await service.update(saved.material.id, { title: "改名", sourceText: "第一段", units: [{ cue: "一", content: "第一段" }], expectedVersion: 2 });
    expect(unchanged?.material.units[0]).toMatchObject({ id: saved.material.units[0].id, reviewCount: 1 });
    const changed = await service.update(saved.material.id, { title: "改名", sourceText: "第二段", units: [{ cue: "二", content: "第二段" }], expectedVersion: 3 });
    expect(changed?.material.units[0].id).not.toBe(saved.material.units[0].id);
    expect(changed?.material.attempts).toEqual([]);
    await expect(service.update(saved.material.id, { title: "覆盖", sourceText: "旧", units: [{ cue: "旧", content: "旧" }], expectedVersion: 3 })).rejects.toMatchObject({ code: "MATERIAL_VERSION_CONFLICT" });
  });
  it("does not dilute semantic evaluation with a low lexical-overlap score", async () => {
    const service = createMemorizationService(gateway({ modelAvailable: true }).port);
    const saved = await service.create({ title: "蒸发", sourceText: "液态水变成水蒸气叫蒸发", units: [{ cue: "蒸发", content: "液态水变成水蒸气叫蒸发" }] });
    const reviewed = await service.review(saved.material.id, { unitId: saved.material.units[0].id, recitation: "水由液体变为水蒸气，这个过程叫蒸发。", expectedVersion: saved.storageVersion });
    expect(reviewed?.evaluation.score).toBe(92);
    expect(reviewed?.evaluation.localScore).toBeLessThan(92);
  });
  it("forms material, review, learning record and task-draft loop through the gateway", async () => {
    const fake = gateway({ modelAvailable: true, draftAvailable: true });
    const service = createMemorizationService(
      fake.port,
      () => new Date("2026-09-29T08:00:00.000Z"),
    );
    const created = await service.create({
      title: "认识论",
      sourceText: "实践是检验真理的唯一标准。",
      units: [{ cue: "真理标准", content: "实践是检验真理的唯一标准。" }],
    });
    const reviewed = await service.review(created.material.id, {
      unitId: created.material.units[0].id,
      recitation: "实践是检验真理的唯一标准。",
      expectedVersion: created.storageVersion,
    });
    expect(reviewed).toMatchObject({
      evaluation: { source: "model", model: "test-model" },
      material: { attempts: [{ source: "model" }] },
      taskDraft: { kind: "reminder" },
    });
    expect(await service.list()).toMatchObject([
      { title: "认识论", reviewedUnitCount: 1 },
    ]);
    expect(fake.calls.map((call) => call.capabilityId)).toEqual(
      expect.arrayContaining(["storage.read-write", "model.generate", "task.create-draft"]),
    );
    expect(fake.calls.find((call) => call.capabilityId === "model.generate")?.payload)
      .toMatchObject({ operation: "memorization.evaluate", input: { localScore: 100 } });
    expect(fake.calls.find((call) => call.capabilityId === "task.create-draft")?.payload)
      .toMatchObject({ intent: "review", activityId: "memorization.review" });
    await expect(service.delete(created.material.id, {
      expectedVersion: reviewed!.storageVersion,
    })).resolves.toBe(true);
    await expect(service.list()).resolves.toEqual([]);
  });

  it("keeps scoring usable when optional model and task grants are unavailable", async () => {
    const fake = gateway();
    const service = createMemorizationService(fake.port, () => new Date("2026-09-29T08:00:00.000Z"));
    const created = await service.create({
      title: "短文",
      sourceText: "需要记忆的原文。",
      units: [{ cue: "短文", content: "需要记忆的原文。" }],
    });
    const reviewed = await service.review(created.material.id, {
      unitId: created.material.units[0].id,
      recitation: "需要记忆的原文。",
      expectedVersion: created.storageVersion,
    });
    expect(reviewed).toMatchObject({
      evaluation: { source: "deterministic", score: 100 },
      taskDraft: null,
      taskDraftUnavailable: true,
    });
  });
});
