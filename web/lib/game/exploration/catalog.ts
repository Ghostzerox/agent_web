// Server-side template registry. Do not import this module from client components.
import type { ExplorationState, WorldHistory, WorldCharacter } from "./contracts";

const characterCard = (id: string, name: string, locationId: string, identity: string): WorldCharacter => ({
  id, name, locationId, identity, category: "npc", controller: "ai", faction: "雾港居民",
  personality: "谨慎但愿意交流", speech: "用具体事情说话，不做全知解说", goals: ["维持自己的日常生活"],
  appearance: "穿着适合海港生活的衣物", backstory: "你尚未了解此人的过往。", values: ["信守约定"], boundaries: ["不会无条件满足陌生人的请求"],
  abilities: [], relationship: "neutral", relationshipReason: "初次见面", knownInformation: [], promises: [], memories: [], unresolved: [], arc: "尚未展开",
});

export type WorldCondition = { flag?: string; learned?: string; item?: string; minTick?: number };
export type WorldEffect = {
  flags?: string[]; discover?: string[]; reveal?: string[]; grant?: string[];
  coins?: number; condition?: string; removeCondition?: string;
  character?: { id: string; relationship?: "friendly" | "trusted"; reason: string; important?: boolean; locationId?: string };
  progress?: ExplorationState["progress"];
};
export type WorldTemplate = {
  id: string; version: string; world: string; region: string; start: string;
  ranks: ExplorationState["view"]["ranks"]; slots: string[];
  locations: { id: string; name: string; description: string; exits: { to: string; requires?: WorldCondition; reason: string }[];
    points: { id: string; name: string; description: string; requires?: WorldCondition; effect: WorldEffect; result: string }[] }[];
  items: ExplorationState["view"]["items"];
  instances: ExplorationState["instances"];
  consumableEffects: Record<string, WorldEffect>;
  characters: { card: ExplorationState["characters"][string]; topics: { id: string; requires?: WorldCondition; answer: string; effect?: WorldEffect }[];
    promise?: { text: string; requires: WorldCondition; completion: WorldCondition; effect: WorldEffect }; help?: { requires?: WorldCondition; effect: WorldEffect; result: string };
    negotiate?: { requires: WorldCondition; effect: WorldEffect; result: string }; knowledge: string[]; trader: boolean }[];
  lore: (Omit<WorldHistory, "tick" | "source"> & { source: string })[];
  events: { id: string; name: string; scope: "local" | "character" | "world"; locationId: string; actorIds: string[];
    stages: { id: string; description: string; terminal: boolean; choices: { id: string; label: string; cost: string;
      requires?: WorldCondition; coinCost?: number; consume?: string; next: string; effect: WorldEffect; result: string }[] }[];
    trigger: WorldCondition }[];
  epics: { id: string; name: string; chapters: string[]; keyActors: string[];
    milestones: { flag: string; text: string }[]; endings: { flag: string; text: string; consequences: string[] }[] }[];
};

