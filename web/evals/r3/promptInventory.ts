/** R3.1 audit data only; this is not a runtime registry or new prompt version. */
export const PROMPT_BASELINE_VERSION = "r3.1/inventory-v1";
export const BASELINE_SOURCE_COMMIT = "31a49a296d4b4e73447b63d272be671bf73b8030";

export const PROMPT_ENTRY_POINTS = [
  { id: "chat", source: "lib/api/modelApi.ts", builder: "lib/agent/promptBuilder.ts", versions: ["r1/cache-friendly-v1", "mode-registry/v1", "persona-profile/v1", "memory-context/v2", "web-search-context/v2"], transport: "chat", format: "Markdown + optional citations", context: "server Persona, confirmed relevant memory, selected branch, optional search", fallback: "visible error / cancel, no fabricated complete answer" },
  { id: "agent-task", source: "lib/tasks/agentPromptGenerator.ts", builder: "lib/tasks/agentPromptGenerator.ts", versions: [], transport: "agent", format: "readable text", context: "saved task prompt only; no chat Persona or global memory", fallback: "typed missing-config/empty/oversize/provider error" },
  { id: "news", source: "lib/tasks/personalBriefingGenerator.ts", builder: "lib/tasks/personalBriefingGenerator.ts", versions: [], transport: "agent", format: "two exact Markdown headings + valid [Sn]; sources appended by code", context: "topic, Shanghai date, novel retrieved evidence; optional separate reflection call", fallback: "no sources / no novelty / invalid output errors" },
  { id: "books", source: "lib/tasks/bookRecommendationGenerator.ts", builder: "lib/tasks/bookRecommendationGenerator.ts", versions: [], transport: "agent", format: "four exact headings; 2–3 titled books, evidence per book", context: "explicit reading profile + bibliographic search evidence", fallback: "profile/search/empty/contract errors" },
  { id: "reflection", source: "lib/tasks/reflectionQuestionGenerator.ts", builder: "lib/tasks/reflectionQuestionGenerator.ts", versions: [], transport: "agent", format: "JSON: 3–5 candidates; code filters, scores and renders", context: "goals, avoided topics, style, bounded input; history used by selector", fallback: "disabled / invalid JSON / no quality candidate errors" },
  { id: "memorization", source: "lib/plugins/hostCapabilityAdapters.ts", builder: "lib/plugins/hostCapabilityAdapters.ts", versions: [], transport: "agent", format: "JSON score/feedback/missedPoints", context: "plugin-authorized target, recitation, localScore; no global memory", fallback: "caller retains deterministic scoring if model evaluation unavailable" },
  { id: "problem-solving", source: "lib/plugins/hostCapabilityAdapters.ts", builder: "lib/plugins/hostCapabilityAdapters.ts", versions: [], transport: "agent", format: "validated JSON; hint/guided/check/explain; optional attached image", context: "problem, answer, prior attempt, bounded deterministic tool evidence", fallback: "invalid result or unsupported-image error; service retains existing record" },
  { id: "review-card", source: "lib/plugins/hostCapabilityAdapters.ts", builder: "lib/plugins/hostCapabilityAdapters.ts", versions: [], transport: "agent", format: "JSON front/back/reason/tags", context: "selected problem/attempt only", fallback: "invalid result error, no automatic task creation" },
  { id: "game", source: "lib/game/gameTurnService.ts", builder: "lib/game/gameTurnService.ts", versions: [], transport: "game", format: "JSON narrative/statePatch; code validates and applies patch", context: "world/characters, selected branch, authoritative state/dice/check results", fallback: "invalid/empty/provider error, no partial turn committed" },
] as const;
export type PromptEntryId = typeof PROMPT_ENTRY_POINTS[number]["id"];

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
  { module: "角色扮演/跑团/规则包", generation: "mixed", entries: ["chat", "game"], note: "legacy entertainment chat differs from isolated GameSession; setup/dice/checkpoints do not generate" },
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
] as const;

export const PROMPT_SOURCE_FILES = [...new Set([
  ...MODEL_CALLER_FILES, "lib/ai/server/modelProvider.ts", "lib/ai/promptEnvelope.ts",
  "lib/agent/promptBuilder.ts", "lib/agent/modeRegistry.ts", "lib/agent/policyLayer.ts",
  "lib/persona/personaProfile.ts", "lib/memory/memoryRetrieval.ts", "lib/search/webSearch.ts",
])].sort();

export const QUALITY_DIMENSIONS = ["task-completion", "actionability", "facts-and-citations", "mode-fit", "tool-honesty", "naturalness", "continuity"] as const;
export const KNOWN_PROMPT_GAPS = [
  { id: "G1", target: "R3.3", finding: "All seven agent-backed task/learning families inherit the scheduled-task system instruction, even foreground learning.", status: "source-observation-not-measured-quality-loss" },
  { id: "G2", target: "R3.3", finding: "News/books heading instructions include explanatory parentheses while validators require exact headings; real format failure rate is not measured.", status: "risk-not-a-real-model-failure" },
  { id: "G3", target: "R3.2/R4.5", finding: "Proactive contact currently uses deterministic templates, not a context-aware generation prompt.", status: "current-design-not-a-bug" },
  { id: "G4", target: "R3.2/R3.3", finding: "Only chat has Prompt Envelope layer versions; the other task templates have no explicit template-version field.", status: "source-observation" },
  { id: "G5", target: "R4.3", finding: "Memorization prompt allows meaning-preserving paraphrases; no separate strict verbatim/spelling task exists yet.", status: "missing-planned-capability" },
  { id: "G6", target: "R5.4/R1.3", finding: "No validated branch-aware summary in current chat assembly; old head/tail compressor is not a semantic summary baseline.", status: "pending-existing-plan" },
] as const;
