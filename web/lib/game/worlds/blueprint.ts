import type { WorldBlueprint, WorldBrief, WorldSection } from "./contracts";
import { stableJson } from "@/lib/ai/stableJson";

export function changedWorldSections(previous: WorldBlueprint | null, next: WorldBlueprint, sections: readonly WorldSection[]): WorldSection[] {
  return sections.filter((section) => !previous || stableJson(previous[section]) !== stableJson(next[section]));
}

export const WORLD_SECTION_LABELS: Record<WorldSection, string> = {
  overview: "世界概览", ranks: "规则字典", region: "区域与地图", characters: "世界级人物（可为空）",
  lore: "公开史料与秘密", opening: "开场与玩家定位", hook: "初始交互", authorNotes: "主持备注", conflicts: "待解决冲突",
  itemRules: "物品规则与属性", items: "道具定义与初始放置",
};

/** Explicit manual starting form, not an AI-generated interpretation of the brief. */
export function blankWorldBlueprint(input: WorldBrief): WorldBlueprint {
  const rank = { id: "ordinary", name: "平常", meaning: "本世界的基础档位，不表示成功概率" };
  return {
    overview: { name: "待命名世界", premise: input.brief.slice(0, 600), tone: "探索与交流", era: "待设定",
      technology: "待设定", supernatural: input.magic === "forbidden" ? "不存在超自然能力" : "待设定其规则与代价",
      usesSupernatural: false, cultures: [], factions: [], history: [] },
    ranks: { rating: [rank], quality: [rank], tier: [rank], ...(input.numericPolicy === "light" ? { levelsPerTier: 3 } : {}) },
    itemRules: { slots: ["hand"], attributes: input.numericPolicy === "specified" ? [{ id: "durability", name: "耐久", unit: "格", min: 0, max: 5 }] : [] },
    items: { definitions: [], placements: [] },
    region: { name: "起始区域", startId: "arrival", locations: [
      { id: "arrival", name: "抵达处", description: "你从这里开始自由行动。", exits: ["crossroads"], discovery: "你观察了周围的地形与日常环境。" },
      { id: "crossroads", name: "交会处", description: "道路在这里延伸，可以自行选择方向。", exits: ["arrival"], discovery: "你了解了附近道路和环境的情况。" },
    ] },
    characters: [],
    lore: [], opening: { text: "你来到这片区域，可以观察、探索或与当地人交流。", playerRole: "由玩家决定经历与选择的来访者" },
    hook: null,
    authorNotes: [], conflicts: [],
  };
}
