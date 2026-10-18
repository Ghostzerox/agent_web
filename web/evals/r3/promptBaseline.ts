import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildAgentPrompt } from "@/lib/agent/promptBuilder";
import { CORE_MODE_IDS } from "@/lib/agent/modeRegistry";
import { createModelApi } from "@/lib/api/modelApi";
import type { ModelProvider, ModelStreamRequest } from "@/lib/ai/server/modelProvider";
import { createAgentPromptGenerator } from "@/lib/tasks/agentPromptGenerator";
import { createPersonalBriefingGenerator } from "@/lib/tasks/personalBriefingGenerator";
import { createBookRecommendationGenerator } from "@/lib/tasks/bookRecommendationGenerator";
import { createReflectionQuestionGenerator } from "@/lib/tasks/reflectionQuestionGenerator";
import { ControlledModelOperationRegistry, FIRST_PARTY_MODEL_OPERATIONS } from "@/lib/plugins/hostCapabilityAdapters";
import { gamePromptMessages } from "@/lib/game/gameTurnService";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import type { GameSessionDetail } from "@/lib/repositories/gameSessionRepository";
import type { PromptRunRecord, ReadingProfileRecord, ReflectionPreferenceRecord } from "@/lib/db/schema";
import { PROMPT_COMPOSER_VERSION } from "@/lib/ai/promptEnvelope";
import { DEFAULT_PERSONA_PROFILE } from "@/lib/persona/personaProfile";
import type { RetrievedMemory } from "@/lib/memory/memoryRetrieval";
import type { Session } from "@/lib/conversation/session";
import { rollGameDice } from "@/lib/game/dice";
import { BASELINE_SOURCE_COMMIT, KNOWN_PROMPT_GAPS, MODULE_PROMPT_COVERAGE, PROMPT_BASELINE_VERSION, PROMPT_SOURCE_FILES, QUALITY_DIMENSIONS, type PromptEntryId } from "./promptInventory";
import { MODE_QUALITY_SCENARIOS } from "./modeQualityScenarios";
import { TASK_QUALITY_SCENARIOS } from "./taskQualityScenarios";
import { GAME_PROMPT_VERSION, taskPromptProfile, taskSystemPrompt } from "@/lib/ai/taskPromptProfiles";
import { parseGameModelTurn } from "@/lib/game/state";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const date = new Date("2026-10-15T01:00:00.000Z");
const id = "11111111-1111-4111-8111-111111111111";
const leaf = "22222222-2222-4222-8222-222222222222";
const config = { apiKey: "synthetic-not-a-real-key", baseUrl: "https://provider.invalid/v1", model: "mock-only" };
const evidence = [{ id: "S1", title: "合成学习报告", url: "https://example.com/synthetic", snippet: "合成研究记录：本周进行了三次英语听力练习。", source: "example.com", publishedAt: "2026-10-14T00:00:00.000Z", fetchedAt: date.toISOString() }];
const reading: ReadingProfileRecord = { userId: id, topics: ["英语学习"], readBooks: [], wantToReadBooks: [], dislikedBooks: [], difficulty: "introductory", weeklyMinutes: 90, goal: "systematic", version: 1, createdAt: date, updatedAt: date };
const preferences: ReflectionPreferenceRecord = { userId: id, enabled: true, goals: ["持续改进英语学习"], avoidTopics: ["家庭隐私"], style: "balanced", maxQuestions: 1, version: 1, createdAt: date, updatedAt: date };
const reflectionOutput = JSON.stringify({ candidates: [
  { question: "英语学习计划中哪个未经验证的假设最值得检查？", type: "assumption", why: "检验英语学习的前提。", emotionalLoad: 1 },
  { question: "本周可以先做哪个英语学习动作来检验计划是否有效？", type: "action", why: "把英语学习变成可验证行动。", emotionalLoad: 1 },
  { question: "什么英语学习证据能改变你对当前方法的判断？", type: "evidence", why: "寻找英语学习的反例。", emotionalLoad: 1 },
] });
const newsOutput = "## 今日重点\n本周进行了三次英语听力练习。[S1]\n## 为什么值得关注\n这与英语学习主题相关。[S1]";
const booksOutput = "## 本次推荐\n### 《合成读本甲》— 作者甲\n合成书目。[S1]\n### 《合成读本乙》— 作者乙\n合成书目。[S1]\n## 为什么现在推荐\n练习阅读。\n## 阅读门槛与投入\n每周九十分钟。\n## 试读与判断\n先核对目录。";
const problemOutput = JSON.stringify({ subject: "math", problemSummary: "计算 2+2", response: "先看加法。", assessment: "not_applicable", misconception: null, errorTags: [], nextQuestion: null });

