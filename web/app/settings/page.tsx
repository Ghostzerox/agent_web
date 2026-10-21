import { AppShell } from "@/components/ui/AppShell";
import { AppLink } from "@/components/platform/AppLink";
import { MODULE_LINKS } from "@/lib/platform/workspaceNavigation";
export default function SettingsPage() {
  const groups = [
    { title: "模型与连接", text: "配置AI服务，以及手机提醒与设备连接。", routes: ["/api-key", "/notifications"] },
    { title: "记忆与陪伴", text: "管理记住的内容、表达方式、声音与主动联系。", routes: ["/memory", "/persona", "/voice", "/proactivity"] },
    { title: "扩展与高级", text: "按需管理插件和独立工具。", routes: ["/plugins", "/tools"] },
  ];
  return <AppShell route="/settings" title="设置" description="按用途查找，调整只在保存后生效。"><div className="mx-auto max-w-4xl space-y-6"><header><p className="mode-eyebrow mb-3">PREFERENCES / 个人偏好</p><h2 className="text-2xl font-semibold">让知伴适合你</h2><p className="mt-2 text-sm text-[var(--workspace-muted)]">先选一类设置，进入后再修改。浏览不会请求设备权限。</p></header>{groups.map((group) => <section key={group.title} className="settings-group"><header><h3 className="font-semibold">{group.title}</h3><p className="mt-2 text-sm text-[var(--workspace-muted)]">{group.text}</p></header><div className="settings-list divide-y divide-[var(--workspace-border)]">{group.routes.map((route) => { const link = MODULE_LINKS.settings.find((entry) => entry.href === route)!; return <AppLink key={route} href={route} className="flex min-h-14 items-center justify-between gap-4 py-4"><span>{link.label}{link.description && <small className="mt-1 block text-[var(--workspace-muted)]">{link.description}</small>}</span><span aria-hidden="true">→</span></AppLink>; })}</div></section>)}</div></AppShell>;
}
