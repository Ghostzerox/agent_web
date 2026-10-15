import { describe, expect, it } from "vitest";
import {
  hashPromptEnvelopeContent,
  verifyPromptEnvelope,
} from "@/lib/ai/promptEnvelope";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";

describe("Prompt envelope", () => {
  it("versions every layer and hashes the exact provider request", async () => {
    const envelope = await createTestPromptEnvelope();

    expect(envelope.composer).toMatchObject({ version: "r3.2/mode-prompts-v1" });
    expect(envelope.promptLayers.map((layer) => layer.position)).toEqual([0, 1, 2]);
    expect(envelope.promptLayers.map((layer) => layer.version)).toEqual([
      "core-policy/v1",
      "memory-context/v2",
      "conversation-tree/v2",
    ]);
    expect(envelope.request.messages).toEqual(
      envelope.promptLayers.map(({ role, content }) => ({ role, content })),
    );
    expect(envelope.privacy.persistedPromptContent).toBe(false);
    expect(await verifyPromptEnvelope(envelope)).toBe(true);
    expect(await hashPromptEnvelopeContent(envelope)).toBe(
      envelope.integrity.contentHash,
    );
    expect(JSON.stringify(envelope)).not.toContain("apiKey");
  });

  it("detects content changes after the server hash was issued", async () => {
    const envelope = await createTestPromptEnvelope();
    envelope.promptLayers[2].content = "被修改的内容";

    expect(await verifyPromptEnvelope(envelope)).toBe(false);
  });
});