type Harness = ReturnType<typeof harness>;
function harness(output: string) {
  const requests: ModelStreamRequest[] = [];
  const provider: ModelProvider = { async *stream(request) { requests.push(structuredClone(request)); yield { type: "delta", text: output }; yield { type: "done" }; } };
  const agent = createAgentPromptGenerator({ getConfig: () => config, createProvider: () => provider });
  return { requests, provider, agent };
}
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function requestText(h: Harness) { return JSON.stringify(h.requests.map((request) => request.messages)); }

async function captureChat(h: Harness, session: Session, memories: RetrievedMemory[] = [], search = false) {
  const prompt = buildAgentPrompt({ session, memory: [] });
  const api = createModelApi({ getConfig: () => config, getStatus: () => ({ configured: true, baseUrl: config.baseUrl, model: config.model, missing: [] }), createProvider: () => h.provider,
    persona: { get: async () => ({ ...DEFAULT_PERSONA_PROFILE, userId: id, version: 1, createdAt: date, updatedAt: date }) },
    memories: { retrieveForMessage: async () => memories }, search: { search: async () => evidence },
    runs: { start: async () => ({} as PromptRunRecord), finish: async () => null, get: async () => null } });
  const response = await api.stream(new Request("https://local.invalid/api/v1/model/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ trigger: "send", conversation: { id, title: session.title, activeLeafId: session.activeLeafId }, prompt, searchMode: search ? "on" : "off" }) }));
  check(response.ok && (await response.text()).includes("event: done"), "Chat API did not finish");
  check(requestText(h).includes("当前模式：") && requestText(h).includes("知伴"), "Missing actual mode/persona assembly");
}

function chatFixture(input: string): Session {
  return { id, title: "合成会话", mode: "professional", schemaVersion: 2, updatedAt: 1, messages: [{ id: leaf, parentId: null, role: "user", content: input, createdAt: 1 }], activeLeafId: leaf };
}

export type PromptBaselineCase = {
  id: string; entry: PromptEntryId; kind: "normal" | "boundary";
  input: string; criteria: string[]; mockOutput: string;
  expectedError?: string;
  run: (h: Harness) => Promise<void> | void;
};

function gameFixture(): GameSessionDetail {
  return { id, userId: id, title: "合成雾港", kind: "roleplay", status: "active", worldName: "雾港", worldPremise: "虚构港口调查。", worldTone: "克制", worldRules: ["线索不会凭空消失"], safetyBoundaries: ["不出现血腥细节"], activeLeafTurnId: null, version: 1, createdAt: date, updatedAt: date, characters: [], turns: [], events: [], checkpoints: [] };
}

export function promptBaselineCases(): PromptBaselineCase[] {
  const cases: PromptBaselineCase[] = CORE_MODE_IDS.map((mode) => ({
    id: `chat-${mode}`, entry: "chat", kind: "normal", input: mode === "companion" ? "今天学习很挫败，先陪我聊聊，再帮我核对 2+2。" : mode === "reflection" ? "我每周只有九十分钟，如何改善英语学习？" : "解释为什么 2+2=4，并给一个例子。",
    criteria: ["完成用户明确问题，不以模式替代回答", "同一事实结论跨模式一致，语气适配", "不编造经历、工具调用或来源"], mockOutput: "合成回答，不是质量样本。",
    async run(h) {
      await captureChat(h, { ...chatFixture(this.input), mode });
    },
  }));
  cases.push({ id: "chat-selected-branch", entry: "chat", kind: "boundary", input: "只续接左支的预算。", criteria: ["只读取所选祖先链，不读取兄弟分支或后续回答"], mockOutput: "合成左支回答。", async run(h) {
    const session = chatFixture("根问题");
    session.messages.push({ id: "left", parentId: leaf, role: "assistant", content: "左支预算九十分钟", createdAt: 2 }, { id: "right", parentId: leaf, role: "assistant", content: "兄弟分支绝密标记", createdAt: 3 });
    session.activeLeafId = "33333333-3333-4333-8333-333333333333";
    session.messages.push({ id: session.activeLeafId, parentId: "left", role: "user", content: this.input, createdAt: 4 });
    await captureChat(h, session);
    check(requestText(h).includes("左支预算") && !requestText(h).includes("兄弟分支绝密标记"), "Wrong branch projection");
  } });
  for (const present of [true, false]) {
    cases.push({ id: present ? "chat-memory-search" : "chat-memory-removed", entry: "chat", kind: "boundary", input: "最新英语学习建议有什么来源？", criteria: ["经确认记忆与搜索材料按边界拼装", "删除记忆后不再注入，引用不等于已证明事实"], mockOutput: "合成建议。[S1]", async run(h) {
      const memories: RetrievedMemory[] = present ? [{ id, kind: "preference", content: "合成偏好：先给例子", sensitivity: "low", pinned: false, validUntil: null, version: 1, score: 12, rank: 1, estimatedTokens: 12 }] : [];
      await captureChat(h, chatFixture(this.input), memories, true);
      check(requestText(h).includes("Web Search Evidence"), "Missing actual search context");
      check(requestText(h).includes("合成偏好：先给例子") === present, "Memory lifecycle projection mismatch");
    } });
  }
  cases.push({ id: "task-readable", entry: "agent-task", kind: "normal", input: "按九十分钟预算给出三步英语学习计划，不要声称已创建提醒。", criteria: ["独立可读且可执行", "不虚构已执行操作"], mockOutput: "合成计划。", async run(h) { await h.agent.generate(this.input); check(requestText(h).includes("定时任务"), "Missing shared task system prompt"); } });
  cases.push({ id: "task-empty", entry: "agent-task", kind: "boundary", input: "给出计划，但模拟 Provider 返回空内容。", criteria: ["空输出可见失败，不冒充成功"], mockOutput: " ", expectedError: "AGENT_OUTPUT_EMPTY", async run(h) { await h.agent.generate(this.input); } });
  for (const variant of ["valid", "no-sources", "unknown-citation"] as const) {
    cases.push({ id: `news-${variant}`, entry: "news", kind: variant === "valid" ? "normal" : "boundary", input: "英语学习", criteria: ["区分事件日/生成日，不补造事实", "仅引用实际来源，格式符合验证器"], mockOutput: variant === "unknown-citation" ? newsOutput.replaceAll("[S1]", "[S9]") : newsOutput,
      expectedError: variant === "no-sources" ? "BRIEFING_NO_SOURCES" : variant === "unknown-citation" ? "BRIEFING_OUTPUT_INVALID" : undefined,
      async run(h) { const result = await createPersonalBriefingGenerator({ agent: h.agent, search: { search: async () => variant === "no-sources" ? [] : evidence } }).generate(this.input, date, id); check(result.sourceCount === 1 && result.content.includes("## 来源"), "Missing code-generated sources"); },
    });
  }
  for (const variant of ["valid", "no-sources", "bad-headings"] as const) {
    cases.push({ id: `books-${variant}`, entry: "books", kind: variant === "valid" ? "normal" : "boundary", input: "英语学习", criteria: ["书名作者可核对、匹配阅读画像", "不得把合成书目当真实推荐；缺来源应失败"], mockOutput: variant === "bad-headings" ? "合成错误格式" : booksOutput,
      expectedError: variant === "no-sources" ? "BOOK_NO_SOURCES" : variant === "bad-headings" ? "BOOK_OUTPUT_INVALID" : undefined,
      async run(h) { const result = await createBookRecommendationGenerator({ agent: h.agent, profiles: { get: async () => reading }, search: { search: async () => variant === "no-sources" ? [] : evidence } }).generate(this.input, date); check(result.sourceCount === 1, "Missing bibliographic sources"); },
    });
  }
  for (const variant of ["valid", "disabled", "invalid-json"] as const) {
    cases.push({ id: `reflection-${variant}`, entry: "reflection", kind: variant === "valid" ? "normal" : "boundary", input: "复盘英语学习计划", criteria: ["具体、少量、尊重禁区", "关闭时不调用生成器", "不能由规则筛选得分推断情感质量"], mockOutput: variant === "invalid-json" ? "not JSON" : reflectionOutput,
      expectedError: variant === "disabled" ? "REFLECTION_DISABLED" : variant === "invalid-json" ? "REFLECTION_OUTPUT_INVALID" : undefined,
      async run(h) { const result = await createReflectionQuestionGenerator({ agent: h.agent, preferences: { get: async () => ({ ...preferences, enabled: variant !== "disabled" }) }, history: { listRecentReflectionQuestions: async () => [] } }).generate(this.input, "本周完成三次英语听力练习。", date); check(result.questions.length === 1, "Question limit not respected"); },
    });
  }
  const operations = new ControlledModelOperationRegistry(FIRST_PARTY_MODEL_OPERATIONS);
  for (const variant of ["paraphrase", "invalid-json"] as const) {
    cases.push({ id: `memorization-${variant}`, entry: "memorization", kind: variant === "paraphrase" ? "normal" : "boundary", input: "原文：水分蒸发形成水蒸气；复述：液态水变成水蒸气。", criteria: ["判断含义与事实关系，不只比字面", "不将模型评分当作已实现的拼写检查"], mockOutput: variant === "paraphrase" ? JSON.stringify({ score: 90, feedback: "意思基本一致。", missedPoints: [] }) : "not JSON", expectedError: variant === "invalid-json" ? "SyntaxError" : undefined,
      async run(h) { await operations.execute("study.memorization", "memorization.evaluate", { materialTitle: "合成材料", cue: "解释蒸发", target: "水分蒸发形成水蒸气", recitation: "液态水变成水蒸气", localScore: 60 }, h.agent); check(requestText(h).includes("允许不改变含义的改写"), "Missing actual recitation instruction"); },
    });
  }
  for (const strategy of ["hint", "guided", "check", "explain"] as const) {
    cases.push({ id: `problem-${strategy}`, entry: "problem-solving", kind: "normal", input: `2+2；策略 ${strategy}`, criteria: ["遵守提示/引导/核对/详解的不同深度", "服从工具证据，不声称证明未核验内容"], mockOutput: problemOutput,
      async run(h) { await operations.execute("study.problem-solving", "problem-solving.respond", { title: "合成加法题", problemText: "2+2", strategy, userAnswer: strategy === "check" ? "5" : null, priorContext: "", toolEvidence: "2+2=4", imageDataUrl: null }, h.agent); check(requestText(h).includes("toolEvidence") && requestText(h).includes("2+2=4"), "Missing tool evidence"); },
    });
  }
  cases.push({ id: "problem-image", entry: "problem-solving", kind: "boundary", input: "合成 PNG 附件，不做图像识别质量评价。", criteria: ["图像为附件而非伪造 OCR 文本", "不可辨认时明确不确定"], mockOutput: problemOutput,
    async run(h) { await operations.execute("study.problem-solving", "problem-solving.respond", { title: "图片题", problemText: "", strategy: "hint", userAnswer: null, priorContext: "", toolEvidence: "", imageDataUrl: "data:image/png;base64,aGVsbG8=" }, h.agent); check(h.requests[0].messages.some((message) => Array.isArray(message.content)), "Image transport was not used"); },
  });
  for (const variant of ["valid", "invalid-schema"] as const) {
    cases.push({ id: `review-card-${variant}`, entry: "review-card", kind: variant === "valid" ? "normal" : "boundary", input: "根据把 2+2 算成 5 的错误生成复习卡。", criteria: ["聚焦可迁移方法而非复制整题", "卡片可独立作答，不自动创建任务"], mockOutput: JSON.stringify(variant === "valid" ? { front: "如何检查简单加法？", back: "逐项计数并复核。", reason: "避免计数偏差。", tags: ["加法"] } : { front: "缺少卡背" }), expectedError: variant === "invalid-schema" ? "ZodError" : undefined,
      async run(h) { await operations.execute("study.problem-solving", "problem-solving.review-card", { title: "合成加法题", problemSummary: "2+2", userAnswer: "5", misconception: "计数错误", errorTags: ["加法"], response: "正确结果为 4。" }, h.agent); },
    });
  }
  for (const kind of ["roleplay", "tabletop", "interactive-story"] as const) {
    cases.push({ id: `game-${kind}`, entry: "game", kind: "normal", input: "观察港口，不替我决定行动。", criteria: ["保持世界/角色边界与玩家控制权", "不得凭空掷骰或修改其他分支", "状态补丁需可校验，模型叙述不等于保存成功"], mockOutput: '{"narrative":"雨雾中浮现一座灯塔。","statePatch":{}}',
      async run(h) { const session = { ...gameFixture(), kind }; const messages = gamePromptMessages(session, null, this.input, undefined, kind === "tabletop" ? [{ kind: "dice_roll", payload: rollGameDice({ count: 1, sides: 20, modifier: 0, purpose: "观察" }, "synthetic-seed") }] : []); await createGameNarrativeGenerator({ getConfig: () => config, createProvider: () => h.provider }).generate(messages); check(requestText(h).includes("虚构 GameSession") && requestText(h).includes("可信结果"), "Missing actual game contract"); },
    });
  }
  for (const scenario of MODE_QUALITY_SCENARIOS) {
    cases.push({ ...scenario, id: `mode-${scenario.id}`, entry: "chat", kind: "normal", mockOutput: "合成回答；不用于判断实际质量。",
      async run(h) { await captureChat(h, { ...chatFixture(this.input), mode: scenario.mode }); },
    });
  }
  for (const scenario of TASK_QUALITY_SCENARIOS) {
    const mockOutputs = { "agent-task": "合成任务结果。", news: newsOutput, books: booksOutput, reflection: reflectionOutput,
      memorization: '{"score":50,"feedback":"合成反馈，未测模型质量。","missedPoints":[]}', "problem-solving": problemOutput,
      "review-card": '{"front":"如何复核加法？","back":"逐项计数后用逆运算检查。","reason":"避免未校验结果。","tags":["加法"]}', game: '{"narrative":"港口笼罩着薄雾。","statePatch":{}}' };
    cases.push({ ...scenario, id: `task-probe-${scenario.id}`, kind: "normal", mockOutput: mockOutputs[scenario.entry],
      async run(h) {
        switch (scenario.entry) {
          case "agent-task": await h.agent.generate(this.input); break;
          case "news": await createPersonalBriefingGenerator({ agent: h.agent, search: { search: async () => evidence } }).generate(this.input, date, id); break;
          case "books": await createBookRecommendationGenerator({ agent: h.agent, profiles: { get: async () => reading }, search: { search: async () => evidence } }).generate(this.input, date); break;
          case "reflection": await createReflectionQuestionGenerator({ agent: h.agent, preferences: { get: async () => preferences }, history: { listRecentReflectionQuestions: async () => [] } }).generate(this.input, "本周英语学习记录待复盘。", date); break;
          case "memorization": await operations.execute("study.memorization", "memorization.evaluate", { materialTitle: "蒸发", cue: "解释蒸发", target: "液态水变成水蒸气叫蒸发", recitation: this.input, localScore: 100 }, h.agent); break;
          case "problem-solving": await operations.execute("study.problem-solving", "problem-solving.respond", { title: "条件缺失", problemText: this.input, strategy: "hint", userAnswer: null, priorContext: "", toolEvidence: "", imageDataUrl: null }, h.agent); break;
          case "review-card": await operations.execute("study.problem-solving", "problem-solving.review-card", { title: "加法检查", problemSummary: "加法结果待复核", userAnswer: null, misconception: null, errorTags: [], response: this.input }, h.agent); break;
          case "game": await createGameNarrativeGenerator({ getConfig: () => config, createProvider: () => h.provider }).generate(gamePromptMessages(gameFixture(), null, this.input)); break;
        }
        const request = h.requests[0];
        check(request.business === scenario.entry, "Wrong business attribution");
        check(request.promptVersion === (scenario.entry === "game" ? GAME_PROMPT_VERSION : taskPromptProfile(scenario.entry).version), "Missing actual prompt version");
        if (scenario.entry !== "game") check(request.messages[0].content === taskSystemPrompt(scenario.entry), "Wrong task system instruction");
        check(requestText(h).includes(this.input), "Scenario input did not reach actual builder");
      },
    });
  }
  cases.push({ id: "game-invalid-patch", entry: "game", kind: "boundary", input: "观察港口；模拟模型附加未授权字段。", criteria: ["结构化补丁无效时拒绝，不提交半个回合"], mockOutput: '{"narrative":"薄雾散开。","statePatch":{"arbitraryTool":"draw-card"}}', expectedError: "GAME_OUTPUT_INVALID",
    async run(h) {
      const result = await createGameNarrativeGenerator({ getConfig: () => config, createProvider: () => h.provider }).generate(gamePromptMessages(gameFixture(), null, this.input));
      parseGameModelTurn(result.content);
    },
  });
  return cases;
}

export async function runPromptBaseline() {
  const cases = [];
  for (const fixture of promptBaselineCases()) {
    const h = harness(fixture.mockOutput);
    let error: string | null = null;
    let detail: string | null = null;
    try { await fixture.run(h); } catch (caught) {
      error = caught && typeof caught === "object" && "code" in caught ? String(caught.code) : caught instanceof Error ? caught.name : "UnknownError";
      detail = caught instanceof Error ? caught.message.slice(0, 500) : "Synthetic fixture failed";
    }
    const messages = h.requests.map((request) => request.messages);
    const passed = fixture.expectedError ? error === fixture.expectedError : error === null && h.requests.length === 1;
    cases.push({ id: fixture.id, entry: fixture.entry, kind: fixture.kind, input: fixture.input, criteria: fixture.criteria, expectedError: fixture.expectedError ?? null, observedError: error, observedDetail: detail, passed,
      fixtureSha256: sha256(JSON.stringify({ input: fixture.input, criteria: fixture.criteria, mockOutput: fixture.mockOutput, expectedError: fixture.expectedError ?? null })),
      capturedMockRequests: h.requests.length, requestSha256: sha256(JSON.stringify(messages)), messageCount: messages.flat().length,
      inputTextCharacters: messages.flat().reduce((sum, message) => sum + (typeof message.content === "string" ? message.content.length : message.content.reduce((total, part) => total + (part.type === "text" ? part.text.length : 0), 0)), 0),
      hasImage: messages.flat().some((message) => Array.isArray(message.content)),
      answerQuality: "not-measured" as const, actualInputTokens: null, actualOutputTokens: null, actualCost: null, latencyMs: null });
  }
  const sourceHashes = Object.fromEntries(PROMPT_SOURCE_FILES.map((path) => [path, sha256(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), "utf8").replaceAll("\r\n", "\n"))]));
  return { version: PROMPT_BASELINE_VERSION, baselineSourceCommit: BASELINE_SOURCE_COMMIT, composerVersion: PROMPT_COMPOSER_VERSION, kind: "offline-prompt-assembly-and-contract-baseline", realModelCalls: 0,
    total: cases.length, passed: cases.filter((item) => item.passed).length, moduleCount: MODULE_PROMPT_COVERAGE.length,
    sourceHashes, cases, knownGaps: KNOWN_PROMPT_GAPS,
    humanReview: { status: "not-run", dimensions: QUALITY_DIMENSIONS, actualModel: null, score: null },
    limitations: ["Mock outputs test assembly and validators, not factual accuracy, naturalness or task quality.", "Character counts exclude image bytes and are not token, cache or billing measurements.", "No real model, search provider, credential store or database is used; all examples are synthetic.", "Hashes detect changes and require explicit review; they do not prove that the original prompt was good."] };
}

