"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  getReflectionPreference,
  updateReflectionPreference,
  type ReflectionPreference,
  type ReflectionStyle,
} from "@/lib/api/reflectionPreferenceClient";
import { appHref } from "@/lib/platform/appNavigation";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

type FormState = {
  enabled: boolean;
  goals: string;
  avoidTopics: string;
  style: ReflectionStyle;
  maxQuestions: number;
};

function formFrom(preferences: ReflectionPreference): FormState {
  return {
    enabled: preferences.enabled,
    goals: preferences.goals.join("\n"),
    avoidTopics: preferences.avoidTopics.join("\n"),
    style: preferences.style,
    maxQuestions: preferences.maxQuestions,
  };
}

function lines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "保存失败，请稍后重试。";
}

export function ReflectionPreferenceManager() {
  const [preferences, setPreferences] = useState<ReflectionPreference | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useNavigationGuard(saving || Boolean(preferences && form && JSON.stringify(form) !== JSON.stringify(formFrom(preferences))));

  useEffect(() => {
    let active = true;
    void getReflectionPreference()
      .then((loaded) => {
        if (!active) return;
        setPreferences(loaded);
        setForm(formFrom(loaded));
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!preferences || !form) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateReflectionPreference({
        enabled: form.enabled,
        goals: lines(form.goals),
        avoidTopics: lines(form.avoidTopics),
        style: form.style,
        maxQuestions: form.maxQuestions,
        expectedVersion: preferences.version,
      });
      setPreferences(updated);
      setForm(formFrom(updated));
      setSaved(true);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取思考问题设置…</p>;
  }
  if (!preferences || !form) {
    return <div role="alert" className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error ?? "无法读取思考问题设置。"}</div>;
  }

  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Reflection controls</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">让问题真正值得想</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">系统先生成 3–5 个候选，再按相关性、新颖性、可行动性和情绪负担筛选；不会在每条普通回答末尾强行追问。</p>
        </div>

        <label className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <span>
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">启用思考问题</span>
            <span className="mt-1 block text-xs leading-5 text-zinc-500">关闭后，独立反思任务会静默跳过，个人简报仍会生成，但不再附加问题。</span>
          </span>
          <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="mt-1 size-5" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            提问风格
            <select value={form.style} onChange={(event) => setForm({ ...form, style: event.target.value as ReflectionStyle })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="gentle">温和：优先低情绪负担</option>
              <option value="balanced">平衡：兼顾挑战与行动</option>
              <option value="challenging">挑战：允许更直接地检视假设</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            每次最多展示
            <select value={form.maxQuestions} onChange={(event) => setForm({ ...form, maxQuestions: Number(event.target.value) })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value={1}>1 个（推荐）</option>
              <option value={2}>2 个</option>
              <option value={3}>3 个</option>
            </select>
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            当前目标
            <textarea rows={5} value={form.goals} onChange={(event) => setForm({ ...form, goals: event.target.value })} placeholder="例如：建立稳定的学习节奏\n完成作品集项目" className="mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm dark:border-zinc-700" />
            <span className="mt-1 block text-xs font-normal text-zinc-500">每行一个；用于判断问题是否与你真正相关。</span>
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            暂不触碰的话题
            <textarea rows={5} value={form.avoidTopics} onChange={(event) => setForm({ ...form, avoidTopics: event.target.value })} placeholder="例如：家庭关系\n身体外貌" className="mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm dark:border-zinc-700" />
            <span className="mt-1 block text-xs font-normal text-zinc-500">命中这些主题的候选会被代码过滤，不交付给你。</span>
          </label>
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">思考问题设置已保存，下一次生成立即生效。</p>}
        <button type="submit" disabled={saving} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">{saving ? "保存中…" : "保存设置"}</button>
      </section>

      <aside className="h-fit space-y-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <h2 className="font-semibold">怎样触发</h2>
        <p>个人简报会在启用时附加经过筛选的问题；你也可以创建每周“思考问题”任务，围绕一个具体目标单独复盘。</p>
        <a href={appHref("/tasks?section=scheduled")} className="inline-flex rounded-lg bg-blue-700 px-3 py-2 font-medium text-white hover:bg-blue-600">创建思考问题任务</a>
      </aside>
    </form>
  );
}
