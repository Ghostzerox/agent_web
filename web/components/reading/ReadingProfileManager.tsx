"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  getReadingProfile,
  updateReadingProfile,
  type ReadingDifficulty,
  type ReadingGoal,
  type ReadingProfile,
} from "@/lib/api/readingProfileClient";
import { appHref } from "@/lib/platform/appNavigation";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

type FormState = {
  topics: string;
  readBooks: string;
  wantToReadBooks: string;
  dislikedBooks: string;
  difficulty: ReadingDifficulty;
  weeklyMinutes: string;
  goal: ReadingGoal;
};

function profileForm(profile: ReadingProfile): FormState {
  return {
    topics: profile.topics.join("\n"),
    readBooks: profile.readBooks.join("\n"),
    wantToReadBooks: profile.wantToReadBooks.join("\n"),
    dislikedBooks: profile.dislikedBooks.join("\n"),
    difficulty: profile.difficulty,
    weeklyMinutes: String(profile.weeklyMinutes),
    goal: profile.goal,
  };
}

function lines(value: string): string[] {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "保存失败，请稍后重试。";
}

function ListField(props: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
      {props.label}
      <textarea
        rows={4}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.hint}
        className="mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300"
      />
      <span className="mt-1 block text-xs font-normal text-zinc-500">每行一项，最多 50 项。</span>
    </label>
  );
}

export function ReadingProfileManager() {
  const [profile, setProfile] = useState<ReadingProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useNavigationGuard(saving || Boolean(profile && form && JSON.stringify(form) !== JSON.stringify(profileForm(profile))));

  useEffect(() => {
    let active = true;
    void getReadingProfile()
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
        setForm(profileForm(loaded));
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
    if (!profile || !form) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await updateReadingProfile({
        topics: lines(form.topics),
        readBooks: lines(form.readBooks),
        wantToReadBooks: lines(form.wantToReadBooks),
        dislikedBooks: lines(form.dislikedBooks),
        difficulty: form.difficulty,
        weeklyMinutes: Number(form.weeklyMinutes),
        goal: form.goal,
        expectedVersion: profile.version,
      });
      setProfile(updated);
      setForm(profileForm(updated));
      setSaved(true);
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取阅读画像…</p>;
  }
  if (!form || !profile) {
    return <div role="alert" className="mx-auto max-w-4xl rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error ?? "无法读取阅读画像。"}</div>;
  }

  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Reading profile</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">你想怎样读书</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">这些显式信息只用于定时书籍推荐，不会被当作永久人格判断。</p>
        </div>

        <ListField label="当前学习与兴趣方向" hint="例如：认知科学\n世界史\nAI 产品设计" value={form.topics} onChange={(topics) => setForm({ ...form, topics })} />

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            当前难度
            <select value={form.difficulty} onChange={(event) => setForm({ ...form, difficulty: event.target.value as ReadingDifficulty })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="introductory">入门</option>
              <option value="intermediate">进阶</option>
              <option value="advanced">高阶</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            推荐目标
            <select value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value as ReadingGoal })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
              <option value="beginner">建立入门框架</option>
              <option value="systematic">系统学习</option>
              <option value="broaden">拓宽视角</option>
              <option value="literary">文学体验</option>
            </select>
          </label>
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            每周可投入分钟
            <input required type="number" min={15} max={10_080} value={form.weeklyMinutes} onChange={(event) => setForm({ ...form, weeklyMinutes: event.target.value })} className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 dark:border-zinc-700" />
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <ListField label="已经读过" hint="书名 — 作者" value={form.readBooks} onChange={(readBooks) => setForm({ ...form, readBooks })} />
          <ListField label="想读清单" hint="书名 — 作者" value={form.wantToReadBooks} onChange={(wantToReadBooks) => setForm({ ...form, wantToReadBooks })} />
          <ListField label="不喜欢或不想再推荐" hint="书名 — 作者（可附简短原因）" value={form.dislikedBooks} onChange={(dislikedBooks) => setForm({ ...form, dislikedBooks })} />
        </div>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
        {saved && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">阅读画像已保存，下一次书籍推荐会使用新设置。</p>}
        <button type="submit" disabled={saving} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">
          {saving ? "保存中…" : "保存阅读画像"}
        </button>
      </section>

      <aside className="h-fit space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm leading-6 text-violet-950 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
        <h2 className="font-semibold">接下来怎么用</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>先保存你的阅读方向和时间预算。</li>
          <li>在任务页新建“书籍推荐”，填写本期主题。</li>
          <li>到期后在收件箱查看带来源、门槛和试读建议的结果。</li>
        </ol>
        <a href={appHref("/tasks?section=scheduled")} className="inline-flex rounded-lg bg-violet-700 px-3 py-2 font-medium text-white hover:bg-violet-600">去创建书籍推荐</a>
      </aside>
    </form>
  );
}
