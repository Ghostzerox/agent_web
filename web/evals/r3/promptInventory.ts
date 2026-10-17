import { GAME_PROMPT_VERSION, TASK_PROMPT_PROFILES } from "@/lib/ai/taskPromptProfiles";
import { EXPLORATION_PROMPT_VERSION } from "@/lib/game/exploration/prompt";

/** Audit data only; runtime generation uses the actual builders below. */
export const PROMPT_BASELINE_VERSION = "r7/exploration-v1";
export const BASELINE_SOURCE_COMMIT = "b2f973e20d1a4fcff77e371d79366f3eac0330ab";

export const PROMPT_ENTRY_POINTS = [
  { id: "chat", source: "lib/api/modelApi.ts", builder: "lib/agent/promptBuilder.ts", versions: ["r3.2/mode-prompts-v1", "mode-registry/r3.2-v1", "persona-profile/r3.2-v1", "memory-context/v2", "web-search-context/v2"], transport: "chat", format: "Markdown + optional citations", context: "server Persona, confirmed relevant memory, selected branch, optional search", fallback: "visible error / cancel, no fabricated complete answer" },
  { id: "agent-task", source: "lib/tasks/agentPromptGenerator.ts", builder: "lib/tasks/agentPromptGenerator.ts", versions: [TASK_PROMPT_PROFILES["agent-task"].version], transport: "agent", format: "readable text", context: "saved task prompt only; no chat Persona or global memory", fallback: "typed missing-config/empty/oversize/provider error" },
  { id: "news", source: "lib/tasks/personalBriefingGenerator.ts", builder: "lib/tasks/personalBriefingGenerator.ts", versions: [TASK_PROMPT_PROFILES["news"].version], transport: "agent", format: "two exact Markdown headings + valid [Sn]; sources appended by code", context: "topic, Shanghai date, novel retrieved evidence; optional separate reflection call", fallback: "no sources / no novelty / invalid output errors" },
  { id: "books", source: "lib/tasks/bookRecommendationGenerator.ts", builder: "lib/tasks/bookRecommendationGenerator.ts", versions: [TASK_PROMPT_PROFILES["books"].version], transport: "agent", format: "four exact headings; 2–3 titled books, evidence per book", context: "explicit reading profile + bibliographic search evidence", fallback: "profile/search/empty/contract errors" },
  { id: "reflection", source: "lib/tasks/reflectionQuestionGenerator.ts", builder: "lib/tasks/reflectionQuestionGenerator.ts", versions: [TASK_PROMPT_PROFILES["reflection"].version], transport: "agent", format: "JSON: 3–5 candidates; code filters, scores and renders", context: "goals, avoided topics, style, bounded input; history used by selector", fallback: "disabled / invalid JSON / no quality candidate errors" },
  { id: "memorization", source: "lib/plugins/hostCapabilityAdapters.ts", builder: "lib/plugins/hostCapabilityAdapters.ts", versions: [TASK_PROMPT_PROFILES["memorization"].version], transport: "agent", format: "JSON score/feedback/missedPoints", context: "plugin-authorized target, recitation, localScore; no global memory", fallback: "caller retains deterministic scoring if model evaluation unavailable" },
  { id: "problem-solving", source: "lib/plugins/hostCapabilityAdapters.ts", builder: "lib/plugins/hostCapabilityAdapters.ts", versions: [TASK_PROMPT_PROFILES["problem-solving"].version], transport: "agent", format: "validated JSON; hint/guided/check/explain; optional attached image", context: "problem, answer, prior attempt, bounded deterministic tool evidence", fallback: "invalid result or unsupported-image error; service retains existing record" },
  { id: "review-card", source: "lib/plugins/hostCapabilityAdapters.ts", builder: "lib/plugins/hostCapabilityAdapters.ts", versions: [TASK_PROMPT_PROFILES["review-card"].version], transport: "agent", format: "JSON front/back/reason/tags", context: "selected problem/attempt only", fallback: "invalid result error, no automatic task creation" },
{ id: "game", source: "lib/game/gameTurnService.ts", builder: "lib/game/gameTurnService.ts", versions: [GAME_PROMPT_VERSION, EXPLORATION_PROMPT_VERSION], transport: "game", format: "JSON narrative/statePatch; code validates and applies patch", context: "legacy world/characters and dice/check; exploration uses bounded public scene or one NPC knowledge scope", fallback: "invalid/empty/provider error, no partial turn committed" },
] as const;
export type PromptEntryId = typeof PROMPT_ENTRY_POINTS[number]["id"];
// Auxiliary paid operation, separately tested with source/branch/approval fixtures; not a new user mode.
export const AUXILIARY_PROMPT_ENTRY_POINTS = [{ id: "context-summary", source: "lib/api/conversationSummaryApi.ts", builder: "lib/conversation/summary.ts", version: "branch-summary/r5.5-v1", fallback: "full raw branch or explicit input-limit error; never automatic regeneration" }] as const;

