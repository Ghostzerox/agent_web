import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@/components/ui/AppShell";
import { MODULE_LINKS, WORKSPACE_SECTIONS, isWorkspaceRouteActive, workspaceLocation, moduleLinkGroups } from "@/lib/platform/workspaceNavigation";
import { navigationWarning, registerNavigationGuard, requestNavigationPermission } from "@/lib/platform/navigationGuard";
import { configureAppNavigation } from "@/lib/platform/appNavigation";

afterEach(() => { vi.useRealTimers(); configureAppNavigation("path"); });
describe("workspace navigation", () => {
  it("provides a structural parent for every module child, independent of history and host", () => {
    for (const [owner, links] of Object.entries(MODULE_LINKS)) {
      for (const link of links.slice(1)) {
        const url = new URL(link.href, "https://local.test");
        expect(workspaceLocation(url.pathname, url.searchParams, "fallback").parent?.href, `${owner}: ${link.href}`).toBe(links[0].href);
      }
      const root = new URL(links[0].href, "https://local.test");
      expect(workspaceLocation(root.pathname, root.searchParams, "fallback").parent).toBeUndefined();
      const groups = moduleLinkGroups(owner as keyof typeof MODULE_LINKS);
      expect(groups.flatMap((group) => group.links).map((link) => link.href).sort()).toEqual(links.slice(1).map((link) => link.href).sort());
    }
  });
  it.each([
    ["/entertainment?view=creator&world=world-1&section=region", "/entertainment?view=creator"],
    ["/entertainment?view=creator&world=world-1&section=design-items", "/entertainment?view=creator&world=world-1&section=overview"],
    ["/entertainment?view=creator&world=world-1&section=design-items&design=item-1&part=preview", "/entertainment?view=creator&world=world-1&section=design-items"],
    ["/entertainment?view=creator&world=world-1&section=design-events&event=event-1&eventPart=preview", "/entertainment?view=creator&world=world-1&section=design-events"],
    ["/entertainment?session=save-1", "/entertainment?view=worlds"],
    ["/entertainment?view=draws&session=save-1&parent=turn-1", "/entertainment?session=save-1"],
    ["/entertainment?session=save-1&panel=events", "/entertainment?session=save-1"],
    ["/memory?view=knowledge&document=doc-1&version=1&line=3", "/memory"],
    ["/tasks?task=task-1&edit=true", "/tasks?section=scheduled"],
  ])("resolves deep-link parent for %s", (href, parent) => {
    const url = new URL(href, "https://local.test");
    expect(workspaceLocation(url.pathname, url.searchParams, "子页").parent?.href).toBe(parent);
  });
  it("groups unique destinations and marks nested learning and game routes active", () => {
    const targets = WORKSPACE_SECTIONS.flatMap((section) => section.items.map((item) => item.href));
    expect(new Set(targets).size).toBe(targets.length);
    expect(isWorkspaceRouteActive("/study/memorization", "/study")).toBe(true);
    expect(isWorkspaceRouteActive("/entertainment/quick-adventure", "/entertainment")).toBe(true);
    expect(isWorkspaceRouteActive("/study-other", "/study")).toBe(false);
  });
  it("renders one heading and module-only routes without global behavior-mode shortcuts", () => {
    configureAppNavigation("hash");
    const html = renderToStaticMarkup(<AppShell route="/study/memorization" title="背书训练" description="学习活动"><p>保留活动</p></AppShell>);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain('href="#/chat?mode=');
    expect(html).toContain('href="#/settings"');
    expect(html).toContain('aria-label="打开本模块功能"');
    expect(html).not.toContain("模块内导航"); // Only mounted when explicitly opened.
    expect(html).toMatch(/href="#\/study" aria-current="page"/);
    expect(html).toContain('aria-label="打开模式与导航"');
    expect(html).toContain("保留活动");
    expect(html).toContain('aria-label="返回学习首页"');
    expect(html).toContain('data-workspace="study"');
  });
  it("confirms unsaved drafts, aggregates guards and leaves them registered after cancellation", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T00:00:00Z"));
    const clearFirst = registerNavigationGuard("first", "未保存草稿");
    const clearSecond = registerNavigationGuard("second", "生成尚未完成");
    try {
      const reject = vi.fn().mockReturnValue(false);
      expect(requestNavigationPermission(reject)).toBe(false);
      expect(reject.mock.calls[0][0]).toContain("未保存草稿");
      expect(reject.mock.calls[0][0]).toContain("生成尚未完成");
      expect(navigationWarning()).toContain("未保存草稿");
      const accept = vi.fn().mockReturnValue(true);
      expect(requestNavigationPermission(accept, "/tasks")).toBe(true);
      expect(requestNavigationPermission(reject, "/tasks", true)).toBe(true);
      expect(requestNavigationPermission(reject, "/study", true)).toBe(false);
      expect(requestNavigationPermission(accept, "/tasks")).toBe(true);
      expect(requestNavigationPermission(reject, "/tasks")).toBe(false); // Fresh action never inherits a previous approval.
      vi.advanceTimersByTime(501);
      expect(requestNavigationPermission(reject)).toBe(false);
    } finally { clearFirst(); clearSecond(); }
    expect(navigationWarning()).toBeNull();
  });
});
