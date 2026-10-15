import { describe, expect, it } from "vitest";
import { WORKBENCH_TOOLS, runWorkbenchTool } from "@/lib/tools/workbench";

describe("R4 shared tools", () => {
  it("validates every tool's real example and rejects unknown/extra input", () => {
    expect(new Set(WORKBENCH_TOOLS.map((item) => item.id)).size).toBe(WORKBENCH_TOOLS.length);
    for (const item of WORKBENCH_TOOLS) {
      const result = runWorkbenchTool(item.id, item.example);
      expect(item.outputSchema.safeParse(result).success).toBe(true);
      expect(() => runWorkbenchTool(item.id, { ...(item.example as object), unexpected: true })).toThrow();
      expect(runWorkbenchTool(item.id, item.example)).toEqual(result);
    }
    expect(() => runWorkbenchTool("unknown", {})).toThrow();
  });
  it("calculates complete input without evaluating JavaScript or silently extracting numbers", () => {
    expect(runWorkbenchTool("professional.calculate", { expression: "(12+3)*4/2" })).toMatchObject({ value: 30 });
    for (const expression of ["2+2evil()", "1/0", "2+", "Math.random()", "2**3"]) expect(runWorkbenchTool("professional.calculate", { expression })).toMatchObject({ status: "invalid", value: null });
  });
  it("returns exact bounded original offsets and handles no matches", () => {
    expect(runWorkbenchTool("professional.locate-evidence", { document: "甲\n乙甲", query: "甲" })).toMatchObject({ matches: [{ line: 1, start: 0, end: 1 }, { line: 2, start: 3, end: 4 }] });
    expect(runWorkbenchTool("professional.locate-evidence", { document: "甲", query: "乙" })).toMatchObject({ matches: [] });
    expect(runWorkbenchTool("professional.locate-evidence", { document: "甲".repeat(30), query: "甲" })).toMatchObject({ truncated: true, matches: expect.any(Array) });
  });
});
