// Server-side template registry. Do not import this module from client components.
import type { ExplorationState, WorldHistory, WorldCharacter } from "./contracts";
import { ExplorationError } from "./contracts";
import { validateWorldTemplate } from "./validateTemplate";

export const characterCard = (id: string, name: string, locationId: string, identity: string): WorldCharacter => ({
  id, name, locationId, identity, category: "npc", controller: "ai", faction: "雾港居民",
  personality: "谨慎但愿意交流", speech: "用具体事情说话，不做全知解说", goals: ["维持自己的日常生活"],
  appearance: "穿着适合海港生活的衣物", backstory: "你尚未了解此人的过往。", values: ["信守约定"], boundaries: ["不会无条件满足陌生人的请求"],
  abilities: [], relationship: "neutral", relationshipReason: "初次见面", knownInformation: [], promises: [], memories: [], unresolved: [], arc: "尚未展开", topics: [], interactions: [],
});

export type WorldCondition = { flag?: string; learned?: string; item?: string; minTick?: number };
export type WorldEffect = {
  flags?: string[]; discover?: string[]; reveal?: string[]; grant?: string[];
  coins?: number; condition?: string; removeCondition?: string;
  character?: { id: string; relationship?: "wary" | "neutral" | "friendly" | "trusted"; reason: string; important?: boolean; locationId?: string };
  progress?: ExplorationState["progress"];
};
export type WorldTemplate = {
  id: string; version: string; hostContract: "exploration.v1"; world: string; region: string; start: string;
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
  id: "fog-harbor", version: "1.0.0", hostContract: "exploration.v1", world: "潮汐群岛", region: "雾港与旧灯岬", start: "harbor",
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
  ], events: [
    { id: "lantern-accord", name: "旧灯的未来", scope: "local", locationId: "tower", actorIds: ["keeper", "merchant"], trigger: { flag: "beacon-seen" }, stages: [
      { id: "waiting", description: "镜片缺失。可以准备维修，也可选择不参与。", terminal: false, choices: [
        { id: "prepare", label: "准备维修", cost: "需要携带旧灯镜片；此步不消耗", requires: { item: "lens" }, next: "decision", effect: { flags: ["repair-ready"] }, result: "镜片与灯座匹配。现在要选择旧灯的维护方式，镜片仍在你手中。" },
        { id: "leave", label: "暂不参与这段故事", cost: "无消耗，本分支保留这个决定", next: "left", effect: { flags: ["ending-left"] }, result: "你选择保留自由行旅，不承担旧灯的未来。世界仍可继续探索。" },
      ] },
      { id: "decision", description: "维修准备就绪，选择将改变灯塔的归属。证据与交涉可开启公共维护方案。", terminal: false, choices: [
        { id: "public", label: "支持港民共同维护", cost: "需分享碑文并完成交涉；消耗镜片与 2 枚钱币，获答谢 4 枚", requires: { flag: "council-supported", item: "lens" }, coinCost: 2, consume: "lens", next: "public", effect: { flags: ["light-restored", "ending-public"], coins: 4, progress: { rating: "notable", tier: "keeper", level: 1 }, character: { id: "keeper", relationship: "trusted", reason: "你支持了经共同协商的公共航标方案", important: true, locationId: "harbor" } }, result: "旧灯重新照亮开放航道。港民共同维护，林汐到码头组织夜航；公共航标的约定写入新的港史。" },
        { id: "guild", label: "接受商会独家维护", cost: "消耗镜片；商会支付 8 枚，部分船只需付通行费", requires: { item: "lens" }, consume: "lens", next: "guild", effect: { flags: ["light-restored", "ending-guild"], coins: 8, progress: { rating: "notable", tier: "mortal", level: 2 }, character: { id: "keeper", relationship: "wary", reason: "你选择独家经营，与林汐的开放航道原则冲突", important: true } }, result: "商会修复旧灯并设立收费航道。你得到报酬，但林汐明确表达异议；这不是与公共维护相同的结局。" },
        { id: "leave", label: "退出这次决定", cost: "保留镜片，不领取报酬", next: "left", effect: { flags: ["ending-left"] }, result: "你不替港民作出决定，保留镜片并继续自己的旅程。" },
      ] },
      { id: "public", description: "公共航标已恢复。", terminal: true, choices: [] },
      { id: "guild", description: "商会经营的收费航标已恢复。", terminal: true, choices: [] },
      { id: "left", description: "你未参与旧灯方案，仍可继续探索。", terminal: true, choices: [] },
    ] },
    { id: "keeper-letter", name: "守灯人的来信", scope: "character", locationId: "tower", actorIds: ["keeper"], trigger: { flag: "promise-kept" }, stages: [
      { id: "offered", description: "兑现承诺后，林汐愿意谈谈家里的旧事。", terminal: false, choices: [
        { id: "listen", label: "听她讲述", cost: "无消耗，不替她决定未来", next: "shared", effect: { reveal: ["keeper-family"] }, result: "林汐分享了母亲留下的信：守望不是一个人承担所有责任。她开始考虑邀请港民参与维护。" },
        { id: "decline", label: "尊重她的私人空间", cost: "无消耗，不会降低关系", next: "declined", effect: {}, result: "你没有追问，林汐感谢你尊重她的私人空间。" },
      ] }, { id: "shared", description: "这次自愿交流成为林汐传记的一部分。", terminal: true, choices: [] },
      { id: "declined", description: "私人往事仍保持私人。", terminal: true, choices: [] },
    ] },
    { id: "turning-tide", name: "暮潮与夜航", scope: "world", locationId: "harbor", actorIds: [], trigger: { minTick: 8 }, stages: [
      { id: "rising", description: "游戏时间来到暮潮，港口准备迎接夜航。无需现实定时器或后台模型模拟。", terminal: false, choices: [
        { id: "observe", label: "记录暮潮见闻", cost: "无消耗", next: "recorded", effect: { flags: ["tide-recorded"], reveal: ["harbor-opinion"] }, result: "你记录了暮潮。有人认为公共维护更公平，也有人担心费用不足；这些是观点，不是已经发生的事实。" },
      ] }, { id: "recorded", description: "本次暮潮已记入区域年表。", terminal: true, choices: [] },
    ] },
  ], epics: [
    { id: "light-and-tide", name: "灯火与潮汐", chapters: ["抵港与失灵航标", "镜片与被遗忘的盟约", "谁来守望开放航道", "你的决定成为港史"], keyActors: ["keeper", "merchant", "archivist"],
      milestones: [{ flag: "beacon-seen", text: "见到失灵的旧灯" }, { flag: "lens-found", text: "找回失落镜片" }, { flag: "oath-known", text: "核对守望者盟约" }, { flag: "council-supported", text: "通过交涉争取公共维护支持" }, { flag: "light-restored", text: "旧灯重新点亮" }],
      endings: [
        { flag: "ending-public", text: "开放的灯火", consequences: ["航标向所有船只开放，港民共管", "林汐到码头组织夜航，关系成为信任", "地区认可使行旅进入守望等阶；远方岛屿后续可依此挂接，不冒充已实现新大陆"] },
        { flag: "ending-guild", text: "有价的航道", consequences: ["商会获得经营权并收取部分通行费", "林汐保留异议，你获得报酬但没有守望等阶认可", "后续区域可读取商会影响标记，首期不模拟无限经济"] },
        { flag: "ending-left", text: "未承担的守望", consequences: ["你保留物品与自由行旅，不领取此事件奖励", "灯塔问题未由你解决，其他探索仍开放"] },
      ] },
  ],
  lore: [
    { id: "harbor-founded", kind: "fact", origin: "setting", text: "潮历一百二十年，雾港由渡船工与守灯人共同建立。", locationId: "harbor", actorIds: [], eventId: null, source: "港务告示 / 地方年表" },
    { id: "well-legend", kind: "legend", origin: "setting", text: "据传退潮时旧井会映出通往失落祭坛的路；尚未证实。", locationId: "market", actorIds: [], eventId: null, source: "旧井浮雕旁的传说" },
    { id: "lens-rumor", kind: "rumor", origin: "setting", text: "阿岚推测旧灯镜片可能被冲到芦苇滩，尚未亲眼确认。", locationId: "market", actorIds: ["merchant"], eventId: null, source: "阿岚口述" },
    { id: "light-record", kind: "fact", origin: "setting", text: "档案中的旧海图显示祭坛路径；旧灯最初是向所有船只开放的公共航标。", locationId: "archive", actorIds: [], eventId: null, source: "潮历档案馆旧海图" },
    { id: "keeper-oath", kind: "fact", origin: "setting", text: "守望者盟约：航标不得按船籍收费封锁，由港民共议维护。", locationId: "shrine", actorIds: [], eventId: null, source: "祭坛碑文" },
    { id: "keeper-family", kind: "fact", origin: "setting", text: "林汐自愿展示母亲留下的信，信中写道：守望不是一个人承担所有责任。", locationId: "tower", actorIds: ["keeper"], eventId: "keeper-letter", source: "林汐出示的家信" },
    { id: "harbor-opinion", kind: "opinion", origin: "setting", text: "夜航准备中，有港民认为共管更公平，也有港民担心维护资金不足；这是不同立场。", locationId: "harbor", actorIds: [], eventId: "turning-tide", source: "暮潮时的港民讨论" },
  ],
};

const WORLD_TEMPLATES: readonly WorldTemplate[] = [fogHarbor];
export function getWorldTemplate(id: string, version = "1.0.0"): WorldTemplate {
  const template = WORLD_TEMPLATES.find((entry) => entry.id === id && entry.version === version);
  if (!template) throw new ExplorationError("世界模板版本不可用；存档已保留，请恢复对应模板版本。");
  validateWorldTemplate(template);
  return template;
}
