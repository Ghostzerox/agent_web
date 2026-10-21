"use client";
import { AppShell } from "@/components/ui/AppShell";
import { InboxManager } from "@/components/inbox/InboxManager";
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
    </div> : <div className="mx-auto max-w-5xl space-y-6"><header className="content-intro"><p className="mode-eyebrow">THE READING ROOM / 阅读室</p><h2>读世界，也读自己</h2><p>新闻、书籍与值得慢慢思考的问题。</p></header><nav className="ui-tabs" aria-label="内容阅读与管理"><AppLink href="/inbox?source=personal_briefing">读新闻</AppLink><AppLink href="/inbox?source=book_recommendation">读书籍推荐</AppLink><AppLink href="/inbox?source=reflection_question">看思考问题</AppLink></nav><InboxManager contentOnly /><Disclosure title="订阅、偏好与工具"><ModuleDirectory title="内容管理" description="订阅决定以后收到什么，不会在打开页面时自动生成。" links={MODULE_LINKS.content.slice(1)} /></Disclosure></div>}
  </AppShell>;
}
