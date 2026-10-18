import { describe, expect, it } from "vitest";
import { buildAgentPrompt } from "@/lib/agent/promptBuilder";
import { CORE_MODE_PROMPT_VERSION, coreModeRegistry } from "@/lib/agent/modeRegistry";
import { createPromptEnvelope, hashPromptEnvelopeContent, verifyPromptEnvelope } from "@/lib/ai/promptEnvelope";
import { buildPersonaInstruction, DEFAULT_PERSONA_PROFILE, PERSONA_PROMPT_VERSION } from "@/lib/persona/personaProfile";
import { MODE_QUALITY_SCENARIOS } from "@/evals/r3/modeQualityScenarios";
import { createPromptExportArtifact } from "@/lib/ai/promptExport";
import { createTestPromptEnvelope } from "./helpers/promptEnvelope";

describe("R3.2 mode prompt contracts (not model answer scores)", () => {
  it("keeps the same factual policy and current explicit request across four modes", () => {
    const inputs = MODE_QUALITY_SCENARIOS.filter((scenario) => scenario.id.endsWith("-fact"));
    expect(new Set(inputs.map((scenario) => scenario.input)).size).toBe(1);
    const prompts = inputs.map((scenario) => buildAgentPrompt({ session: { id: "synthetic", title: "fact", mode: scenario.mode, updatedAt: 1, schemaVersion: 2, activeLeafId: "user", messages: [{ id: "user", parentId: null, role: "user", content: scenario.input }] }, memory: [] }));
    expect(new Set(prompts.map((prompt) => prompt[0].content)).size).toBe(1);
    for (const prompt of prompts) {
      expect(prompt.map((message) => message.source)).toEqual(["policy", "mode", "persona", "conversation"]);
      expect(prompt.at(-1)?.content).toBe(inputs[0].input);
      expect(prompt[2].content).toContain("不必每轮以问题结束");
      expect(prompt[0].content).toContain("不捏造事实");
    }
  });

  it("makes each interaction contract explicit without changing entertainment/game behavior", () => {
    expect(coreModeRegistry.get("auto").instruction).toContain("不把普通问题强行心理分析");
    expect(coreModeRegistry.get("professional").instruction).toContain("先给直接结论");
    expect(coreModeRegistry.get("professional").instruction).toContain("不声称已联网、运行代码");
    expect(coreModeRegistry.get("companion").instruction).toContain("不急着列计划");
    expect(coreModeRegistry.get("companion").instruction).toContain("不得为了安慰而歪曲结论");
    expect(coreModeRegistry.get("reflection").instruction).toContain("一次提出一到两个");
    expect(coreModeRegistry.get("reflection").instruction).toContain("用户要求解释、直接建议或不想被提问时先给回答");
    expect(coreModeRegistry.get("entertainment").instruction).toBe("可以在明确的虚构设定中扮演角色和推进叙事，但必须区分世界内事实与现实事实；退出虚构语境后恢复普通回答契约。");
  });

  it("respects explicit user intent even at extreme Persona settings and stays compact", () => {
    const instruction = buildPersonaInstruction({ ...DEFAULT_PERSONA_PROFILE, warmth: 100, humor: 100, directness: 0, verbosity: 100, initiative: 100 });
    expect(instruction).toContain("用户当前明确的任务、格式与篇幅要求优先");
    expect(instruction).toContain("不想被提问时尊重其选择");
    expect(instruction).toContain("不假装记得未提供的经历");
    expect(instruction).toContain("不授权你在会话外主动联系用户");
    expect(instruction).toContain("不能改变事实");
    for (const mode of coreModeRegistry.list()) {
      expect(mode.instruction.length).toBeLessThan(400);
      expect((mode.instruction + instruction).length).toBeLessThan(1400);
    }
  });

  it("exports the actual new mode/persona versions and preserves exact request integrity", async () => {
    const prompt = buildAgentPrompt({ session: { id: "id", title: "mode", updatedAt: 1, mode: "companion", schemaVersion: 2, activeLeafId: "user", messages: [{ id: "user", parentId: null, role: "user", content: "只想聊聊" }] }, memory: [] });
    const envelope = await createPromptEnvelope({ runId: "run", createdAt: "2026-10-15T00:00:00.000Z", trigger: "send", conversation: { id: "id", title: "mode", activeLeafId: null }, prompt, provider: { provider: "openai-compatible", baseUrl: "https://provider.invalid", model: "synthetic" } });
    expect(envelope.composer.version).toBe("r3.2/mode-prompts-v1");
    expect(envelope.promptLayers.find((layer) => layer.source === "mode")?.version).toBe(CORE_MODE_PROMPT_VERSION);
    expect(envelope.promptLayers.find((layer) => layer.source === "persona")?.version).toBe(PERSONA_PROMPT_VERSION);
    expect(await verifyPromptEnvelope(envelope)).toBe(true);
    expect(envelope.request.messages).toEqual(prompt.map(({ role, content }) => ({ role, content })));
  });

  it("can still verify and export a stored r1 envelope without rewriting it", async () => {
    const envelope = await createTestPromptEnvelope();
    envelope.composer.version = "r1/cache-friendly-v1";
    envelope.integrity.contentHash = await hashPromptEnvelopeContent(envelope);
    const before = structuredClone(envelope);
    expect(await verifyPromptEnvelope(envelope)).toBe(true);
    const artifact = await createPromptExportArtifact(envelope, "json", { includeMemory: false, exportedAt: "2026-10-15T00:00:00.000Z" });
    expect(JSON.parse(artifact.content).envelope.composerVersion).toBe("r1/cache-friendly-v1");
    expect(envelope).toEqual(before);
  });
});
