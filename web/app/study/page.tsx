import { AppShell } from "@/components/ui/AppShell";
import { AppLink } from "@/components/platform/AppLink";

export default function StudyPage() {
  return <AppShell route="/study" title="学习模式" description="练习、反馈、复习，一步一步形成自己的理解。">
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="text-xs font-semibold tracking-widest text-emerald-700 dark:text-emerald-300">STUDY SPACE</p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">今天，想练习什么？</h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">这里是独立的学习活动，不会改变聊天模式。打开活动不会消耗模型 Token；生成反馈、分析题目和创建提醒都需要你的明确操作。</p>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { href: "/study/memorization", label: "背书训练", number: "01", text: "从一份材料开始，用复述找出薄弱点，再安排间隔复习。", steps: "材料 · 复述 · 反馈 · 复习" },
          { href: "/study/problem-solving", label: "解题训练", number: "02", text: "先选择提示或逐步引导，理解错因，把关键思路留下来。", steps: "题目 · 策略 · 讲解 · 复习卡" },
          { href: "/study/memory-palaces", label: "助记宫殿", number: "03", text: "把背书单元放进熟悉的位置，沿路线回忆与抽测。", steps: "房间 · 位置 · 联想 · 抽测" },
          { href: "/study/tools", label: "学习工具", number: "04", text: "单独打开导入校验、基础计算与原文证据定位。", steps: "只读与计算 · 不自动调用模型" },
        ].map((activity) => <AppLink key={activity.href} href={activity.href} className="group rounded-2xl border border-zinc-200 bg-white p-6 transition-colors hover:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="text-xs font-medium tracking-widest text-zinc-400">{activity.number}</span><h3 className="mt-3 text-xl font-semibold">{activity.label} <span aria-hidden="true" className="float-right text-emerald-600">↗</span></h3>
          <p className="mt-3 text-sm leading-7 text-zinc-500">{activity.text}</p><p className="mt-5 text-xs text-emerald-700 dark:text-emerald-300">{activity.steps}</p>
        </AppLink>)}
      </div>
      <p className="text-sm leading-6 text-zinc-500">首次使用请在 <AppLink href="/plugins" className="underline underline-offset-4">活动插件</AppLink> 中启用对应能力并授权；活动页会明确提示缺少的权限。</p>
    </div>
  </AppShell>;
}
