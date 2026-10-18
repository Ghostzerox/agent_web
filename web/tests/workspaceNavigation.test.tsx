import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@/components/ui/AppShell";
import { WORKSPACE_SECTIONS, isWorkspaceRouteActive } from "@/lib/platform/workspaceNavigation";
import { navigationWarning, registerNavigationGuard, requestNavigationPermission } from "@/lib/platform/navigationGuard";
import { configureAppNavigation } from "@/lib/platform/appNavigation";

afterEach(() => { vi.useRealTimers(); configureAppNavigation("path"); });
describe("workspace navigation", () => {
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
    expect(html).toContain('href="#/study/memory-palaces"');
    expect(html).toMatch(/href="#\/study" aria-current="page"/);
    expect(html).toContain('aria-label="打开模式与导航"');
    expect(html).toContain("保留活动");
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
      expect(requestNavigationPermission(accept)).toBe(true);
      expect(requestNavigationPermission(reject)).toBe(true);
      vi.advanceTimersByTime(501);
      expect(requestNavigationPermission(reject)).toBe(false);
    } finally { clearFirst(); clearSecond(); }
    expect(navigationWarning()).toBeNull();
  });
});
