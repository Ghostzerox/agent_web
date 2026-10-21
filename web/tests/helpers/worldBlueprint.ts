import { blankWorldBlueprint } from "@/lib/game/worlds/blueprint";
import { blankCharacterProfile } from "@/lib/game/worlds/assetContracts";
import type { WorldBrief, WorldBlueprint } from "@/lib/game/worlds/contracts";

/** Explicit old-style preset fixture, not the product's empty sandbox default. */
export function seededWorldBlueprint(input: WorldBrief): WorldBlueprint & { hook: NonNullable<WorldBlueprint["hook"]> } {
  return { ...blankWorldBlueprint(input), characters: [{ kind: "character" as const, category: "npc" as const, id: "guide", name: "当地向导", identity: "熟悉周边的居民", locationId: "arrival",
    goal: "了解来访者的需要", personality: "谨慎而友善", speech: "先问来意，再介绍自己知道的内容", profile: blankCharacterProfile() }],
    hook: { id: "first-meeting", name: "初次相遇", locationId: "arrival", description: "你有机会了解当地的一个小故事。",
      acceptText: "听一段当地故事", outcome: "你听完故事，决定下一步如何探索。", declineOutcome: "你暂不参与，仍可自由探索。" } };
}
