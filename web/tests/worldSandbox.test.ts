import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { loadMigrations, migrateDatabase } from "@/lib/db/migrations";
import { createPgliteMigrationDatabase } from "./helpers/pglite";
import { blankWorldBlueprint } from "@/lib/game/worlds/blueprint";
import { compileWorld, worldDraftIssues } from "@/lib/game/worlds/compile";
import { createWorldGenerationService } from "@/lib/game/worlds/generation";
import { createGameWorldRepository } from "@/lib/repositories/gameWorldRepository";
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";
import { createGameTurnService } from "@/lib/game/gameTurnService";
import { createGameTurnSchema } from "@/lib/game/contracts";
import { resolveEncounter } from "@/lib/game/exploration/encounters";
import { startWorld } from "@/lib/game/exploration/engine";
import { withEncounterCharacters } from "@/lib/game/exploration/runtimeCharacters";
import type { WorldBrief } from "@/lib/game/worlds/contracts";
import type { ChatCompletionMessage } from "@/lib/ai/messages";

const input: WorldBrief = { brief: "无魔法田园生活，沿乡间步道旅行，不要谜案或预设人物剧情。", constraints: ["不能读心"], magic: "forbidden", numericPolicy: "qualitative" };
const person = { name: "柳青", identity: "休息的菜农", appearance: "戴草帽，袖口沾着泥土", personality: "随和，正在休息", speech: "简短自然", faction: "无所属势力", goal: "休息后回家", publicBackground: "在附近务农", usesSupernatural: false };
it("publishes an empty sandbox and persists natural encounters only in the selected branch, including actor isolation / cold reload", async () => {
  const pg = new PGlite();
  try {
    await migrateDatabase(createPgliteMigrationDatabase(pg), await loadMigrations()); const db = drizzle(pg, { schema });
    const worlds = createGameWorldRepository(db); const sessions = createGameSessionRepository(db); const blank = blankWorldBlueprint(input);
    expect(blank.characters).toEqual([]); expect(blank.hook).toBeNull(); expect(worldDraftIssues(input, blank)).toEqual([]);
    let draft = await worlds.create(input); const requests: ChatCompletionMessage[][] = [];
    draft = await createWorldGenerationService(worlds, { generate: async (messages) => { requests.push(messages); return { content: JSON.stringify(blank), model: "synthetic" }; } }).generate(draft.id, { expectedVersion: draft.version, requestId: crypto.randomUUID(), sections: Object.keys(blank) });
    expect(requests[0][0].content).toContain("不默认设计谜案"); expect(requests[0][0].content).toContain("characters可以为空");
    await worlds.publish(draft.id, draft.version); let session = await worlds.createSave(draft.id, 1, crypto.randomUUID());
    session = await sessions.updateStatus(session.id, { expectedVersion: session.version, status: "active", now: new Date() });
    const generator = { generate: vi.fn(async (messages: ChatCompletionMessage[], _signal?: AbortSignal, options?: { promptVersion: string }) => {
      requests.push(messages); return { content: options?.promptVersion === "world-encounter/v1" ? JSON.stringify({ observation: "步道边，一位菜农正坐在树荫下休息。", person }) : '{"narrative":"我在这里歇会儿，你也走累了吗？","statePatch":{}}', model: "synthetic" };
    }) };
    const service = createGameTurnService(sessions, generator, undefined, undefined, worlds.resolveSessionTemplate);
    const step = async (body: object, parentTurnId = session.activeLeafTurnId) => { session = await service.create(session.id, createGameTurnSchema.parse({ content: "合成行动", expectedVersion: session.version, parentTurnId, requestId: crypto.randomUUID(), ...body })); return session; };
    await step({ explorationAction: { action: "start", templateId: `world-${draft.id}`, templateVersion: "1.0.1" } });
    const startId = session.activeLeafTurnId!; expect(session.turns.at(-1)!.stateSnapshot.exploration!.view.events).toEqual([]); expect(generator.generate).not.toHaveBeenCalled();
    await step({ explorationAction: { action: "encounter", activity: "沿步道散步看看周围", confirmed: true } });
    const state = session.turns.at(-1)!.stateSnapshot.exploration!; const actorId = state.encounters![0].actorId;
    expect(state.characters[actorId]).toMatchObject({ name: person.name, category: "npc", controller: "ai", knownInformation: [] });
    const promoted = structuredClone(state); promoted.characters[actorId].category = "important";
    expect(withEncounterCharacters(compileWorld(draft.id, 1, input, blank), promoted).characters.find((entry) => entry.card.id === actorId)?.card.category).toBe("important");
    expect((await worlds.get(draft.id)).content!.characters).toEqual([]); expect(generator.generate).toHaveBeenCalledTimes(1);
    expect((await createGameSessionRepository(db).get(session.id))!.turns.at(-1)!.stateSnapshot.exploration!.encounters).toHaveLength(1);
    await step({ semanticInput: [{ kind: "private_thought", text: "SYNTH_PRIVATE_THOUGHT" }, { kind: "dialogue", targetId: actorId, text: "你好", channel: "direct" }] });
    expect(generator.generate).toHaveBeenCalledTimes(2); const actorPrompt = JSON.stringify(requests.at(-1));
    expect(actorPrompt).toContain("单个人物"); expect(actorPrompt).not.toContain("SYNTH_PRIVATE_THOUGHT");
    await step({ explorationAction: { action: "wait" } }, startId);
    expect(session.turns.at(-1)!.stateSnapshot.exploration!.characters[actorId]).toBeUndefined();
    expect(session.turns.at(-1)!.stateSnapshot.exploration!.encounters).toBeUndefined();
  } finally { await pg.close(); }
});
it("allows nobody, rejects malformed / magical / aborted encounters without changing the parent", async () => {
  const template = compileWorld(crypto.randomUUID(), 1, input, blankWorldBlueprint(input)); const resolve = () => template;
  const parent = startWorld(template.id, template.version, resolve); const original = JSON.stringify(parent); const action = { action: "encounter" as const, activity: "观察无人小径", confirmed: true as const };
  const generate = vi.fn().mockResolvedValue({ content: '{"observation":"小径空无一人，风吹过草地。","person":null}', model: "synthetic" });
  const result = await resolveEncounter(parent, action, crypto.randomUUID(), { generate }, resolve);
  expect(result.state.encounters).toBeUndefined(); expect(Object.keys(result.state.characters)).toEqual(["player"]);
  for (const content of ["{broken", JSON.stringify({ observation: "合成观察", person: { ...person, usesSupernatural: true } })]) {
    generate.mockResolvedValueOnce({ content, model: "synthetic" });
    await expect(resolveEncounter(parent, action, crypto.randomUUID(), { generate }, resolve)).rejects.toThrow();
  }
  const controller = new AbortController(); controller.abort();
  await expect(resolveEncounter(parent, action, crypto.randomUUID(), { generate }, resolve, controller.signal)).rejects.toThrow("取消");
  expect(JSON.stringify(parent)).toBe(original);
});
