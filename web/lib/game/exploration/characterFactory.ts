import type { WorldCharacter } from "./contracts";

/** Neutral defaults; setting, clothing and factions belong to individual templates. */
export function createWorldCharacter(id: string, name: string, locationId: string, identity: string): WorldCharacter {
  return { id, name, locationId, identity, category: "npc", controller: "ai", faction: "尚未表明阵营",
    personality: "谨慎但愿意交流", speech: "用具体事情说话，不做全知解说", goals: ["维持自己的日常生活"],
    appearance: "尚未描述外貌", backstory: "你尚未了解此人的过往。", values: ["信守约定"], boundaries: ["不会无条件满足陌生人的请求"],
    abilities: [], relationship: "neutral", relationshipReason: "初次见面", knownInformation: [], promises: [], memories: [], unresolved: [], arc: "尚未展开", topics: [], interactions: [],
  };
}
