import type { MemoryCandidateKind } from "@/lib/memory/types";
export const MODULE_MEMORY_VERSION = "module-memory/r5.5-v1";
export const MODULE_MEMORY_PROFILES = {
  professional: { label: "专业", href: "/chat?mode=professional", focus: "证据版本、数字/否定约束、事实与推断分开；资料不足保留未知。", source: "所选资料 / 当前分支 / 相关确认事实" },
  companion: { label: "陪伴", href: "/chat?mode=companion", focus: "经确认事件/偏好与时间线；情绪只是当时表达，不固化诊断，不把AI建议写成用户承诺。", source: "确认偏好 / 事件原话 / 当前分支" },
  reflection: { label: "反思", href: "/reflection", focus: "目标—行动—反馈—待验证假设；建议、决定与已经执行的行动严格分开。", source: "确认目标 / 反思反馈 / 当前分支" },
  news: { label: "新闻", href: "/tasks", focus: "事件日/发布日期、来源更正、已读/重复与兴趣；旧简报不当最新消息。", source: "现有简报来源、时间窗口与去重记录；不读取人格记忆" },
  reading: { label: "阅读", href: "/reading", focus: "书名/版本、已读/想读/不喜欢、章节与笔记来源；书中主张不是用户观点。", source: "现有阅读画像 / 书单反馈 / 阅读资料集合" },
  tasks: { label: "任务", href: "/tasks", focus: "Task/Run/Inbox是执行事实；聊天摘要不能把计划改成已完成或重设调度状态。", source: "现有结构化任务/运行/Inbox，不用摘要覆盖" },
  memorization: { label: "背书", href: "/study/memorization", focus: "原始材料/单元版本、作答/错漏与下次复习；字面差异不代表理解。", source: "授权插件材料与复习记录 / 学习宫殿位置" },
  "problem-solving": { label: "解题", href: "/study/problem-solving", focus: "题目/尝试/误区/复习卡归学习域；工具核验范围与模型推断分开。", source: "现有题库/错因搜索/复习卡；不固化能力诊断" },
  game: { label: "娱乐", href: "/entertainment", focus: "只保留当前可见分支的虚构人物/世界/未决行动；GameSession状态和可信骰子优先，不读取现实人格/记忆。", source: "现有GameSession分支/角色/检查点；不自动读取其他剧情" },
} as const;
export type PalaceModule = keyof typeof MODULE_MEMORY_PROFILES;
export function conversationMemoryProfile(mode: string): PalaceModule | null { return mode === "auto" ? "professional" : mode === "entertainment" ? "game" : ["professional", "companion", "reflection"].includes(mode) ? mode as PalaceModule : null; }
export function summaryModuleInstruction(mode: string): string {
  const profile = conversationMemoryProfile(mode);
  return profile ? `模块记忆策略（${MODULE_MEMORY_VERSION} / ${profile}）：${MODULE_MEMORY_PROFILES[profile].focus}` : "未知模式不扩大记忆范围。";
}
export function personalMemoryBonus(consumer: string, kind: MemoryCandidateKind): number {
  // Prioritizes only already relevant, confirmed memories; never bypasses lexical relevance/TTL.
  if (consumer === "reflection") return kind === "goal" ? 10 : kind === "fact" ? 2 : 0;
  if (consumer === "companion") return kind === "preference" || kind === "profile" ? 8 : kind === "fact" ? 4 : 0;
  return 0;
}
