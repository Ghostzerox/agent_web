import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { promptBaselineCases, promptBaselineSnapshot, runPromptBaseline } from "@/evals/r3/promptBaseline";
import { MODEL_CALLER_FILES, MODULE_PROMPT_COVERAGE, PROMPT_ENTRY_POINTS, AUXILIARY_PROMPT_ENTRY_POINTS, PROMPT_SOURCE_FILES } from "@/evals/r3/promptInventory";
import baseline from "@/evals/r3/baseline-current.json";

vi.mock("@/lib/db/client", () => ({ getDatabase: () => { throw new Error("Database access is forbidden in prompt baseline tests"); } }));
let result: Awaited<ReturnType<typeof runPromptBaseline>>;
const fetch = vi.fn(() => { throw new Error("Network access is forbidden"); });
beforeAll(async () => { vi.stubGlobal("fetch", fetch); result = await runPromptBaseline(); });
afterAll(() => vi.unstubAllGlobals());

describe("R3 offline prompt baselines", () => {

  it("covers nine generation families and all sixteen modules, including deterministic services", () => {
    expect(PROMPT_ENTRY_POINTS).toHaveLength(9);
    expect(AUXILIARY_PROMPT_ENTRY_POINTS).toHaveLength(2);
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

  it("has at least five normal and one boundary case per family without changing runtime templates", () => {
    for (const { id } of PROMPT_ENTRY_POINTS) {
      expect(result.cases.filter((item) => item.entry === id && item.kind === "normal").length, id).toBeGreaterThanOrEqual(5);
      expect(result.cases.some((item) => item.entry === id && item.kind === "boundary"), id).toBe(true);
    }
  });

});