/** Every module from the R3–R5 planning matrix, including non-generative services. */
export const MODULE_PROMPT_COVERAGE: ReadonlyArray<{ module: string; generation: "yes" | "mixed" | "no"; entries: readonly PromptEntryId[]; note: string }> = [
  { module: "自动/专业问答", generation: "yes", entries: ["chat"], note: "five core modes share the chat transport" },
  { module: "陪伴/人格/主动联系", generation: "mixed", entries: ["chat"], note: "companion chat uses Persona; out-of-chat contact is deterministic policy/template, not a model call" },
  { module: "反思对话/思考问题", generation: "yes", entries: ["chat", "reflection"], note: "conversation reflection and scheduled candidate selection are distinct" },
  { module: "新闻/个人简报", generation: "yes", entries: ["news", "reflection"], note: "briefing may make a second reflection generation" },
  { module: "书籍/阅读画像", generation: "mixed", entries: ["books"], note: "profile CRUD itself does not generate" },
  { module: "任务/定时 AI", generation: "mixed", entries: ["agent-task", "news", "books", "reflection"], note: "ordinary reminders and scheduling do not generate" },
  { module: "Inbox/通知", generation: "no", entries: [], note: "stores/displays generated results; delivery does not generate another answer" },
  { module: "背书/记忆训练", generation: "mixed", entries: ["memorization"], note: "local scoring/storage/review schedule are deterministic" },
  { module: "解题/复习卡", generation: "yes", entries: ["problem-solving", "review-card"], note: "arithmetic verification itself is not generative" },
  { module: "角色扮演/跑团/规则包", generation: "mixed", entries: ["chat", "game"], note: "isolated GameSession; exploration setup/map/items/events/history are deterministic, only explicit NPC/free narration generates" },
  { module: "记忆管理/Persona", generation: "no", entries: [], note: "current candidate extraction/retrieval/configuration use rules, not LLM extraction" },
  { module: "语音", generation: "no", entries: [], note: "device speech synthesis reads text; no new text-generation call" },
  { module: "插件/Activity", generation: "mixed", entries: ["memorization", "problem-solving", "review-card"], note: "only three registered model operations; storage and task drafts do not generate" },
  { module: "API 配置/Prompt 导出", generation: "no", entries: [], note: "credential connectivity uses GET /models, not chat generation; export does not regenerate" },
  { module: "首页/导航/Web/APK", generation: "no", entries: [], note: "shared navigation and hash routing do not generate" },
  { module: "数据与维护", generation: "no", entries: [], note: "backups/import/index maintenance are not LLM calls" },
];

export const MODEL_CALLER_FILES = [
  "lib/api/modelApi.ts", "lib/tasks/agentPromptGenerator.ts", "lib/tasks/reminderWorker.ts",
  "lib/tasks/personalBriefingGenerator.ts", "lib/tasks/bookRecommendationGenerator.ts",
  "lib/tasks/reflectionQuestionGenerator.ts", "lib/plugins/hostCapabilityAdapters.ts",
  "lib/game/gameTurnService.ts", "lib/game/gameNarrativeGenerator.ts",
  "lib/api/conversationSummaryApi.ts",
] as const;

export const PROMPT_SOURCE_FILES = [...new Set([
  ...MODEL_CALLER_FILES, "lib/ai/server/modelProvider.ts", "lib/ai/promptEnvelope.ts", "lib/ai/taskPromptProfiles.ts", "lib/ai/modelUsage.ts",
  "lib/agent/promptBuilder.ts", "lib/agent/modeRegistry.ts", "lib/agent/policyLayer.ts",
  "lib/persona/personaProfile.ts", "lib/memory/memoryRetrieval.ts", "lib/search/webSearch.ts",
  "lib/proactivity/proactivityPolicy.ts", "lib/api/promptExportApi.ts",
  "lib/tools/sourceTools.ts", "lib/game/toolkit.ts", "lib/game/exploration/prompt.ts",
  "lib/memory/domainPolicy.ts", "lib/repositories/memoryRepository.ts", "lib/repositories/promptRunRepository.ts",
  "lib/repositories/conversationRepository.ts",
  "lib/knowledge/retrieval.ts", "lib/knowledge/citations.ts", "lib/repositories/knowledgeRetrievalRepository.ts", "lib/repositories/knowledgeRepository.ts",
  "lib/conversation/summary.ts", "lib/repositories/conversationSummaryRepository.ts",
  "lib/memory/moduleProfiles.ts",
  "lib/memory/controls.ts", "lib/repositories/memoryControlRepository.ts", "lib/knowledge/sourceIndex.ts", "lib/knowledge/audit.ts",
])].sort();

export const QUALITY_DIMENSIONS = ["task-completion", "actionability", "facts-and-citations", "mode-fit", "tool-honesty", "naturalness", "continuity"] as const;
export const KNOWN_PROMPT_GAPS = [
  { id: "G1", target: "R3.3", finding: "Former shared scheduled-task wrapper replaced by seven business-specific prefixes for text and image requests.", status: "implemented-real-quality-not-measured" },
  { id: "G2", target: "R3.3", finding: "News/books instructions now use exact validator headings; explanations are separate from heading lines.", status: "implemented-real-format-success-rate-not-measured" },
  { id: "G3", target: "R3.2/R4.5", finding: "Proactive contact currently uses deterministic templates, not a context-aware generation prompt.", status: "current-design-not-a-bug" },
  { id: "G4", target: "R3.2/R3.3", finding: "Eight task/game template versions now travel with real provider requests and optional usage metadata; old records remain valid.", status: "implemented-no-prompt-body-logged" },
  { id: "G5", target: "R4.3", finding: "Semantic recitation and explicit deterministic spelling mode are separate; spelling supports original-position insert/delete/replace differences.", status: "implemented-offline-regression-tested" },
  { id: "G6", target: "R5.4/R1.3", finding: "Explicitly generated, source-validated and user-reviewed branch summaries now reuse shared ancestors; semantic fidelity and net cost require separate evaluation.", status: "implemented-contracts-not-general-quality-proof" },
] as const;
