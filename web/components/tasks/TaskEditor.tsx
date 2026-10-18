"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import type { TaskKind, TaskRecord } from "@/lib/api/taskClient";
import type { TaskSchedule } from "@/lib/tasks/schedule";
import { appHref } from "@/lib/platform/appNavigation";
import { previewTaskSchedule, taskPreviewConflicts } from "@/lib/tools/taskPreview";
import { TimeWheelPicker } from "./TimeWheelPicker";
import { inputFromForm, scheduleFromTask, isoToShanghaiLocal, promptFieldLabel, friendlyError, WEEKDAYS, type FormState } from "./taskForm";

type Props = {
  form: FormState; setForm: (form: FormState) => void; tasks: TaskRecord[];
  editingId: string | null; submitting: boolean;
  submit: (event: FormEvent) => Promise<void>; resetEditor: () => void; children: ReactNode;
};
export function TaskEditor({ form, setForm, tasks, editingId, submitting, submit, resetEditor, children }: Props) {
  const [schedulePreview, setSchedulePreview] = useState<string | null>(null);
  return (      <section className="h-fit rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {editingId ? "编辑提醒" : "新建提醒"}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            {editingId ? "修改任务" : "安排一件事"}
          </h2>
        </div>

        <form className="space-y-4" onSubmit={(event) => { setSchedulePreview(null); void submit(event); }} onChange={() => setSchedulePreview(null)}>
          <button type="button" className="min-h-11 rounded-xl border px-4 text-sm" onClick={() => { try { const candidate = inputFromForm(form); const now = new Date(); const times = previewTaskSchedule(candidate.schedule, now); const conflicts = taskPreviewConflicts(candidate, tasks.filter((item) => item.id !== editingId && item.status === "active").map((item) => ({ title: item.title, schedule: scheduleFromTask(item) })), now); setSchedulePreview(`上海时间：${times.map((instant) => new Date(instant).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })).join("；")}。${conflicts.length ? `发现 ${conflicts.length} 个同刻任务，请检查是否重复。` : "未发现预览窗口内的同刻任务。"} 尚未保存。`); } catch (caught) { setSchedulePreview(friendlyError(caught)); } }}>预览未来运行与冲突</button>
          {schedulePreview && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900 dark:bg-blue-950 dark:text-blue-100">{schedulePreview}</p>}
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            任务类型
            <select
              value={form.kind}
              onChange={(event) =>
                setForm({ ...form, kind: event.target.value as TaskKind })
              }
              className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="reminder">普通提醒</option>
              <option value="agent_prompt">AI 定时任务</option>
              <option value="personal_briefing">个人简报</option>
              <option value="book_recommendation">书籍推荐</option>
              <option value="reflection_question">思考问题</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            标题
            <input
              required
              maxLength={200}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300"
              placeholder="例如：复习今天的单词"
            />
          </label>

          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {promptFieldLabel(form.kind)}
            <textarea
              required={form.kind !== "reminder"}
              rows={3}
              maxLength={10_000}
              value={form.prompt}
              onChange={(event) => setForm({ ...form, prompt: event.target.value })}
              className="mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300"
              placeholder={
                form.kind === "agent_prompt"
                  ? "例如：总结今天值得复习的三个知识点"
                  : form.kind === "personal_briefing"
                    ? "例如：国际人工智能政策、教育技术与值得阅读的研究"
                    : form.kind === "book_recommendation"
                      ? "例如：帮助我系统理解认知偏差，并兼顾一本文学作品"
                      : form.kind === "reflection_question"
                        ? "例如：复盘我本周在英语学习中反复拖延的真正原因与最小改进动作"
                    : "提醒时希望看到的具体内容"
              }
            />
          </label>

          {form.kind === "personal_briefing" && (
            <p className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
              到期后由服务端搜索并生成带日期、来源、关注理由和一个思考问题的简报。结果进入收件箱，需要电脑服务端、搜索服务和模型配置保持可用。
            </p>
          )}

          {form.kind === "book_recommendation" && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              到期后会结合你的阅读画像和网页书目信息，生成 2–3 本带推荐目的、阅读门槛、时间投入与试读方法的书籍建议。请先在阅读画像页填写偏好。
            </p>
          )}

          {form.kind === "reflection_question" && (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
              到期后会先生成 3–5 个候选，再按相关性、新颖性、可行动性和情绪负担筛选 1–3 个问题。可在
              <a href={appHref("/reflection")} className="mx-1 underline">思考问题设置</a>
              中调整目标、风格、数量或彻底关闭。
            </p>
          )}

          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            重复方式
            <select
              value={form.scheduleType}
              onChange={(event) =>
                setForm({
                  ...form,
                  scheduleType: event.target.value as TaskSchedule["type"],
                  onceDate:
                    event.target.value === "once" && !form.onceDate
                      ? isoToShanghaiLocal(
                          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                        ).slice(0, 10)
                      : form.onceDate,
                })
              }
              className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="once">仅一次</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
            </select>
          </label>

          {form.scheduleType === "once" ? (
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              提醒日期
              <input
                required
                type="date"
                value={form.onceDate}
                onChange={(event) =>
                  setForm({ ...form, onceDate: event.target.value })
                }
                className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 dark:border-zinc-700"
              />
            </label>
          ) : form.scheduleType === "weekly" ? (
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              星期
              <select
                value={form.weekday}
                onChange={(event) =>
                  setForm({ ...form, weekday: Number(event.target.value) })
                }
                className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {WEEKDAYS.map((weekday, index) => (
                  <option key={weekday} value={index + 1}>
                    {weekday}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <TimeWheelPicker
            value={form.time}
            onChange={(time) => setForm({ ...form, time })}
          />

          <p className="text-xs text-zinc-500">所有时间均按 Asia/Shanghai（北京时间）计算。</p>

          {children}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
            >
              {submitting ? "保存中…" : editingId ? "保存修改" : "创建任务"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetEditor}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm dark:border-zinc-700"
              >
                取消
              </button>
            )}
          </div>
        </form>
      </section>);
}
