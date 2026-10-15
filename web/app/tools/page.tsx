import { AppShell } from "@/components/ui/AppShell";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";

export default function ToolsPage() {
  return <AppShell route="/tools" title="工具工作台" description="确定性计算、材料定位与可核对草稿。"><ToolsWorkbench /></AppShell>;
}
