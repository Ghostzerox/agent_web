// Server-side template registry. Do not import this module from client components.
import type { ExplorationState, WorldHistory, WorldCharacter } from "./contracts";

const characterCard = (id: string, name: string, locationId: string, identity: string): WorldCharacter => ({
  id, name, locationId, identity, category: "npc", controller: "ai", faction: "雾港居民",
  personality: "谨慎但愿意交流", speech: "用具体事情说话，不做全知解说", goals: ["维持自己的日常生活"],
  appearance: "穿着适合海港生活的衣物", backstory: "你尚未了解此人的过往。", values: ["信守约定"], boundaries: ["不会无条件满足陌生人的请求"],
  abilities: [], relationship: "neutral", relationshipReason: "初次见面", knownInformation: [], promises: [], memories: [], unresolved: [], arc: "尚未展开", topics: [], interactions: [],
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
  characters: { card: ExplorationState["characters"][string]; revealedCard?: Partial<WorldCharacter>; topics: { id: string; label: string; requires?: WorldCondition; answer: string; effect?: WorldEffect }[];
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
    { card: { ...characterCard("merchant", "阿岚", "market", "旧物商与修补匠"), personality: "务实而有幽默感，重视公平交易", speech: "说话简短，常拿修补比喻关系", goals: ["出售可靠的货物", "让灯塔恢复夜航"] },
      topics: [{ id: "old-light", label: "旧灯为何熄灭", answer: "阿岚说：镜片被风浪卷走了，芦苇滩常能捡到海上漂来的东西。这是他的推测，不是亲眼见证。", effect: { reveal: ["lens-rumor"] } }], knowledge: ["harbor-founded", "lens-rumor"], trader: true },
    { card: { ...characterCard("keeper", "林汐", "tower", "年轻守灯人"), personality: "自尊、耐心，对空泛承诺保持戒心", speech: "先问具体能做什么，再谈感受", goals: ["修好旧灯", "不让航标被私人封锁"], appearance: "袖口有灯油痕迹，随身携带旧铜钥匙", abilities: ["航标维修", "辨认海雾"], unresolved: ["缺失的镜片", "灯塔未来归属"] },
      revealedCard: { backstory: "林汐继承母亲的守灯职责，却不愿照搬所有旧规。她曾在风暴中救过陌生船只。", values: ["航道向所有人开放", "实际行动比誓言可靠"], arc: "从独自守灯到学会让港民共同承担责任", boundaries: ["不以灯塔换取私人控制权", "拒绝替玩家作出选择"] },
      topics: [{ id: "repair", label: "询问维修条件", answer: "林汐指着空灯座：需要找回镜片。即使修好，我也希望先谈清楚由谁维护。", effect: { flags: ["repair-discussed"] } },
        { id: "oath", label: "分享碑文盟约", requires: { learned: "keeper-oath" }, answer: "你向林汐展示碑文记录，她第一次得知完整盟约，愿意支持港民共管。", effect: { flags: ["oath-shared"], character: { id: "keeper", relationship: "friendly", reason: "你分享了可核对的碑文证据" } } }],
      promise: { text: "我答应寻找旧灯镜片；这不是现实提醒。", requires: { flag: "repair-discussed" }, completion: { item: "lens" }, effect: { flags: ["promise-kept"], character: { id: "keeper", relationship: "trusted", reason: "你兑现了找回镜片的承诺", important: true } } },
      help: { requires: { item: "lens" }, effect: { flags: ["repair-ready"], character: { id: "keeper", relationship: "friendly", reason: "你带来镜片并帮忙核对维修方案", important: true } }, result: "你与林汐核对了镜片和灯座。维修已准备就绪，镜片尚未消耗，最终方案由你在事件中决定。" },
      negotiate: { requires: { flag: "oath-shared" }, effect: { flags: ["council-supported"], character: { id: "keeper", relationship: "trusted", reason: "双方依据旧盟约协商公共维护方案" } }, result: "林汐支持召开港民共议，但不会替你选择最终方案。" }, knowledge: ["harbor-founded"], trader: false },
    { card: { ...characterCard("archivist", "闻笙", "archive", "潮历档案员"), goals: ["核对传说与档案", "保护借阅记录"], personality: "认真而好奇，明确区分证据与传闻" },
      topics: [{ id: "map", label: "询问旧海图", answer: "闻笙请你亲自核对桌上的旧海图：传说不能代替史料，地图和碑文可以交叉验证。" }], knowledge: ["light-record", "well-legend"], trader: false },
  ], events: [], epics: [],
  lore: [
    { id: "harbor-founded", kind: "fact", origin: "setting", text: "潮历一百二十年，雾港由渡船工与守灯人共同建立。", locationId: "harbor", actorIds: [], eventId: null, source: "港务告示 / 地方年表" },
    { id: "well-legend", kind: "legend", origin: "setting", text: "据传退潮时旧井会映出通往失落祭坛的路；尚未证实。", locationId: "market", actorIds: [], eventId: null, source: "旧井浮雕旁的传说" },
    { id: "lens-rumor", kind: "rumor", origin: "setting", text: "阿岚推测旧灯镜片可能被冲到芦苇滩，尚未亲眼确认。", locationId: "market", actorIds: ["merchant"], eventId: null, source: "阿岚口述" },
    { id: "light-record", kind: "fact", origin: "setting", text: "档案中的旧海图显示祭坛路径；旧灯最初是向所有船只开放的公共航标。", locationId: "archive", actorIds: [], eventId: null, source: "潮历档案馆旧海图" },
    { id: "keeper-oath", kind: "fact", origin: "setting", text: "守望者盟约：航标不得按船籍收费封锁，由港民共议维护。", locationId: "shrine", actorIds: [], eventId: null, source: "祭坛碑文" },
  ],
};

export function getWorldTemplate(id: string, version = "1.0.0"): WorldTemplate {
  if (id !== fogHarbor.id || version !== fogHarbor.version) throw new Error("世界模板版本不可用；存档已保留，请恢复对应模板版本。");
  return fogHarbor;
}