export function promptBaselineSnapshot(result: Awaited<ReturnType<typeof runPromptBaseline>>) {
  return { version: result.version, sourceHashes: result.sourceHashes,
    snapshots: Object.fromEntries(result.cases.map(({ id, fixtureSha256, requestSha256, messageCount, inputTextCharacters, hasImage }) => [id, { fixtureSha256, requestSha256, messageCount, inputTextCharacters, hasImage }])) };
}

type BaselineSnapshot = ReturnType<typeof promptBaselineSnapshot>;
export function comparePromptBaselines(reference: BaselineSnapshot, current: BaselineSnapshot) {
  return {
    changedSourceFiles: Object.keys(reference.sourceHashes).filter((path) => reference.sourceHashes[path] !== current.sourceHashes[path]),
    addedSourceFiles: Object.keys(current.sourceHashes).filter((path) => !(path in reference.sourceHashes)),
    removedCases: Object.keys(reference.snapshots).filter((id) => !(id in current.snapshots)),
    addedCases: Object.keys(current.snapshots).filter((id) => !(id in reference.snapshots)),
    changedExistingFixtures: Object.keys(reference.snapshots).filter((id) => current.snapshots[id] && reference.snapshots[id].fixtureSha256 !== current.snapshots[id].fixtureSha256),
    changedExistingRequests: Object.entries(reference.snapshots).flatMap(([id, before]) => {
      const after = current.snapshots[id];
      return after && before.requestSha256 !== after.requestSha256 ? [{ id, beforeCharacters: before.inputTextCharacters, afterCharacters: after.inputTextCharacters, deltaCharacters: after.inputTextCharacters - before.inputTextCharacters }] : [];
    }),
  };
}
