import { AppShell } from "@/components/ui/AppShell";
import { ModuleDirectory } from "@/components/ui/ModuleDirectory";
import { MODULE_LINKS } from "@/lib/platform/workspaceNavigation";
export default function SettingsPage() {
  return <AppShell route="/settings" title="设置" description="先选分类，再调整具体设置。"><ModuleDirectory title="让知伴适合你" description="各项设置独立打开。这里不加载所有编辑器，也不会因浏览目录而请求权限或调用模型。" links={MODULE_LINKS.settings.slice(1)} /></AppShell>;
}
