import { AppLink } from "@/components/platform/AppLink";
import { AppShell } from "@/components/ui/AppShell";
import { WORKSPACE_SECTIONS } from "@/lib/platform/workspaceNavigation";

export default function Home() {
  return <AppShell route="/" title="AI 学习伴侣" description="学习、思考、生活，也留一点时间给故事。">
    <div className="mx-auto max-w-5xl py-6 sm:py-12">
      <p className="text-xs font-semibold tracking-widest text-emerald-700 dark:text-emerald-300">YOUR EVERYDAY COMPANION</p>
      <h2 className="mt-5 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">好好学习，<br />也好好生活。</h2>
      <p className="mt-6 max-w-xl text-base leading-8 text-zinc-500">需要严谨的答案，或只是想说说话？知伴为不同的时刻准备了不同的空间，你可以随时选择。</p>
      <AppLink href="/chat" className="mt-8 inline-flex min-h-12 items-center gap-6 rounded-xl bg-emerald-700 px-6 text-sm font-medium text-white hover:bg-emerald-800">开始对话 <span aria-hidden="true">→</span></AppLink>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {WORKSPACE_SECTIONS.flatMap((section) => [...section.items]).map((item) => <AppLink key={item.href} href={item.href} className="module-card"><h3 className="font-semibold">{item.label} <span aria-hidden="true" className="float-right text-emerald-600">↗</span></h3><p className="mt-3 text-sm leading-7 text-zinc-500">{item.description}</p></AppLink>)}
      </div>
    </div>
  </AppShell>;
}
