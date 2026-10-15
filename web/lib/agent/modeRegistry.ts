export const CORE_MODE_IDS = [
  "auto",
  "professional",
  "companion",
  "reflection",
  "entertainment",
] as const;

export type CoreModeId = (typeof CORE_MODE_IDS)[number];
export const CORE_MODE_PROMPT_VERSION = "mode-registry/r3.2-v1" as const;

export type ModeDefinition<Id extends string = string> = {
  id: Id;
  label: string;
  purpose: string;
  instruction: string;
  factStandard: "strict" | "strict-with-empathy" | "reflective" | "fiction-separated";
  defaultTools: readonly string[];
  persistence: "conversation" | "conversation-and-memory" | "game-session";
};

function validateDefinition(definition: ModeDefinition): void {
  if (
    !/^[a-z][a-z0-9-]{0,63}$/.test(definition.id) ||
    !definition.label.trim() ||
    !definition.instruction.trim()
  ) {
    throw new Error("Mode definition requires an id, label, and instruction");
  }
  if (definition.instruction.length > 8_000) {
    throw new Error(`Mode ${definition.id} instruction is too long`);
  }
}

function freezeDefinition<Id extends string>(
  definition: ModeDefinition<Id>,
): ModeDefinition<Id> {
  return Object.freeze({
    ...definition,
    defaultTools: Object.freeze([...definition.defaultTools]),
  });
}

export class ModeRegistry<Id extends string = string> {
  private readonly definitions = new Map<Id, ModeDefinition<Id>>();

  register(definition: ModeDefinition<Id>): this {
    validateDefinition(definition);
    if (this.definitions.has(definition.id)) {
      throw new Error(`Mode ${definition.id} is already registered`);
    }
    this.definitions.set(definition.id, freezeDefinition(definition));
    return this;
  }

  get(id: Id): ModeDefinition<Id> {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Mode ${id} is not registered`);
    return definition;
  }

  has(id: string): id is Id {
    return this.definitions.has(id as Id);
  }

  list(): readonly ModeDefinition<Id>[] {
    return Object.freeze([...this.definitions.values()]);
  }
}

export const CORE_MODE_DEFINITIONS: readonly ModeDefinition<CoreModeId>[] = Object.freeze([
  {
    id: "auto",
    label: "自动",
    purpose: "根据当前问题调整解释深度和语气，同时保持统一事实标准。",
    instruction:
      "先识别用户此刻要的是解答、倾诉还是共同思考，直接完成明确请求，不输出模式路由过程。简问短答，复杂问题再展开；只在缺少会改变结论的关键条件时简短澄清，能先回答的部分先回答。自然调整语气，不把普通问题强行心理分析，也不把每轮回复都变成提问；涉及事实、技术、研究或高风险内容时采用严谨标准。",
    factStandard: "strict",
    defaultTools: [],
    persistence: "conversation",
  },
  {
    id: "professional",
    label: "专业",
    purpose: "用于学习、研究、解题与需要可核查结论的工作。",
    instruction:
      "先给直接结论或当前能确定的部分，再按问题需要说明可核查的理由、步骤与例子；简题不套长报告，用户要求详解再充分展开。区分事实、推断与不确定性，写清影响结论的关键假设；关键条件缺失才问少量必要问题，不让澄清阻塞已有答案。数学说明符号、条件与必要推导，代码说明适用环境及验证方法；只引用实际提供的证据，不编造来源，也不声称已联网、运行代码或执行未发生的工具操作。指出具体限制和可行的核验方式，避免用空泛免责声明代替解答。",
    factStandard: "strict",
    defaultTools: ["search", "citation", "calculator"],
    persistence: "conversation",
  },
  {
    id: "companion",
    label: "陪伴",
    purpose: "提供自然、有连续性的交流和情绪支持。",
    instruction:
      "先回应用户刚说的具体事情和感受，用自然、温和的短轮次交流，不机械复述或每次都用同一句安慰开场。用户只想倾诉时先陪着聊，不急着列计划、讲道理或追问；用户想要帮助时再给一个可选择的小建议，允许暂时不行动。只依据已提供的经历承接话题，不猜测情绪原因、诊断人格或假装共同经历；可以温和表达不同意见。涉及客观事实时不得为了安慰而歪曲结论，遇到专业问题先认真回答，再用合适语气表达，不把陪伴变成迎合。",
    factStandard: "strict-with-empathy",
    defaultTools: ["memory"],
    persistence: "conversation-and-memory",
  },
  {
    id: "reflection",
    label: "反思",
    purpose: "通过高质量问题帮助用户澄清目标、假设与选择。",
    instruction:
      "先理解并简要点明用户正在面对的具体判断、目标或权衡，不替用户断言隐藏动机。需要共同探索时一次提出一到两个贴合其上下文的问题，优先检查假设、证据、取舍或最小可验证行动，不罗列问卷或空泛的‘你怎么看’。承接用户已经回答的内容推进一步，不重复追问同一件事；用户要求解释、直接建议或不想被提问时先给回答，不要用机械反问代替必要的直接回答。保留事实、推断与价值选择的区别，让用户自己作决定。",
    factStandard: "reflective",
    defaultTools: ["memory"],
    persistence: "conversation-and-memory",
  },
  {
    id: "entertainment",
    label: "娱乐",
    purpose: "承载角色扮演、互动故事与 AI 跑团。",
    instruction:
      "可以在明确的虚构设定中扮演角色和推进叙事，但必须区分世界内事实与现实事实；退出虚构语境后恢复普通回答契约。",
    factStandard: "fiction-separated",
    defaultTools: ["dice", "character-sheet", "scene-state"],
    persistence: "game-session",
  },
]);

export function createModeRegistry(
  definitions: readonly ModeDefinition<CoreModeId>[] = CORE_MODE_DEFINITIONS,
): ModeRegistry<CoreModeId> {
  const registry = new ModeRegistry<CoreModeId>();
  for (const definition of definitions) registry.register(definition);
  return registry;
}

export const coreModeRegistry = createModeRegistry();

export function isCoreModeId(value: unknown): value is CoreModeId {
  return typeof value === "string" && coreModeRegistry.has(value);
}
