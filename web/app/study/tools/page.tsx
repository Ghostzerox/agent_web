import { AppShell } from "@/components/ui/AppShell";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";
import { MODULE_TOOL_IDS } from "@/lib/platform/workspaceNavigation";
export default function StudyToolsPage() {
  return <AppShell route="/study/tools" title="学习工具" description="材料导入校验、基础计算与原文定位；不自动写入材料。"><ToolsWorkbench toolIds={MODULE_TOOL_IDS.study} /></AppShell>;
}
