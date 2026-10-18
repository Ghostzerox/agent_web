import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps runtime and type import graphs acyclic and private server code outside client runtime", () => {
  const report = JSON.parse(execFileSync(process.execPath, ["scripts/r9-inventory.mjs", "--working-tree"], { encoding: "utf8", maxBuffer: 4_000_000 }));
  expect(report.graph.unresolvedInternalSpecifiers).toEqual([]);
  expect(report.cycles).toEqual({ runtime: [], includingTypes: [] });
  expect(report.clientRuntimeServerFiles).toEqual([]);
});

it("defines API client DTOs without inferring them from repositories or SQL types", () => {
  for (const name of readdirSync("lib/api").filter((name) => name.endsWith("Client.ts"))) {
    expect(readFileSync(`lib/api/${name}`, "utf8"), name).not.toMatch(/(?:@\/lib\/(?:repositories|db)\/|drizzle-orm)/u);
  }
});
