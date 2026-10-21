import { describe, expect, it } from "vitest";
import { z } from "zod";
import { blankWorldBlueprint } from "@/lib/game/worlds/blueprint";
import { WORLD_SECTIONS, type WorldBrief } from "@/lib/game/worlds/contracts";
import { validateWorldGenerationOutput, worldGenerationPatchSchema } from "@/lib/game/worlds/generationValidation";
import { seededWorldBlueprint } from "./helpers/worldBlueprint";

const brief: WorldBrief = { brief: "合成无魔法港城", magic: "forbidden", numericPolicy: "qualitative", constraints: [] };
describe("world generation contract shared by prompt, server and local recovery", () => {
  it("derives the real nested contract, without sending unrelated item/event schemas", () => {
    const json = JSON.stringify(z.toJSONSchema(worldGenerationPatchSchema([...WORLD_SECTIONS]), { reused: "ref" }));
    expect(json).toContain("privateBackground"); expect(json).toContain("longTermGoal"); expect(json).toContain('"additionalProperties":false');
    expect(json).not.toContain("eventDesigns"); expect(json).not.toContain("drawPools");
    const partial = JSON.stringify(z.toJSONSchema(worldGenerationPatchSchema(["opening"])));
    expect(partial).toContain("playerRole"); expect(partial).not.toContain("characters"); expect(partial.length).toBeLessThan(json.length / 4);
  });
  it.each(["qualitative", "light", "specified"] as const)("accepts a complete current-shaped %s world", (numericPolicy) => {
    const content = blankWorldBlueprint({ ...brief, numericPolicy });
    expect(validateWorldGenerationOutput(JSON.stringify(content), [...WORLD_SECTIONS], null)).toMatchObject({ success: true, content });
  });
  it("accepts only a whole code fence, not prose, broken JSON or fabricated missing fields", () => {
    const full = JSON.stringify(blankWorldBlueprint(brief));
    expect(validateWorldGenerationOutput(`\n\`\`\`json\n${full}\n\`\`\`\n`, [...WORLD_SECTIONS], null)).toMatchObject({ success: true, normalizedCodeFence: true });
    for (const raw of ['{"overview":', `解释：${full}`, "null", "[]"]) expect(validateWorldGenerationOutput(raw, [...WORLD_SECTIONS], null).success).toBe(false);
  });
  it("reports exact missing nested paths, leaving caller input unchanged", () => {
    const content = seededWorldBlueprint(brief);
    const broken = JSON.parse(JSON.stringify(content)); delete broken.characters[0].profile.privateBackground;
    const raw = JSON.stringify(broken);
    expect(validateWorldGenerationOutput(raw, [...WORLD_SECTIONS], null)).toMatchObject({ success: false, stage: "schema", issues: expect.arrayContaining([expect.objectContaining({ path: "characters.0.profile.privateBackground" })]) });
    expect(JSON.stringify(broken)).toBe(raw);
  });
  it("rejects extra/locked sections and does not drop them to make invalid output pass", () => {
    const current = blankWorldBlueprint(brief); const original = JSON.stringify(current);
    expect(validateWorldGenerationOutput(JSON.stringify({ opening: current.opening, overview: current.overview }), ["opening"], current)).toMatchObject({ success: false, stage: "sections", issues: [{ path: "overview", message: expect.any(String) }] });
    expect(validateWorldGenerationOutput(JSON.stringify({ world: current }), [...WORLD_SECTIONS], null).success).toBe(false);
    expect(JSON.stringify(current)).toBe(original);
  });
  it("rejects the real-probe empty faction case and accepts only an explicit local correction", () => {
    const content = seededWorldBlueprint(brief); content.characters[0].profile.faction = "";
    const raw = JSON.stringify(content);
    expect(validateWorldGenerationOutput(raw, [...WORLD_SECTIONS], null)).toMatchObject({ success: false, stage: "schema", issues: expect.arrayContaining([expect.objectContaining({ path: "characters.0.profile.faction" })]) });
    expect(content.characters[0].profile.faction).toBe("");
    content.characters[0].profile.faction = "尚未表明阵营";
    expect(validateWorldGenerationOutput(JSON.stringify(content), [...WORLD_SECTIONS], null)).toMatchObject({ success: true });
  });
  it("merges only selected replacements, with empty items controlled by the host", () => {
    const current = blankWorldBlueprint(brief);
    const opening = { ...current.opening, text: "合成新开场" };
    const result = validateWorldGenerationOutput(JSON.stringify({ opening }), ["opening"], current);
    expect(result).toMatchObject({ success: true, content: { ...current, opening } });
    expect(validateWorldGenerationOutput('{"items":{"definitions":[{}],"placements":[]}}', ["items"], current).success).toBe(false);
  });
  it("reports capacity errors without truncating text into a seemingly valid world", () => {
    expect(validateWorldGenerationOutput("x".repeat(50001), [...WORLD_SECTIONS], null)).toMatchObject({ success: false, stage: "size" });
  });
  it("rejects Chinese slot labels as machine IDs without silently renaming them", () => {
    const current = blankWorldBlueprint(brief); const patch = { itemRules: { slots: ["手持", "随身"], attributes: [] } };
    expect(validateWorldGenerationOutput(JSON.stringify(patch), ["itemRules"], current)).toMatchObject({ success: false, issues: expect.arrayContaining([expect.objectContaining({ path: "itemRules.slots.0" })]) });
    expect(patch.itemRules.slots).toEqual(["手持", "随身"]);
    expect(validateWorldGenerationOutput('{"itemRules":{"slots":["hand","body"],"attributes":[]}}', ["itemRules"], current).success).toBe(true);
  });
});
