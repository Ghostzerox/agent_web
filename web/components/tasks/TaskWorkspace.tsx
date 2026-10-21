"use client";
import { TaskManager } from "./TaskManager";
import { ActionBoard } from "./ActionBoard";
import { useAppQueryReady } from "@/components/platform/useAppQuery";
import { AppLink } from "@/components/platform/AppLink";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";
import { MODULE_LINKS, MODULE_TOOL_IDS } from "@/lib/platform/workspaceNavigation";
export function TaskWorkspace() {
  const params = useAppQueryReady();
  if (!params) return <p role="status">正在打开任务空间…</p>;
  const section = params.has("task") ? "scheduled" : params.get("section");
  if (section === "scheduled") return <TaskManager key={`${params.get("task") ?? ""}:${params.get("edit") ?? ""}`} />;
  if (section === "tools") return <ToolsWorkbench toolIds={MODULE_TOOL_IDS.tasks} />;
  if (["actions", "habits", "goals", "insights", "reminders"].includes(section ?? "")) return <ActionBoard key={section} view={section as "actions" | "habits" | "goals" | "insights" | "reminders"} />;
  return <div className="mx-auto max-w-5xl space-y-5"><header><h2 className="text-2xl font-semibold">今天，先做一件事</h2><p className="mt-2 text-sm text-[var(--workspace-muted)]">记录行动与完成；打卡、目标和提醒各自管理。</p></header><nav className="ui-tabs" aria-label="任务功能">{MODULE_LINKS.tasks.slice(1, 7).map((link) => <AppLink key={link.href} href={link.href} aria-current={link.href.includes("section=actions") ? "page" : undefined}>{link.label}</AppLink>)}</nav><ActionBoard /></div>;
}
