"use client";
import { AppShell } from "@/components/ui/AppShell";
import { ModuleDirectory } from "@/components/ui/ModuleDirectory";
import { Disclosure } from "@/components/ui/Disclosure";
import { AppLink } from "@/components/platform/AppLink";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { MODULE_LINKS, MODULE_TOOL_IDS } from "@/lib/platform/workspaceNavigation";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";
export default function ContentPage() {
  const params = useAppQuery(); const view = params.get("view");
  return <AppShell route="/content" title="内容" description="新闻、书籍与好问题，在各自的空间里阅读与管理。">
    {view === "tools" ? <ToolsWorkbench toolIds={MODULE_TOOL_IDS.content} /> : view === "briefing" ? <div className="space-y-5">
      <ModuleDirectory title="新闻简报" description="生成结果统一保存在收件箱，读状态和反馈不重复保存。订阅的时间、主题与频率由任务模块管理。" links={[
        { href: "/inbox?source=personal_briefing", label: "阅读已投递简报", description: "查看来源与反馈；进入不自动标为已读" },
        { href: "/tasks?section=scheduled", label: "管理简报订阅", description: "在定时任务中明确创建或调整简报，不自动生成" },
      ]} /><Disclosure title="高级：核对新闻来源"><ToolsWorkbench toolIds={["content.sources"]} /></Disclosure>
    </div> : <><ModuleDirectory title="今天，读点什么？" description="选择新闻简报、书籍或思考问题。这里是入口目录，不把各类偏好和长篇结果全部摊在同一个页面。" links={MODULE_LINKS.content.slice(1)} /><AppLink href="/inbox" className="module-local-link mt-5 inline-flex">打开统一收件箱</AppLink></>}
  </AppShell>;
}
