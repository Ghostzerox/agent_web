import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createWorldCharacter } from "@/lib/game/exploration/characterFactory";
import { createWorldTemplateRegistry } from "@/lib/game/exploration/templateRegistry";
import type { WorldTemplate } from "@/lib/game/exploration/templateTypes";
import { startWorld, applyExplorationAction } from "@/lib/game/exploration/engine";
import { EXPLORATION_TEMPLATES, explorationSessionInput } from "@/lib/game/exploration/templateCatalog";
import { sessionExplorationTemplate } from "@/lib/game/exploration/templateReference";
import { getWorldTemplate } from "@/lib/game/exploration/catalog";
import { createGameSessionSchema } from "@/lib/game/contracts";

function garden(version = "1.0.0"): WorldTemplate {
  const rank = { id: "calm", name: "安宁", meaning: "合成测试档位" };
  return { id: "wind-garden", version, hostContract: "exploration.v1", world: "山野", region: "风铃营地", start: "camp",
    initial: { coins: 7, progress: { rating: "calm", tier: "calm", level: 2 },
      player: { ...createWorldCharacter("player", "访客", "camp", "玩家"), category: "player", controller: "user" }, message: "你来到山间营地，树上的风铃轻响。" },
    ranks: { rating: [rank], quality: [rank], tier: [rank], levelsPerTier: 2 }, slots: [],
    locations: [{ id: "camp", name: "营地", description: "山间空地", exits: [{ to: "garden", reason: "沿小路" }], points: [] },
      { id: "garden", name: "庭院", description: "有一座风铃架", exits: [{ to: "camp", reason: "回营地" }], points: [] }],
    items: [{ id: "ribbon", name: "丝带", description: "修补材料", quality: "calm", tier: "calm", rating: "calm", level: 1, stackable: true, unique: false, slot: null, abilities: [], consumable: false, price: 2 }],
    instances: [{ id: "my-ribbon", definitionId: "ribbon", owner: "player", quantity: 2, equippedSlot: null, source: "访客行装" }], consumableEffects: {},
    characters: [{ card: { ...createWorldCharacter("caretaker", "园丁", "garden", "风铃维护者"), goals: ["修补风铃"], unresolved: ["损坏的风铃", "照料花园"] },
      topics: [], knowledge: [], trader: true, initialWallet: 19,
      promise: { text: "我答应提供修补风铃的丝带。", requires: { minTick: 1 }, completion: { item: "ribbon" }, effect: { character: { id: "caretaker", relationship: "trusted", reason: "兑现风铃修补承诺", removeUnresolved: ["损坏的风铃"] } } } }],
    lore: [], events: [], epics: [] };
}

describe("exploration framework / template separation", () => {
  it("runs an unrelated world through the same engine with its own opening, funds and promises", () => {
    const { resolve } = createWorldTemplateRegistry([garden()]);
    let state = startWorld("wind-garden", "1.0.0", resolve);
    expect(state.coins).toBe(7); expect(state.progress.level).toBe(2); expect(state.lastResult).toContain("山间营地");
    state = applyExplorationAction(state, { action: "move", targetId: "garden" }, "move", resolve);
    expect(state.wallets.caretaker).toBe(19); expect(state.characters.caretaker.offeredPromise).toContain("风铃");
    state = applyExplorationAction(state, { action: "promise", targetId: "caretaker" }, "promise", resolve);
    expect(state.characters.caretaker.unresolved).toEqual(["照料花园"]);
    expect(state.characters.caretaker.relationship).toBe("trusted");
    expect(JSON.stringify(state)).not.toMatch(/雾港|镜片|林汐|海港/u);
  });
  it("pins saved versions and prevents registry mutation or duplicate versions", () => {
    const later = garden("2.0.0"); later.initial.coins = 99;
    const { resolve } = createWorldTemplateRegistry([garden(), later]);
    expect(resolve("wind-garden").version).toBe("2.0.0");
    const state = startWorld("wind-garden", "1.0.0", resolve);
    expect(applyExplorationAction(state, { action: "wait" }, "wait", resolve).coins).toBe(7);
    resolve("wind-garden", "1.0.0").initial.coins = 42;
    expect(resolve("wind-garden", "1.0.0").initial.coins).toBe(7);
    expect(() => createWorldTemplateRegistry([garden(), garden()])).toThrow("重复");
  });
  it("publishes intros and strict session drafts without revealing private world definitions", () => {
    for (const presentation of EXPLORATION_TEMPLATES) {
      const input = explorationSessionInput(presentation);
      expect(createGameSessionSchema.parse(input)).toEqual(input);
      expect(sessionExplorationTemplate(input.world.rules)).toEqual({ templateId: presentation.templateId, templateVersion: presentation.templateVersion });
      expect(getWorldTemplate(presentation.templateId, presentation.templateVersion).hostContract).toBe(presentation.hostContract);
      expect(presentation.introduction.summary.length).toBeGreaterThan(20);
      expect(JSON.stringify(presentation)).not.toContain("keeper-family");
      expect(JSON.stringify(presentation)).not.toContain("守望者盟约：");
      input.world.name = "mutated"; expect(presentation.world.name).not.toBe("mutated");
    }
    expect(sessionExplorationTemplate(["旧 d20 世界"])).toBeNull();
    expect(sessionExplorationTemplate(["exploration.v1 / wind-garden@2.3.4"])).toEqual({ templateId: "wind-garden", templateVersion: "2.3.4" });
  });
  it("keeps story names and quest-specific mutations out of generic engine / UI", () => {
    for (const file of ["lib/game/exploration/engine.ts", "components/game/ExplorationPanel.tsx", "components/game/GamePlayPanel.tsx", "components/game/ExplorationTemplatePicker.tsx"])
      expect(readFileSync(file, "utf8")).not.toMatch(/fog-harbor|雾港|镜片|林汐/u);
    expect(readFileSync("lib/game/exploration/templates/fog-harbor/public.ts", "utf8")).not.toContain('from "./world"');
  });
});
