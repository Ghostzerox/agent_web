import { expect, it } from "vitest";
import { blankWorldBlueprint } from "../lib/game/worlds/blueprint";
import { worldBlueprintSchema } from "../lib/game/worlds/contracts";
import { blankAssetDesign } from "../lib/game/worlds/assetBlueprint";
import { removeWorldLocation, removeWorldCharacter, removeWorldLore } from "../components/game/worldEditorActions";
const input = { brief: "普通港城", magic: "forbidden" as const, numericPolicy: "qualitative" as const, constraints: [] };
it("removes local map edges, preserving unrelated data and the original object", () => {
  const world = blankWorldBlueprint(input);
  world.region.locations.push({ id: "extra", name: "新地点", description: "当地", discovery: "环境", exits: ["arrival"] });
  world.region.locations[0].exits.push("extra");
  const next = removeWorldLocation(world, "extra");
  expect(world.region.locations).toHaveLength(3); expect(next.region.locations).toHaveLength(2);
  expect(next.region.locations[0].exits).toEqual(["crossroads"]); expect(worldBlueprintSchema.safeParse(next).success).toBe(true);
});
it("rejects deleting the starting point, last places, and referenced objects", () => {
  const world = blankWorldBlueprint(input); expect(() => removeWorldLocation(world, "crossroads")).toThrow("至少保留");
  world.region.locations.push({ id: "extra", name: "新地点", description: "当地", discovery: "环境", exits: ["arrival"] });
  expect(() => removeWorldLocation(world, "arrival")).toThrow("起点");
  const person = blankAssetDesign("character", "sailor", input, world); if (person.kind !== "character") throw new Error("fixture");
  person.locationId = "extra"; world.characters.push(person);
  expect(() => removeWorldLocation(world, "extra")).toThrow("引用");
  world.lore.push({ id: "history", kind: "fact", visibility: "author", text: "私密资料", locationId: "arrival", knownBy: [person.id] });
  expect(() => removeWorldCharacter(world, person.id)).toThrow("引用");
  const next = removeWorldLore(world, "history"); expect(removeWorldCharacter(next, person.id).characters).toHaveLength(0);
  expect(world.characters).toHaveLength(1); expect(world.lore).toHaveLength(1);
});
