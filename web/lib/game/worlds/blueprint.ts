import type { WorldBlueprint, WorldBrief, WorldSection } from "./contracts";

export const WORLD_SECTION_LABELS: Record<WorldSection, string> = {
  overview: "世界概览", ranks: "规则字典", region: "区域与地图", characters: "基础人物",
  lore: "公开史料与秘密", opening: "开场与玩家定位", hook: "初始交互", authorNotes: "主持备注", conflicts: "待解决冲突",
};

/** Explicit manual starting form, not an AI-generated interpretation of the brief. */
export function blankWorldBlueprint(input: WorldBrief): WorldBlueprint {
  const rank = { id: "ordinary", name: "平常", meaning: "本世界的基础档位，不表示成功概率" };
  return {
    overview: { name: "待命名世界", premise: input.brief.slice(0, 600), tone: "探索与交流", era: "待设定",
      technology: "待设定", supernatural: input.magic === "forbidden" ? "不存在超自然能力" : "待设定其规则与代价",
      usesSupernatural: false, cultures: [], factions: [], history: [] },
    ranks: { rating: [rank], quality: [rank], tier: [rank], ...(input.numericPolicy === "light" ? { levelsPerTier: 3 } : {}) },
    region: { name: "起始区域", startId: "arrival", locations: [
      { id: "arrival", name: "抵达处", description: "故事从这里开始。", exits: ["crossroads"], discovery: "你找到了一份当地的公开告示。" },
      { id: "crossroads", name: "交会处", description: "当地人经常在这里交流。", exits: ["arrival"], discovery: "你发现了一条能够核对的旧记录。" },
    ] },
    characters: [{ id: "guide", name: "当地向导", identity: "熟悉周边的居民", locationId: "arrival",
      goal: "了解来访者的需要", personality: "谨慎而友善", speech: "先问来意，再介绍自己知道的内容" }],
    lore: [], opening: { text: "你来到这片区域，可以观察、探索或与当地人交流。", playerRole: "由玩家决定经历与选择的来访者" },
    hook: { id: "first-meeting", name: "初次相遇", locationId: "arrival", description: "你有机会了解当地的一个小故事。",
      acceptText: "听一段当地故事", outcome: "你听完故事，决定下一步如何探索。", declineOutcome: "你暂不参与，仍可自由探索。" },
    authorNotes: [], conflicts: [],
  };
}
