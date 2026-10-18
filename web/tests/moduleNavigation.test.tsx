import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { MODULE_LINKS, MODULE_TOOL_IDS, WORKSPACE_SECTIONS } from "@/lib/platform/workspaceNavigation";
import { workspaceOwner } from "@/lib/platform/appRoutes";
import { resolveMemoryView } from "@/lib/platform/memoryView";
import { WORKBENCH_TOOLS } from "@/lib/tools/workbench";
import { Disclosure } from "@/components/ui/Disclosure";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";

describe("R8 module hierarchy and query contracts", () => {
  it("has seven global entries and all old / new routes belong to their designed module", () => {
    const design = JSON.parse(readFileSync("../docs/ui/r8/route-ownership.json", "utf8"));
    expect(WORKSPACE_SECTIONS.flatMap((s) => [...s.items]).map((i) => i.href)).toEqual(design.globalEntries.map((e: {path: string}) => e.path));
    for (const route of [...design.currentRoutes, ...design.plannedRoutes]) {
      if (route.path !== "/") expect(workspaceOwner(route.path)).toBe(route.owner);
      expect(existsSync(`app${route.path === "/" ? "" : route.path}/page.tsx`)).toBe(true);
    }
    expect(workspaceOwner("/memory")).toBe("settings");
    expect(workspaceOwner("/study-other")).toBeNull();
  });
  it("registers every linked pathname in web and the local React client", () => {
    const mobile = readFileSync("mobile/MobileApp.tsx", "utf8");
    for (const link of Object.values(MODULE_LINKS).flat()) {
      const path = new URL(link.href, "https://local.test").pathname;
      expect(existsSync(`app${path}/page.tsx`)).toBe(true);
      expect(mobile).toContain(`"${path}": lazy(`);
    }
  });
  it("keeps exact document citations and rejects conflicting or repeated memory view selectors", () => {
    const doc = "00000000-0000-4000-8000-000000000001";
    expect(resolveMemoryView(new URLSearchParams(`document=${doc}&version=2&line=3`))).toEqual({ view: "knowledge" });
    expect(resolveMemoryView(new URLSearchParams("palace=learning")).error).toBeTruthy();
    for (const query of ["view=unknown", "view=knowledge&view=personal", "palace=learning&view=personal", `document=${doc}&version=2&view=knowledge`, `document=${doc}&version=0`, "line=1", `document=${doc}&version=1&version=2`]) expect(resolveMemoryView(new URLSearchParams(query)).error).toBeTruthy();
    expect(resolveMemoryView(new URLSearchParams())).toEqual({ view: "personal" });
  });
  it("retains all nine tools and scopes while allowing module-only presentation", () => {
    const ids = new Set(Object.values(MODULE_TOOL_IDS).flat());
    expect([...ids].sort()).toEqual(WORKBENCH_TOOLS.map((tool) => tool.id).sort());
    const html = renderToStaticMarkup(<ToolsWorkbench toolIds={MODULE_TOOL_IDS.chat} />);
    expect(html).toContain("基础计算"); expect(html).toContain("材料证据定位");
    expect(html).not.toContain("任务时间与冲突预览"); expect(html).not.toContain("书目与 ISBN 整理");
  });
  it("folds mounted content without replacing editors with empty placeholders", () => {
    const html = renderToStaticMarkup(<Disclosure title="补充设置"><input defaultValue="保留草稿" /></Disclosure>);
    expect(html).toContain("<summary>补充设置</summary>"); expect(html).toContain('value="保留草稿"'); expect(html).not.toContain('open=""');
  });
});
