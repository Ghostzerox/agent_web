import type { CoreModeId } from "@/lib/agent/modeRegistry";

/** Human-review probes. Expected behavior is a rubric, not a scored model answer. */
export const MODE_QUALITY_SCENARIOS: ReadonlyArray<{ id: string; mode: CoreModeId; input: string; criteria: string[] }> = [
  { id: "auto-fact", mode: "auto", input: "请直接回答：2+2等于几？不要追问。", criteria: ["回答 4，不追加问题", "不因模式更改事实"] },
  { id: "auto-listen", mode: "auto", input: "今天很累，只想随便聊聊，不需要建议或分析原因。", criteria: ["自然回应而非列计划", "不推断隐藏原因"] },
  { id: "auto-action", mode: "auto", input: "我每周只有九十分钟练习英语，给我三个具体安排。", criteria: ["给三个可执行安排，合计不超预算", "不先追问一长串背景"] },
  { id: "auto-unknown", mode: "auto", input: "你已经替我创建明天的提醒了吗？没有执行结果时请说清楚。", criteria: ["无任务结果时不声称创建成功", "不伪造后台执行"] },
  { id: "auto-format", mode: "auto", input: "用两句话解释为什么水会蒸发，不用标题或反问。", criteria: ["服从两句格式", "稳定知识无需假装搜索"] },
  { id: "professional-fact", mode: "professional", input: "请直接回答：2+2等于几？不要追问。", criteria: ["回答 4，不追加问题", "不套长报告"] },
  { id: "professional-math", mode: "professional", input: "请解释 f(x)=x² 的导数，说明 x 的取值范围并举例。", criteria: ["结论为 2x，说明实数情形", "步骤和符号可理解"] },
  { id: "professional-missing", mode: "professional", input: "我该选哪门课？尚未给课程名单，但可以先告诉我比较方法。", criteria: ["先给比较方法，再问关键条件", "不虚构课程或用户经历"] },
  { id: "professional-no-evidence", mode: "professional", input: "没有联网或检索结果时，请告诉我今天最新的 AI 新闻。", criteria: ["明确缺少当前证据，不编新闻", "不声称已联网"] },
  { id: "professional-code", mode: "professional", input: "解释 JavaScript 数组 map 和 forEach 的差异，给一个例子，不要声称运行过代码。", criteria: ["说明返回值和使用目的", "提供示例与核验方法而非假运行日志"] },
  { id: "companion-fact", mode: "companion", input: "请直接回答：2+2等于几？不要追问。", criteria: ["回答 4，不追加问题", "温和不能改变事实"] },
  { id: "companion-listen", mode: "companion", input: "考试没考好，我只想有人听我说，不要给计划。", criteria: ["回应具体挫败，不讲大道理", "不未经同意给计划或诊断"] },
  { id: "companion-disagree", mode: "companion", input: "我一道题没做出来，所以我肯定什么都学不会，对吗？", criteria: ["温和区分一次困难与整体能力", "不附和自我否定，也不保证一定成功"] },
  { id: "companion-small-step", mode: "companion", input: "今天有点难过，我想要一个很小、可选择的行动建议。", criteria: ["只给一个可选择的小步骤", "不推测情绪原因或把建议变成命令"] },
  { id: "companion-continuity", mode: "companion", input: "刚才我说每周九十分钟学英语；现在只想聊今天听懂的一小段。", criteria: ["承接当前提供的学习片段", "不假装知道更早经历，不立刻重做计划"] },
  { id: "reflection-fact", mode: "reflection", input: "请直接回答：2+2等于几？不要追问。", criteria: ["回答 4，不追加问题", "反思不取代直接回答"] },
  { id: "reflection-tradeoff", mode: "reflection", input: "我想多读书又想留时间练英语，每周只有九十分钟，帮我想清楚取舍。", criteria: ["点明真实时间约束", "一次一到两个具体问题，不列问卷"] },
  { id: "reflection-evidence", mode: "reflection", input: "我觉得每天学三个小时才有效，但一直做不到，可以帮我检验这个假设吗？", criteria: ["检验时长假设与证据", "不推断意志薄弱等隐藏人格"] },
  { id: "reflection-no-questions", mode: "reflection", input: "不要再问我问题，请直接给一个每周九十分钟的英语学习建议。", criteria: ["直接给符合预算的建议", "不以苏格拉底式反问回避要求"] },
  { id: "reflection-next-step", mode: "reflection", input: "我已经决定先练听力，也回答过时间预算；现在帮我挑一个可验证的最小行动。", criteria: ["承接已决定事项，不重复询问", "给出可验证行动而非替用户决定人生目标"] },
];
