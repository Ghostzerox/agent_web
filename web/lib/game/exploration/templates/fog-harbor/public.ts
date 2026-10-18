// Public, spoiler-free metadata. Never import world.ts here.
import type { ExplorationTemplatePresentation } from "../../templatePresentation";
export const FOG_HARBOR_PRESET = {
  templateId: "fog-harbor", templateVersion: "1.0.0", hostContract: "exploration.v1",
  title: "雾港与旧灯岬", kind: "interactive-story" as const,
  introduction: {
    summary: "一座失去夜航灯火的海港，一位初来乍到的行旅者。沿着潮声探访街巷，在结识居民的过程中决定是否介入旧灯的未来。",
    setting: "潮汐群岛的雾港与旧灯岬；海港日常与温和奇幻交织，故事从渡船靠岸开始。",
    playerRole: "自由行旅者。人物过往和关键决定由你自己设定，不强制承担救世任务。",
    playStyle: "轻数值、重探索与人物关系；普通行动无需掷骰，故事事件允许不同选择，也允许不参与。",
    scope: "首期完整区域：6 个地点、3 位可结识人物、4 种道具、3 类事件与多结局故事弧。",
    features: ["地图与线索发现", "装备、消耗与交易", "关系、承诺与交涉", "事件、历史与分支回看"],
  },
  world: { name: "潮汐群岛 · 雾港", premise: "你乘渡船抵达雾港，在港口、集市、档案馆与旧灯岬之间自由探索。是否参与旧灯的未来，由你决定。",
    tone: "细腻、有烟火气的奇幻行旅，轻数值而重选择与因果",
    rules: ["exploration.v1 / fog-harbor@1.0.0", "普通移动和交流不强制检定", "装备、交易与事件由宿主动作结算；AI不得代替玩家作出关键选择"],
    boundaries: ["虚构世界不进入现实任务或长期身份记忆", "不出现露骨或血腥细节"] },
  initialCharacter: { name: "行旅者", role: "玩家", controller: "user" as const, description: "刚乘渡船抵达雾港，过往由玩家自己决定。",
    personality: "由玩家决定", goals: ["自由探索"], boundaries: ["不替玩家决定内心与关键选择"], attributes: {}, maxHealth: 1 },
} satisfies ExplorationTemplatePresentation;
