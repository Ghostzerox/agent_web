import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { comparePromptBaselines, promptBaselineCases, promptBaselineSnapshot, runPromptBaseline } from "@/evals/r3/promptBaseline";
import { MODEL_CALLER_FILES, MODULE_PROMPT_COVERAGE, PROMPT_ENTRY_POINTS, AUXILIARY_PROMPT_ENTRY_POINTS, PROMPT_SOURCE_FILES } from "@/evals/r3/promptInventory";
import baseline from "@/evals/r3/baseline-r6.json";
import palace from "@/evals/r3/baseline-r5.5.json";
import summaries from "@/evals/r3/baseline-r5.4.json";
import retrieval from "@/evals/r3/baseline-r5.3.json";
import library from "@/evals/r3/baseline-r5.2.json";
import memoryPolicy from "@/evals/r3/baseline-r5.1.json";
import tools from "@/evals/r3/baseline-r4.json";
import tasks from "@/evals/r3/baseline-r3.3.json";
import previous from "@/evals/r3/baseline-r3.2.json";
import original from "@/evals/r3/baseline.json";

vi.mock("@/lib/db/client", () => ({ getDatabase: () => { throw new Error("Database access is forbidden in prompt baseline tests"); } }));
const controlSources = ["lib/memory/controls.ts", "lib/repositories/memoryControlRepository.ts", "lib/knowledge/sourceIndex.ts", "lib/knowledge/audit.ts"];
const summarySources = ["lib/api/conversationSummaryApi.ts", "lib/conversation/summary.ts", "lib/repositories/conversationSummaryRepository.ts", "lib/memory/moduleProfiles.ts", ...controlSources];
const knowledgeSources = ["lib/knowledge/retrieval.ts", "lib/knowledge/citations.ts", "lib/repositories/knowledgeRetrievalRepository.ts", "lib/repositories/knowledgeRepository.ts", ...summarySources];
let result: Awaited<ReturnType<typeof runPromptBaseline>>;
const fetch = vi.fn(() => { throw new Error("Network access is forbidden"); });
beforeAll(async () => { vi.stubGlobal("fetch", fetch); result = await runPromptBaseline(); });
afterAll(() => vi.unstubAllGlobals());

