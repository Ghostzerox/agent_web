import type { WorldBlueprint } from "@/lib/game/worlds/contracts";

// A deletion never silently rewrites cross-domain references. Existing exit edges are
// the only removed links, explicitly belonging to the deleted location.
function referenced(value: unknown, id: string): boolean {
  if (typeof value === "string") return value === id;
  if (Array.isArray(value)) return value.some((part) => referenced(part, id));
  if (value && typeof value === "object") return Object.values(value).some((part) => referenced(part, id));
  return false;
}
export function removeWorldLocation(world: WorldBlueprint, id: string): WorldBlueprint {
  if (world.region.locations.length <= 2) throw new Error("至少保留两个地点。");
  if (world.region.startId === id) throw new Error("请先选择其他起点，再移除此地点。");
  const { region: _region, ...other } = world; void _region;
  if (referenced(other, id)) throw new Error("此地点仍被人物、道具、史料或事件引用，请先调整引用。");
  return { ...world, region: { ...world.region, locations: world.region.locations.filter((place) => place.id !== id).map((place) => ({ ...place, exits: place.exits.filter((exit) => exit !== id) })) } };
}
export function removeWorldCharacter(world: WorldBlueprint, id: string): WorldBlueprint {
  const characters = world.characters.filter((person) => person.id !== id);
  if (referenced({ ...world, characters }, id)) throw new Error("此人物仍被道具归属、知情者或事件引用，请先调整引用。");
  return { ...world, characters };
}
export function removeWorldLore(world: WorldBlueprint, id: string): WorldBlueprint {
  const lore = world.lore.filter((entry) => entry.id !== id);
  if (referenced({ ...world, lore }, id)) throw new Error("此史料仍被事件或规则引用，请先调整引用。");
  return { ...world, lore };
}
