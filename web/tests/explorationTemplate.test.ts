import { describe, expect, it } from "vitest";
import { fogHarbor, getWorldTemplate } from "@/lib/game/exploration/catalog";
import { validateWorldTemplate } from "@/lib/game/exploration/validateTemplate";
import { createGameSessionSchema } from "@/lib/game/contracts";
import { EXPLORATION_PRESET } from "@/lib/game/exploration/preset";

describe("R7.7 complete region template", () => {
  it("validates the preset, template version and all cross-references", () => {
    validateWorldTemplate(fogHarbor);
    expect(createGameSessionSchema.safeParse({ title: EXPLORATION_PRESET.title, kind: EXPLORATION_PRESET.kind, world: EXPLORATION_PRESET.world, initialCharacter: EXPLORATION_PRESET.initialCharacter }).success).toBe(true);
    expect(() => getWorldTemplate("fog-harbor", "2.0.0")).toThrow("已保留");
    expect(fogHarbor.locations).toHaveLength(6); expect(fogHarbor.characters).toHaveLength(3);
  });
  it("rejects broken maps, duplicate unique items and invalid event destinations", () => {
    const map = structuredClone(fogHarbor); map.locations[0].exits[0].to = "absent";
    expect(() => validateWorldTemplate(map)).toThrow("未知地点");
    const inventory = structuredClone(fogHarbor); inventory.instances.push({ ...inventory.instances.find((item) => item.definitionId === "lens")!, id: "duplicate" });
    expect(() => validateWorldTemplate(inventory)).toThrow("唯一物品");
    const event = structuredClone(fogHarbor); event.events[0].stages[0].choices[0].next = "absent";
    expect(() => validateWorldTemplate(event)).toThrow("后续阶段");
    const character = structuredClone(fogHarbor); character.characters[1].revealedCard = { id: "replace-id" };
    expect(() => validateWorldTemplate(character)).toThrow();
  });
});