describe("R3 offline prompt baselines", () => {
  it("preserves R5.5 requests while tracking controls and bounded source fallback", () => {
    const comparison = comparePromptBaselines(palace, promptBaselineSnapshot(result));
    expect(comparison).toMatchObject({ addedCases: [], removedCases: [], changedExistingRequests: [], changedExistingFixtures: [] });
    expect(comparison.addedSourceFiles.sort()).toEqual([...controlSources].sort());
  });
  it("preserves R5.4 legacy fixtures/requests and records the module-specialization implementation", () => {
    const comparison = comparePromptBaselines(summaries, promptBaselineSnapshot(result));
    expect(comparison).toMatchObject({ addedCases: [], removedCases: [], changedExistingRequests: [], changedExistingFixtures: [] });
    expect(comparison.addedSourceFiles.sort()).toEqual(["lib/memory/moduleProfiles.ts", ...controlSources].sort());
    expect(comparison.changedSourceFiles).toContain("lib/memory/domainPolicy.ts");
  });
  it("covers nine generation families and all sixteen modules, including deterministic services", () => {
    expect(PROMPT_ENTRY_POINTS).toHaveLength(9);
    expect(AUXILIARY_PROMPT_ENTRY_POINTS).toHaveLength(1);
    expect(MODULE_PROMPT_COVERAGE).toHaveLength(16);
    expect(new Set(result.cases.map((item) => item.entry))).toEqual(new Set(PROMPT_ENTRY_POINTS.map((item) => item.id)));
    for (const coverage of MODULE_PROMPT_COVERAGE) {
      expect(coverage.note.length).toBeGreaterThan(10);
      if (coverage.generation === "no") expect(coverage.entries).toEqual([]);
      else expect(coverage.entries.length).toBeGreaterThan(0);
    }
    expect(MODULE_PROMPT_COVERAGE.find((item) => item.module === "语音")?.generation).toBe("no");
    expect(MODULE_PROMPT_COVERAGE.find((item) => item.module === "陪伴/人格/主动联系")?.generation).toBe("mixed");
  });

  it("passes real assembly/validator fixtures without a Provider, search network or database", () => {
    expect(result.total).toBe(80);
    expect(result.cases.filter((item) => !item.passed)).toEqual([]);
    expect(result.passed).toBe(result.total);
    expect(result.cases.filter((item) => item.kind === "normal")).toHaveLength(66);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.realModelCalls).toBe(0);
  });

  it("freezes request/fixture hashes and normalized source hashes, and is repeatable", async () => {
    expect(promptBaselineSnapshot(result)).toEqual(baseline);
    expect(promptBaselineSnapshot(await runPromptBaseline())).toEqual(baseline);
    expect(Object.keys(result.sourceHashes).sort()).toEqual(PROMPT_SOURCE_FILES);
    expect(new Set(promptBaselineCases().map((item) => item.id)).size).toBe(result.total);
  });

  it("captures foreground images and actual hint/guided/check/explain variants separately", () => {
    expect(result.cases.find((item) => item.id === "problem-image")?.hasImage).toBe(true);
    const hashes = ["hint", "guided", "check", "explain"].map((strategy) => result.cases.find((item) => item.id === `problem-${strategy}`)?.requestSha256);
    expect(new Set(hashes).size).toBe(4);
    expect(result.cases.filter((item) => item.id.startsWith("game-") && item.kind === "normal")).toHaveLength(3);
  });

  it("never claims manual quality, costs, tokens or latency from synthetic responses", () => {
    expect(result.humanReview).toMatchObject({ status: "not-run", score: null, actualModel: null });
    expect(result.cases.every((item) => item.answerQuality === "not-measured" && item.actualInputTokens === null && item.actualOutputTokens === null && item.actualCost === null && item.latencyMs === null)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("synthetic-not-a-real-key");
    expect(result.knownGaps).toHaveLength(6);
    expect(PROMPT_ENTRY_POINTS.every((item) => item.versions.length > 0)).toBe(true);
  });

  it("records no generation on disabled/no-evidence paths and rejects invalid outputs", () => {
    for (const id of ["news-no-sources", "books-no-sources", "reflection-disabled"]) {
      expect(result.cases.find((item) => item.id === id)).toMatchObject({ capturedMockRequests: 0, passed: true });
    }
    for (const item of result.cases.filter((item) => item.expectedError)) expect(item.observedError).toBe(item.expectedError);
    expect(result.cases.find((item) => item.id === "chat-memory-search")?.requestSha256).not.toBe(result.cases.find((item) => item.id === "chat-memory-removed")?.requestSha256);
  });

  it("detects new stream/generate call-site files so the inventory cannot silently omit them", () => {
    const calls = readdirSync(resolve("lib"), { recursive: true }).map(String).filter((path) => path.endsWith(".ts"))
      .filter((path) => /\.(?:stream|generate|generateWithImage)(?:\?\.)?\s*\(/u.test(readFileSync(resolve("lib", path), "utf8")))
      .map((path) => `lib/${path.replaceAll("\\", "/")}`).sort();
    expect(calls).toEqual([...MODEL_CALLER_FILES].sort());
  });

  it("preserves R3.1 and R3.2 references; R3.3 changes task/game requests without changing chat", () => {
    const comparison = comparePromptBaselines(original, promptBaselineSnapshot(result));
    expect(original.version).toBe("r3.1/inventory-v1");
    expect(comparison.removedCases).toEqual([]);
    expect(comparison.changedExistingFixtures).toEqual([]);
    expect(comparison.addedCases).toHaveLength(49);
    const taskComparison = comparePromptBaselines(previous, promptBaselineSnapshot(result));
    expect(previous.version).toBe("r3.2/modes-v1");
    expect(taskComparison.removedCases).toEqual([]);
    expect(taskComparison.changedExistingFixtures).toEqual([]);
    expect(taskComparison.addedCases).toHaveLength(29);
    expect(taskComparison.changedExistingRequests).toHaveLength(20);
    expect(taskComparison.changedExistingRequests.every((item) => !item.id.startsWith("chat-") && !item.id.startsWith("mode-"))).toBe(true);
    expect(taskComparison.addedSourceFiles.sort()).toEqual(["lib/ai/taskPromptProfiles.ts", "lib/ai/modelUsage.ts", "lib/tools/sourceTools.ts", "lib/game/toolkit.ts", "lib/memory/domainPolicy.ts", "lib/repositories/memoryRepository.ts", "lib/repositories/promptRunRepository.ts", "lib/repositories/conversationRepository.ts", ...knowledgeSources].sort());
  });

  it("has at least five normal and one boundary case per family without changing runtime templates", () => {
    for (const { id } of PROMPT_ENTRY_POINTS) {
      expect(result.cases.filter((item) => item.entry === id && item.kind === "normal").length, id).toBeGreaterThanOrEqual(5);
      expect(result.cases.some((item) => item.entry === id && item.kind === "boundary"), id).toBe(true);
    }
    const comparison = comparePromptBaselines(tasks, promptBaselineSnapshot(result));
    expect(comparison).toMatchObject({ removedCases: [], changedExistingFixtures: [] });
    expect(comparison.addedSourceFiles.sort()).toEqual(["lib/tools/sourceTools.ts", "lib/game/toolkit.ts", "lib/memory/domainPolicy.ts", "lib/repositories/memoryRepository.ts", "lib/repositories/promptRunRepository.ts", "lib/repositories/conversationRepository.ts", ...knowledgeSources].sort());
    expect(comparison.changedSourceFiles.length).toBeGreaterThan(0);
    expect(comparison.changedExistingRequests.length).toBeGreaterThan(0);
    expect(comparison.addedCases).toHaveLength(13);
  });

  it("preserves all R4 request and fixture hashes while adding the live memory read boundary", () => {
    const comparison = comparePromptBaselines(tools, promptBaselineSnapshot(result));
    expect(comparison).toMatchObject({ addedCases: [], removedCases: [], changedExistingRequests: [], changedExistingFixtures: [] });
    expect(Object.keys(tools.sourceHashes).every((file) => file in result.sourceHashes)).toBe(true);
    expect(comparison.addedSourceFiles.sort()).toEqual(["lib/memory/domainPolicy.ts", "lib/repositories/memoryRepository.ts", "lib/repositories/promptRunRepository.ts", "lib/repositories/conversationRepository.ts", ...knowledgeSources].sort());
  });

  it("keeps R5.1 prompts unchanged while tracking source cleanup in the real repositories", () => {
    const comparison = comparePromptBaselines(memoryPolicy, promptBaselineSnapshot(result));
    expect(comparison).toMatchObject({ addedCases: [], removedCases: [], changedExistingRequests: [], changedExistingFixtures: [] });
    expect(comparison.changedSourceFiles).toContain("lib/repositories/memoryRepository.ts");
    expect(comparison.addedSourceFiles.sort()).toEqual(["lib/repositories/conversationRepository.ts", ...knowledgeSources].sort());
  });
  it("retains R5.2 legacy request hashes and separately tracks the new knowledge assembly", () => {
    const comparison = comparePromptBaselines(library, promptBaselineSnapshot(result));
    expect(comparison).toMatchObject({ addedCases: [], removedCases: [], changedExistingRequests: [], changedExistingFixtures: [] });
    expect(comparison.addedSourceFiles.sort()).toEqual([...knowledgeSources].sort());
  });
  it("preserves all R5.3 requests while adding the source-validated summary operation", () => {
    const comparison = comparePromptBaselines(retrieval, promptBaselineSnapshot(result));
    expect(comparison).toMatchObject({ addedCases: [], removedCases: [], changedExistingRequests: [], changedExistingFixtures: [] });
    expect(comparison.addedSourceFiles.sort()).toEqual([...summarySources].sort());
  });
});
