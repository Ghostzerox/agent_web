import { describe, expect, it, vi } from "vitest";
import { explorationMessages, EXPLORATION_CONTEXT_BUDGET, EXPLORATION_PROMPT_VERSION } from "@/lib/game/exploration/prompt";
import { startWorld } from "@/lib/game/exploration/engine";
import { createGameNarrativeGenerator } from "@/lib/game/gameNarrativeGenerator";
import type { ModelStreamRequest } from "@/lib/ai/server/modelProvider";
import { atWorldDecision } from "./helpers/explorationJourney";

describe("R7 scoped prompt budgets", () => {
  it("bounds valid context JSON without including the whole world or truncating fields", () => {
    const state = atWorldDecision();
    for (const person of Object.values(state.characters)) {
      person.knownInformation = Array.from({ length: 20 }, (_, index) => `${index}${"合成资料".repeat(100)}`);
      person.memories = [...person.knownInformation];
    }
    const prompt = explorationMessages(state, "先观察，不替我行动", undefined, Array.from({ length: 30 }, () => ({ playerContent: "P".repeat(4000), assistantContent: "A".repeat(10000) })), ["避免海难细节"]);
    const context = prompt.at(-2)!.content as string;
    const json = context.slice(context.indexOf("\n") + 1);
    expect(() => JSON.parse(json)).not.toThrow(); expect(json.length).toBeLessThanOrEqual(EXPLORATION_CONTEXT_BUDGET);
    expect(prompt.length).toBeLessThanOrEqual(15);
    expect(JSON.stringify(prompt).length).toBeLessThan(30000);
    expect(prompt[0].content).toContain("避免海难细节");
    expect(prompt.at(-1)?.content).toBe("先观察，不替我行动");
  });
  it("attributes exploration separately without changing old game transport", async () => {
    const stream = vi.fn(async function* (_request: ModelStreamRequest) {
      void _request;
      yield { type: "delta" as const, text: '{"narrative":"合成回应","statePatch":{}}' };
    });
    const generator = createGameNarrativeGenerator({ getConfig: () => ({ apiKey: "synthetic", baseUrl: "https://provider.invalid", model: "mock" }), createProvider: () => ({ stream }) });
    await generator.generate(explorationMessages(startWorld("fog-harbor"), "你好"));
    expect(stream.mock.calls[0][0]).toMatchObject({ business: "game", promptVersion: EXPLORATION_PROMPT_VERSION });
  });
});
