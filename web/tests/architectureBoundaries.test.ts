import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MODULE_ROUTE_PATHS, workspaceOwner } from "@/lib/platform/appRoutes";
import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";
import { FIRST_PARTY_PLUGIN_ACTIVITIES } from "@/lib/plugins/activityRegistry";

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

it("keeps current page ownership and static mobile loaders complete without maintaining another route union", () => {
  const routes = ["/", ...Object.values(MODULE_ROUTE_PATHS).flat()];
  const pages = readdirSync("app", { recursive: true }).filter((name) => String(name).endsWith("page.tsx"))
    .map((name) => "/" + String(name).replaceAll("\\", "/").replace(/(?:\/)?page\.tsx$/u, ""));
  expect(new Set(routes).size).toBe(routes.length);
  expect([...routes].sort()).toEqual(pages.sort());
  const mobile = readFileSync("mobile/MobileApp.tsx", "utf8");
  expect([...mobile.matchAll(/^  "([^"]+)": lazy\(/gmu)].map((match) => match[1]).sort()).toEqual([...routes].sort());
  for (const [owner, paths] of Object.entries(MODULE_ROUTE_PATHS)) {
    for (const path of paths) expect(workspaceOwner(path)).toBe(owner);
  }
});

it("derives manifest activity declarations from registered owners while retaining strict ownership checks", () => {
  for (const value of FIRST_PARTY_PLUGIN_MANIFESTS) {
    const manifest = value as { id: string; contributions: { activities: string[] } };
    expect(manifest.contributions.activities).toEqual(FIRST_PARTY_PLUGIN_ACTIVITIES.filter((activity) => activity.pluginId === manifest.id).map((activity) => activity.id));
  }
  for (const activity of FIRST_PARTY_PLUGIN_ACTIVITIES) expect(workspaceOwner(activity.route)).not.toBeNull();
});
