import { expect, it } from "vitest";
import { runCreationQuality, syntheticQualityReply } from "../evals/r10/creationQuality";

it("rehearses the exact eight-call paid probe offline and checks actual actor request contents", async () => {
  const seen: string[] = [];
  const result = await runCreationQuality(async (id, request) => {
    seen.push(id); const serialized = JSON.stringify(request);
    if (id.startsWith("actor-")) {
      expect(serialized).not.toMatch(/SYNTH_HOST_ONLY|SYNTH_CHARACTER_HOST_ONLY|SYNTH_PRIVATE_THOUGHT|SYNTH_OOC/);
      expect(serialized).toContain("SYNTH_SELF_PAST");
      if (id === "actor-before-knowledge") expect(serialized).not.toContain("SYNTH_PORT_RUMOR");
      else { expect(serialized).toContain("SYNTH_PORT_RUMOR"); expect(serialized).toContain("rumor"); }
    }
    return syntheticQualityReply(request);
  });
  expect(result).toMatchObject({ calls: 8, fixedDrawModelCalls: 0, finalCoins: 3, finalInventoryQuantities: [3, 2] });
  expect(new Set(seen).size).toBe(8);
}, 30000);
