import { describe, expect, it } from "vitest";
import { branchPath, sourceRevisions, summarySources, validateSummary, summaryLayer, summarySettingsSchema, DEFAULT_SUMMARY_SETTINGS, type SummaryMessage } from "@/lib/conversation/summary";
import { createPromptEnvelope, verifyPromptEnvelope } from "@/lib/ai/promptEnvelope";
import { createPromptExportDocument } from "@/lib/ai/promptExport";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows: SummaryMessage[] = Array.from({ length: 20 }, (_, n) => ({ id: id(n + 1), parentMessageId: n ? id(n) : null, role: n % 2 ? "assistant" : "user", status: "complete", content: `消息${n + 1}：目标：完成学习计划。预算不超过30元。保留待确认事项。${"其他上下文。".repeat(80)}` }));
const payload = { points: [{ kind: "constraint" as const, text: "用户预算不超过30元，待确认事项尚未完成。", evidence: [{ messageId: id(1), quote: "预算不超过30元" }] }] };
describe("R5.4 branch summary source and prompt contracts", () => {
  it("selects only the real ancestors, not siblings or array order", () => {
    const sibling = { ...rows[3], id: id(99), content: "兄弟分支秘密" };
    expect(branchPath([...rows].reverse().concat(sibling), id(20))).toEqual(rows);
    expect(branchPath([...rows, sibling], id(99)).map((r) => r.id)).toEqual([id(1), id(2), id(3), id(99)]);
  });
  it("rejects missing parents, cycles, invalid roles and incomplete messages", () => {
    for (const changed of [{ parentMessageId: id(999) }, { parentMessageId: id(20) }, { role: "tool" }, { status: "failed" }]) expect(() => branchPath([...rows.slice(0, -1), { ...rows[19], ...changed }], id(20))).toThrow();
  });
  it("covers all older turns and keeps recent messages intact, without head/tail fake summaries", () => {
    expect(summarySources(rows, DEFAULT_SUMMARY_SETTINGS)).toEqual(rows.slice(0, 14));
    expect(summarySources(rows.slice(0, 19), DEFAULT_SUMMARY_SETTINGS)).toEqual(rows.slice(0, 12));
    expect(() => summarySources(rows.slice(0, 8), DEFAULT_SUMMARY_SETTINGS)).toThrow();
    expect(summarySettingsSchema.safeParse({ threshold: 10, recent: 10 }).success).toBe(false);
  });
  it("hashes content, topology and role; the public prefix survives a new branch", async () => {
    const baseline = await sourceRevisions(rows);
    expect(await sourceRevisions(rows.slice(0, 14))).toEqual(baseline.slice(0, 14));
    for (const patch of [{ content: "更正" }, { parentMessageId: id(2) }, { role: "assistant" }]) expect((await sourceRevisions([{ ...rows[0], ...patch }]))[0].hash).not.toBe(baseline[0].hash);
  });
  it("validates exact original evidence and rejects unknown sources, invented quotes, empty and oversized output", () => {
    expect(validateSummary(payload, rows, DEFAULT_SUMMARY_SETTINGS)).toEqual(payload);
    for (const bad of [{ points: [] }, { points: [{ ...payload.points[0], evidence: [{ messageId: id(99), quote: "预算不超过30元" }] }] }, { points: [{ ...payload.points[0], evidence: [{ messageId: id(1), quote: "已完成所有任务" }] }] }, { ...payload, extra: true }]) expect(() => validateSummary(bad, rows, DEFAULT_SUMMARY_SETTINGS)).toThrow();
    expect(() => validateSummary(payload, [{ ...rows[0], content: "预算不超过30元" }], DEFAULT_SUMMARY_SETTINGS)).toThrow("不比原文紧凑");
    expect(() => validateSummary({ points: Array.from({ length: 12 }, () => ({ ...payload.points[0], text: "过长摘要".repeat(100) })) }, rows, { ...DEFAULT_SUMMARY_SETTINGS, maxCharacters: 1000 })).toThrow("长度预算");
  });
  it("exports truthful compression metadata and redacts the summary by default", async () => {
    const usage = { id: id(90), fingerprint: "a".repeat(64), sourceCount: 14, originalEstimatedTokens: 5000, compactEstimatedTokens: 1200 };
    const envelope = await createPromptEnvelope({ runId: id(91), conversation: { id: id(92), title: "摘要", activeLeafId: id(20) }, trigger: "send", prompt: [summaryLayer(payload), { kind: "conversation", source: "conversation", role: "user", content: "当前问题必须原样保留" }], provider: { provider: "openai-compatible", baseUrl: "https://example.test", model: "mock" }, summary: { usage, note: "摘要 + 近期原文" } });
    expect(envelope.context).toMatchObject({ compressed: true, truncated: false, summary: usage });
    expect(await verifyPromptEnvelope(envelope)).toBe(true);
    const redacted = await createPromptExportDocument(envelope, { includeMemory: false });
    expect(redacted.privacy.redactedSources).toEqual(["summary"]);
    expect(JSON.stringify(redacted)).not.toContain("预算不超过30元");
    expect(JSON.stringify(await createPromptExportDocument(envelope, { includeMemory: true }))).toContain("预算不超过30元");
  });
});
