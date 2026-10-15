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
