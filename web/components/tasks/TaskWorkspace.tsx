"use client";
import { TaskManager } from "./TaskManager";
import { ActionBoard } from "./ActionBoard";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { ModuleDirectory } from "@/components/ui/ModuleDirectory";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";
import { MODULE_LINKS, MODULE_TOOL_IDS } from "@/lib/platform/workspaceNavigation";
export function TaskWorkspace() {
  const params = useAppQuery(); const section = params.has("task") ? "scheduled" : params.get("section");
  if (section === "scheduled") return <TaskManager key={`${params.get("task") ?? ""}:${params.get("edit") ?? ""}`} />;
  if (section === "tools") return <ToolsWorkbench toolIds={MODULE_TOOL_IDS.tasks} />;
  if (["actions", "habits", "goals", "insights", "reminders"].includes(section ?? "")) return <ActionBoard key={section} view={section as "actions" | "habits" | "goals" | "insights" | "reminders"} />;
  return <ModuleDirectory title="从一件小事开始" description="待办、习惯、目标、统计与定时任务分别进入。完成行动不会被误当成系统已提醒，打开目录也不会自动创建任务。" links={MODULE_LINKS.tasks.slice(1)} />;
}