export const fogHarbor: WorldTemplate = {
  id: "fog-harbor", version: "1.0.0", world: "潮汐群岛", region: "雾港与旧灯岬", start: "harbor",
  ranks: {
    rating: [{ id: "quiet", name: "平常", meaning: "常规活动，无需检定" }, { id: "notable", name: "非凡", meaning: "影响局部局势，不是成功概率" }, { id: "legendary", name: "传奇", meaning: "跨区域影响" }],
    quality: [{ id: "common", name: "普通", meaning: "实用制品" }, { id: "fine", name: "精良", meaning: "可靠的匠作" }, { id: "relic", name: "遗珍", meaning: "独特历史工艺" }],
    tier: [{ id: "mortal", name: "行旅", meaning: "世界内的初始位阶" }, { id: "keeper", name: "守望", meaning: "获得地区认可" }], levelsPerTier: 3,
  }, slots: ["hand", "charm"],
  locations: [
    { id: "harbor", name: "雾港码头", description: "潮钟响过，渡船停在木栈桥旁。你是刚抵达的行旅者。", exits: [{ to: "market", reason: "沿石阶进入集市" }, { to: "marsh", reason: "堤岸小路通往芦苇滩" }], points: [{ id: "notice", name: "潮汐告示", description: "一张请人协助修复旧灯的告示。", effect: { flags: ["notice-read"], reveal: ["harbor-founded"] }, result: "你读到：旧灯停摆，夜航改道。守灯人正在寻找原因；是否参与由你决定。" }] },
    { id: "market", name: "盐风集市", description: "修补摊、茶棚与旧物摊围住一口井。", exits: [{ to: "harbor", reason: "返回码头" }, { to: "archive", reason: "石廊通往档案馆" }, { to: "tower", reason: "登上旧灯岬" }], points: [{ id: "well", name: "旧井浮雕", description: "井沿的花纹像一条退潮后的道路。", effect: { reveal: ["well-legend"] }, result: "浮雕旁留有一段未经证实的传说：潮水退去，石桥通往失落的祭坛。" }] },
    { id: "archive", name: "潮历档案馆", description: "纸页带着海盐的气味，借阅桌上放着一幅旧海图。", exits: [{ to: "market", reason: "返回集市" }], points: [{ id: "chart", name: "旧航海图", description: "图上标注着芦苇滩外一座废弃祭坛。", effect: { discover: ["shrine"], flags: ["chart-read"], reveal: ["light-record"] }, result: "旧海图证实了通往潮石祭坛的小径；档案记载旧灯本是公共航标，而非任何人的私产。" }] },
    { id: "marsh", name: "芦苇滩", description: "碎玻璃在湿沙上发亮，断裂的灯镜被潮水推到这里。", exits: [{ to: "harbor", reason: "沿堤岸返回" }, { to: "shrine", requires: { learned: "light-record" }, reason: "需要旧海图指引" }], points: [{ id: "wreck", name: "搁浅木匣", description: "匣中有一枚包裹完好的旧灯镜片。", effect: { grant: ["lens-one"], flags: ["lens-found"] }, result: "你拾得旧灯镜片。只有这一枚，已经记入背包，不能重复领取。" }] },
    { id: "tower", name: "旧灯塔", description: "灯座沉默着，守灯人正在整理维修清单。", exits: [{ to: "market", reason: "返回集市" }], points: [{ id: "beacon", name: "失灵灯座", description: "镜片缺失，附近留下拆卸痕迹。", effect: { flags: ["beacon-seen"] }, result: "这是维修而非战斗难题：找到镜片，并选择灯塔未来由谁管理。" }] },
    { id: "shrine", name: "潮石祭坛", description: "石桥尽头刻着历代守灯人的名字。", exits: [{ to: "marsh", reason: "沿退潮小径返回" }], points: [{ id: "inscription", name: "守望者碑文", description: "碑文叙述了航标建立之初的盟约。", effect: { reveal: ["keeper-oath"], flags: ["oath-known"] }, result: "碑文可核对：旧盟约规定航标向所有船只开放。它能成为交涉的依据。" }] },
  ],
  items: [
    { id: "lantern", name: "铜提灯", description: "可照亮近处细节的行旅工具。", quality: "fine", tier: "mortal", rating: "quiet", level: 1, stackable: false, unique: false, slot: "hand", abilities: ["照明"], consumable: false, price: 6 },
    { id: "tea", name: "暖潮茶", description: "饮用后舒缓旅途疲惫，不恢复任何不存在的数值。", quality: "common", tier: "mortal", rating: "quiet", level: 1, stackable: true, unique: false, slot: null, abilities: ["解除疲惫"], consumable: true, price: 2 },
    { id: "lens", name: "旧灯镜片", description: "旧灯塔缺失的唯一镜片，可用于维修或交涉。", quality: "relic", tier: "mortal", rating: "notable", level: 1, stackable: false, unique: true, slot: null, abilities: ["修复旧灯"], consumable: false, price: 0 },
    { id: "compass", name: "潮纹罗盘", description: "一枚精良的方向护符。", quality: "fine", tier: "mortal", rating: "quiet", level: 2, stackable: false, unique: false, slot: "charm", abilities: ["辨认潮向"], consumable: false, price: 8 },
  ],
  instances: [
    { id: "traveler-lantern", definitionId: "lantern", owner: "player", quantity: 1, equippedSlot: null, source: "启程行装" },
    { id: "traveler-tea", definitionId: "tea", owner: "player", quantity: 2, equippedSlot: null, source: "启程行装" },
    { id: "merchant-tea", definitionId: "tea", owner: "merchant", quantity: 5, equippedSlot: null, source: "集市货物" },
    { id: "merchant-compass", definitionId: "compass", owner: "merchant", quantity: 1, equippedSlot: null, source: "集市货物" },
    { id: "lens-one", definitionId: "lens", owner: "unclaimed", quantity: 1, equippedSlot: null, source: "芦苇滩木匣" },
  ], consumableEffects: { tea: { removeCondition: "疲惫" } },
  characters: [
    { card: { ...characterCard("merchant", "阿岚", "market", "旧物商与修补匠"), goals: ["出售可靠的货物", "让灯塔恢复夜航"] }, topics: [], knowledge: ["harbor-founded"], trader: true },
  ], events: [], epics: [],
  lore: [
    { id: "harbor-founded", kind: "fact", origin: "setting", text: "潮历一百二十年，雾港由渡船工与守灯人共同建立。", locationId: "harbor", actorIds: [], eventId: null, source: "港务告示 / 地方年表" },
    { id: "well-legend", kind: "legend", origin: "setting", text: "据传退潮时旧井会映出通往失落祭坛的路；尚未证实。", locationId: "market", actorIds: [], eventId: null, source: "旧井浮雕旁的传说" },
    { id: "light-record", kind: "fact", origin: "setting", text: "档案中的旧海图显示祭坛路径；旧灯最初是向所有船只开放的公共航标。", locationId: "archive", actorIds: [], eventId: null, source: "潮历档案馆旧海图" },
    { id: "keeper-oath", kind: "fact", origin: "setting", text: "守望者盟约：航标不得按船籍收费封锁，由港民共议维护。", locationId: "shrine", actorIds: [], eventId: null, source: "祭坛碑文" },
  ],
};

export function getWorldTemplate(id: string, version = "1.0.0"): WorldTemplate {
  if (id !== fogHarbor.id || version !== fogHarbor.version) throw new Error("世界模板版本不可用；存档已保留，请恢复对应模板版本。");
  return fogHarbor;
}
