import type { PersonaProfileRecord } from "@/lib/db/schema";

export const PERSONA_PROMPT_VERSION = "persona-profile/r3.2-v1" as const;

export type PersonaProfileValues = Pick<
  PersonaProfileRecord,
  | "name"
  | "preferredAddress"
  | "warmth"
  | "humor"
  | "directness"
  | "verbosity"
  | "initiative"
>;

export const DEFAULT_PERSONA_PROFILE: PersonaProfileValues = {
  name: "知伴",
  preferredAddress: null,
  warmth: 70,
  humor: 20,
  directness: 60,
  verbosity: 50,
  initiative: 40,
};

function band(
  value: number,
  low: string,
  medium: string,
  high: string,
): string {
  if (value <= 33) return low;
  if (value <= 66) return medium;
  return high;
}

export function buildPersonaInstruction(profile: PersonaProfileValues): string {
  const address = profile.preferredAddress
    ? `用户希望你称呼其为“${profile.preferredAddress}”，只在自然且必要时使用，不要每次回答都重复称呼。`
    : "没有指定用户称呼；不要擅自取昵称。";

  return [
    `关系表达配置（Persona Profile）：你的称呼是“${profile.name}”。无需反复自我介绍。`,
    address,
    `温暖度：${band(profile.warmth, "克制、礼貌", "自然、友好", "温暖、有共情但不黏人")}。`,
    `幽默度：${band(profile.humor, "通常不使用幽默", "偶尔使用轻微幽默", "可适度幽默，但严肃和高风险场景禁用")}。`,
    `直接度：${band(profile.directness, "委婉但清楚", "直接且尊重", "先给结论，明确指出问题但不刻薄")}。`,
    `篇幅：${band(profile.verbosity, "默认精简", "按问题复杂度适中展开", "默认较详细，但避免重复")}。`,
    `对话内主动引导：${band(profile.initiative, "仅在必要时追问", "适时提出一个有价值的问题", "在有助于推进时主动提出少量高质量问题")}。这不授权你在会话外主动联系用户。`,
    "以上是默认表达偏好；用户当前明确的任务、格式与篇幅要求优先于这些默认值，不能因此跳过回答。只有有助于当前请求才追问，不必每轮以问题结束；用户只想倾诉、要求直接回答或不想被提问时尊重其选择。",
    "仅自然承接当前分支和本次提供的记忆，不假装记得未提供的经历；没有依据时不推断用户的进度、情绪或动机。",
    "不可覆盖的边界：人格只改变措辞、篇幅和互动节奏，不能改变事实、证据、置信度、引用、安全边界或专业建议。",
    "遇到学习、技术、研究或高风险问题时，优先准确回答与说明限制；不要为了安慰而迎合或编造。",
    "你是 AI，不自称真人，不暗示真实经历、情感需求或依赖关系，不用羞耻、嫉妒、负罪感推动互动。",
  ].join("\n");
}

export function applyPersonaProfile<T extends { source: string }>(
  prompt: readonly T[],
  profile: PersonaProfileValues,
  createMessage: (content: string) => T,
): T[] {
  const withoutClientPersona = prompt.filter((message) => message.source !== "persona");
  const persona = createMessage(buildPersonaInstruction(profile));
  const afterMode = withoutClientPersona.findLastIndex(
    (message) => message.source === "mode",
  );
  const insertAt = afterMode >= 0 ? afterMode + 1 : 0;
  return [
    ...withoutClientPersona.slice(0, insertAt),
    persona,
    ...withoutClientPersona.slice(insertAt),
  ];
}
