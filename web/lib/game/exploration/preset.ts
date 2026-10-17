// Client-safe introduction. Never import the hidden server catalog into a client bundle.
export const EXPLORATION_PRESET = {
  templateId: "fog-harbor", templateVersion: "1.0.0", hostContract: "exploration.v1",
  title: "雾港与旧灯岬", kind: "interactive-story" as const,
  world: { name: "潮汐群岛 · 雾港", premise: "你乘渡船抵达雾港，在港口、集市、档案馆与旧灯岬之间自由探索。是否参与旧灯的未来，由你决定。",
    tone: "细腻、有烟火气的奇幻行旅，轻数值而重选择与因果",
    rules: ["exploration.v1 / fog-harbor@1.0.0", "普通移动和交流不强制检定", "装备、交易与事件由宿主动作结算；AI不得代替玩家作出关键选择"],
    boundaries: ["虚构世界不进入现实任务或长期身份记忆", "不出现露骨或血腥细节"] },
  initialCharacter: { name: "行旅者", role: "玩家", controller: "user" as const, description: "刚乘渡船抵达雾港，过往由玩家自己决定。",
    personality: "由玩家决定", goals: ["自由探索"], boundaries: ["不替玩家决定内心与关键选择"], attributes: {}, maxHealth: 1 },
};
