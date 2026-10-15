import { describe, expect, it } from "vitest";
import { WORKBENCH_TOOLS, runWorkbenchTool } from "@/lib/tools/workbench";
import { previewMaterialImports } from "@/lib/tools/importPreview";
import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";

describe("R4 auxiliary tools", () => {
  it("keeps confirmed facts/assumptions separate and produces only future reminder drafts", () => {
    const item = WORKBENCH_TOOLS.find((tool) => tool.id === "reflection.action-draft")!;
    const example = item.example as { steps: Array<{ runAt: string }>; [key: string]: unknown };
    expect(runWorkbenchTool(item.id, example)).toMatchObject({ saved: false, confirmedFacts: ["每周可用 90 分钟"], assumptions: expect.any(Array), taskDrafts: [{ kind: "reminder" }] });
    expect(runWorkbenchTool(item.id, { ...example, steps: [{ action: "行动", doneWhen: "可见证据", runAt: "2020-01-01T00:00:00Z" }] })).toMatchObject({ taskDrafts: [], warnings: expect.any(Array) });
    expect(() => runWorkbenchTool(item.id, { ...example, steps: [] })).toThrow();
  });
  it("uses the actual speech preprocessing and reports empty/long input accurately", () => {
    expect(runWorkbenchTool("voice.preview", { markdown: "你好。```js\nsecretCode()\n``` $x^2$" })).toMatchObject({ text: expect.stringContaining("公式"), provider: "system", truncated: false });
    expect(JSON.stringify(runWorkbenchTool("voice.preview", { markdown: "```secretCode()```" }))).not.toContain("secretCode");
    expect(runWorkbenchTool("voice.preview", { markdown: "甲".repeat(6000) })).toMatchObject({ truncated: true });
    expect(() => runWorkbenchTool("voice.preview", { markdown: "" })).toThrow();
  });
  it("inspects plugin compatibility without executing/installing/granting capabilities", () => {
    const manifest = FIRST_PARTY_PLUGIN_MANIFESTS[0] as object;
    expect(runWorkbenchTool("plugins.inspect", { manifest })).toMatchObject({ compatible: true, grantsChanged: false });
    expect(runWorkbenchTool("plugins.inspect", { manifest: { ...manifest, pluginApiVersion: ">=9.0.0 <10.0.0" } })).toMatchObject({ compatible: false, grantsChanged: false });
    expect(() => runWorkbenchTool("plugins.inspect", { manifest: { ...manifest, requestedCapabilities: ["shell.exec"] } })).toThrow();
  });
  it("previews valid, empty, malformed and duplicate imports without echoing unknown credentials", () => {
    const payload = { format: "agent-web/memorization-v1", title: "A", sourceText: "B", units: [{ cue: "C", content: "B" }] };
    const preview = previewMaterialImports([payload, payload, { apiKey: "never-echo-this" }], ["A"]);
    expect(preview).toMatchObject([{ valid: true, unitCount: 1 }, { valid: true, warnings: expect.arrayContaining(["与本批第 1 项内容重复。"]) }, { valid: false }]);
    expect(JSON.stringify(preview)).not.toContain("never-echo-this");
    expect(runWorkbenchTool("maintenance.import-preview", { payloads: [], existingTitles: [] })).toEqual({ items: [], writes: 0, restoreEnabled: false });
  });
});
