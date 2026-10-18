import { AppShell } from "@/components/ui/AppShell";
import { PluginManager } from "@/components/plugins/PluginManager";
import { Disclosure } from "@/components/ui/Disclosure";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";
import { MODULE_TOOL_IDS } from "@/lib/platform/workspaceNavigation";

export const dynamic = "force-dynamic";

export default function PluginsPage() {
  return (
    <AppShell route="/plugins" title="活动插件" description="为学习与娱乐添加能力，按需启用和授权。">
      <PluginManager />
      <Disclosure title="高级：插件清单兼容性检查"><ToolsWorkbench toolIds={MODULE_TOOL_IDS.plugins} /></Disclosure>
    </AppShell>
  );
}
