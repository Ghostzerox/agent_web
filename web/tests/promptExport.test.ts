import { beforeAll, describe, expect, it } from "vitest";
import {
  createPromptExportArtifact,
  createPromptExportDocument,
} from "@/lib/ai/promptExport";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";

describe("Prompt export", () => {
  let envelope: PromptEnvelope;

  beforeAll(async () => {
    envelope = await createTestPromptEnvelope();
  });

  it("redacts memory by default while keeping request metadata and a hash", async () => {
    const document = await createPromptExportDocument(envelope, {
      includeMemory: false,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });

    expect(document.provider).toEqual(envelope.provider);
    expect(document.request.messages[1].content).toContain("已从导出文件中移除");
    expect(JSON.stringify(document)).not.toContain("先看例子");
    expect(document.privacy).toMatchObject({
      exactRequestContent: false,
      memoryIncluded: false,
      redactedSources: ["memory"],
    });
    expect(document.integrity.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(document.integrity.auditContentHash).toBe(
      envelope.integrity.contentHash,
    );
    expect(document.envelope).toMatchObject({
      runId: envelope.runId,
      composerVersion: "r3.2/mode-prompts-v1",
    });
    expect(JSON.stringify(document)).not.toContain("apiKey");
  });

  it("includes the exact memory layer only after explicit confirmation", async () => {
    const document = await createPromptExportDocument(envelope, {
      includeMemory: true,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });

    expect(document.request.messages[1].content).toContain("先看例子");
    expect(document.privacy.exactRequestContent).toBe(true);
    expect(document.privacy.memoryIncluded).toBe(true);
  });

  it("creates readable JSON and Markdown files with safe filenames", async () => {
    const json = await createPromptExportArtifact(envelope, "json", {
      includeMemory: false,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });
    const markdown = await createPromptExportArtifact(envelope, "markdown", {
      includeMemory: false,
      exportedAt: "2026-09-26T02:03:04.000Z",
    });

    expect(json.filename).toBe("prompt-分数与极限-测试-20260926T020304000Z.json");
    expect(() => JSON.parse(json.content)).not.toThrow();
    expect(markdown.filename.endsWith(".md")).toBe(true);
    expect(markdown.content).toContain("# Prompt 导出");
    expect(markdown.content).toContain("Run ID");
    expect(markdown.content).toContain("````\n解释 ``` 极限\n````");
  });
});
