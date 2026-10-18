import { expect, it } from "vitest";
import { createSeededRandom } from "@/lib/shared/random";
import { rollGameDice } from "@/lib/game/dice";

// Frozen from the R9.2 implementation (8644aab), not recomputed by the implementation under test.
it.each([
  ["seed-1", [34, 9, 2, 10, 18, 92]],
  ["中文/牌堆", [60, 93, 72, 78, 33, 24]],
  ["recall:unit-1", [97, 20, 72, 61, 75, 82]],
] as const)("preserves saved deterministic sequences for %s", (seed, expected) => {
  const random = createSeededRandom(seed);
  expect(Array.from({ length: 6 }, () => Math.floor(random() * 100) + 1)).toEqual(expected);
  expect(rollGameDice({ count: 6, sides: 100, modifier: 0, purpose: "合成验证" }, seed).results).toEqual(expected);
});
