"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { TimeWheelPicker } from "@/components/tasks/TimeWheelPicker";
import {
  createTask,
  deleteTask,
  listTasks,
  TaskClientError,
  updateTask,
  type TaskKind,
  type TaskInput,
  type TaskRecord,
} from "@/lib/api/taskClient";
import { reconcileAndCacheLocalTaskNotifications } from "@/lib/notifications/localNotificationReliability";
import { getCapacitorLocalNotificationAdapter } from "@/lib/platform/capacitorLocalNotifications";
import { appHref, currentAppSearchParams } from "@/lib/platform/appNavigation";
import type { TaskSchedule } from "@/lib/tasks/schedule";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { previewTaskSchedule, taskPreviewConflicts } from "@/lib/tools/taskPreview";

type FormState = {
  title: string;
  kind: TaskKind;
  prompt: string;
  scheduleType: TaskSchedule["type"];
  onceDate: string;
  time: string;
  weekday: number;
};

const EMPTY_FORM: FormState = {
  title: "",
  kind: "reminder",
  prompt: "",
  scheduleType: "daily",
  onceDate: "",
  time: "20:00",
  weekday: 1,
};

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

type NativeNotificationState =
  | { kind: "unsupported" }
  | { kind: "checking" | "syncing" }
  | { kind: "prompt" | "denied" }
  | { kind: "granted"; pending: number; warning?: string }
  | { kind: "error"; message: string };

export function shanghaiLocalToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("请选择有效的提醒日期和时间");
  }
  const instant = new Date(`${value}:00+08:00`);
  if (Number.isNaN(instant.getTime())) throw new Error("提醒时间无效");
  return instant.toISOString();
}

export function isoToShanghaiLocal(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  const shifted = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function scheduleFromTask(task: TaskRecord): TaskSchedule {
  if (task.scheduleType === "once" && "runAt" in task.scheduleValue) {
    return { type: "once", runAt: task.scheduleValue.runAt };
  }
  if (
    task.scheduleType === "daily" &&
    "time" in task.scheduleValue &&
    !("weekday" in task.scheduleValue)
  ) {
    return { type: "daily", time: task.scheduleValue.time };
  }
  if (
    task.scheduleType === "weekly" &&
    "weekday" in task.scheduleValue &&
    "time" in task.scheduleValue
  ) {
    return {
      type: "weekly",
      weekday: task.scheduleValue.weekday,
      time: task.scheduleValue.time,
    };
  }
  throw new Error("任务的时间规则已损坏，请删除后重新创建");
}

function formFromTask(task: TaskRecord): FormState {
  const schedule = scheduleFromTask(task);
  const onceLocal =
    schedule.type === "once" ? isoToShanghaiLocal(schedule.runAt) : "";
  return {
    title: task.title,
    kind: task.kind,
    prompt: task.prompt ?? "",
    scheduleType: schedule.type,
    onceDate: onceLocal.slice(0, 10),
    time: schedule.type === "once" ? onceLocal.slice(11, 16) : schedule.time,
    weekday: schedule.type === "weekly" ? schedule.weekday : 1,
  };
}

function inputFromForm(form: FormState): TaskInput {
  let schedule: TaskSchedule;
  if (form.scheduleType === "once") {
    schedule = {
      type: "once",
      runAt: shanghaiLocalToIso(`${form.onceDate}T${form.time}`),
    };
  } else if (form.scheduleType === "daily") {
    schedule = { type: "daily", time: form.time };
  } else {
    schedule = { type: "weekly", weekday: form.weekday, time: form.time };
  }
  return {
    title: form.title.trim(),
    kind: form.kind,
    prompt: form.prompt.trim() || null,
    schedule,
  };
}

function scheduleLabel(task: TaskRecord): string {
  const schedule = scheduleFromTask(task);
  if (schedule.type === "once") return "仅一次";
  if (schedule.type === "daily") return `每天 ${schedule.time}`;
  return `每${WEEKDAYS[schedule.weekday - 1]} ${schedule.time}`;
}

function nextRunLabel(task: TaskRecord): string {
  if (!task.nextRunAt) return "已暂停";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(task.nextRunAt));
}

function friendlyError(error: unknown): string {
  if (error instanceof TaskClientError && error.code === "VERSION_CONFLICT") {
    return "任务已在其他页面发生变化，列表已刷新，请重新操作。";
  }
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试。";
}

function taskKindLabel(kind: TaskKind): string {
  if (kind === "agent_prompt") return "AI 生成";
  if (kind === "personal_briefing") return "个人简报";
  if (kind === "book_recommendation") return "书籍推荐";
  if (kind === "reflection_question") return "思考问题";
  return "普通提醒";
}

function promptFieldLabel(kind: TaskKind): string {
  if (kind === "agent_prompt") return "给 AI 的任务要求";
  if (kind === "personal_briefing") return "关注主题或简报要求";
  if (kind === "book_recommendation") return "本期主题或选书要求";
  if (kind === "reflection_question") return "本次反思主题或目标";
  return "提醒内容（可选）";
}

export function TaskManager() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [schedulePreview, setSchedulePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nativeNotifications, setNativeNotifications] =
    useState<NativeNotificationState>({ kind: "unsupported" });
  const handledTaskLink = useRef<string | null>(null);
  const editingTask = tasks.find((task) => task.id === editingId);
  useNavigationGuard(submitting || busyId !== null || JSON.stringify(form) !== JSON.stringify(editingTask ? formFromTask(editingTask) : EMPTY_FORM));

  const syncNativeNotifications = useCallback(async (loaded: TaskRecord[]) => {
    const adapter = getCapacitorLocalNotificationAdapter();
    if (!adapter) {
      setNativeNotifications({ kind: "unsupported" });
      return;
    }
    try {
      setNativeNotifications({ kind: "checking" });
      const permission = await adapter.checkPermission();
      if (permission !== "granted") {
        setNativeNotifications({ kind: permission });
        return;
      }
      setNativeNotifications({ kind: "syncing" });
      const result = await reconcileAndCacheLocalTaskNotifications(adapter, loaded);
      setNativeNotifications({
        kind: "granted",
        pending: result.pending,
        warning: result.warning,
      });
    } catch (notificationError) {
      setNativeNotifications({
        kind: "error",
        message: friendlyError(notificationError),
      });
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const loaded = await listTasks();
      setTasks(loaded);
      setError(null);
      void syncNativeNotifications(loaded);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [syncNativeNotifications]);

  useEffect(() => {
    let active = true;
    void listTasks()
      .then((loaded) => {
        if (!active) return;
        setTasks(loaded);
        setError(null);
        void syncNativeNotifications(loaded);
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
  }, [syncNativeNotifications]);

  useEffect(() => {
    const searchParams = currentAppSearchParams();
    const taskId = searchParams.get("task");
    if (!taskId || tasks.length === 0) return;
    const linkKey = `${taskId}:${searchParams.get("edit") ?? "0"}`;
    if (handledTaskLink.current === linkKey) return;
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    handledTaskLink.current = linkKey;
    const frame = window.requestAnimationFrame(() => {
      if (searchParams.get("edit") === "1" && task.status !== "completed") {
        setEditingId(task.id);
        setForm(formFromTask(task));
      }
      document
        .getElementById(`task-${taskId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [tasks]);

  const enableNativeNotifications = async () => {
    const adapter = getCapacitorLocalNotificationAdapter();
    if (!adapter) return;
    setNativeNotifications({ kind: "syncing" });
    try {
      const permission = await adapter.requestPermission();
      if (permission !== "granted") {
        setNativeNotifications({ kind: "denied" });
        return;
      }
      const result = await reconcileAndCacheLocalTaskNotifications(adapter, tasks);
      setNativeNotifications({
        kind: "granted",
        pending: result.pending,
        warning: result.warning,
      });
    } catch (notificationError) {
      setNativeNotifications({
        kind: "error",
        message: friendlyError(notificationError),
      });
    }
  };

  const resetEditor = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = inputFromForm(form);
      if (editingId) {
        const current = tasks.find((task) => task.id === editingId);
        if (!current) throw new Error("找不到要编辑的任务");
        await updateTask(editingId, {
          ...input,
          status: current.status === "paused" ? "paused" : "active",
          expectedVersion: current.version,
        });
      } else {
        await createTask(input);
      }
      resetEditor();
      await reload();
    } catch (submitError) {
      setError(friendlyError(submitError));
      if (
        submitError instanceof TaskClientError &&
        submitError.code === "VERSION_CONFLICT"
      ) {
        await reload();
        setError(friendlyError(submitError));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTask = async (task: TaskRecord) => {
    setBusyId(task.id);
    setError(null);
    try {
      await updateTask(task.id, {
        title: task.title,
        kind: task.kind,
        prompt: task.prompt,
        schedule: scheduleFromTask(task),
        status: task.status === "active" ? "paused" : "active",
        expectedVersion: task.version,
      });
      await reload();
    } catch (toggleError) {
      await reload();
      setError(friendlyError(toggleError));
    } finally {
      setBusyId(null);
    }
  };

  const removeTask = async (task: TaskRecord) => {
    if (!window.confirm(`确定删除“${task.title}”吗？`)) return;
    setBusyId(task.id);
    setError(null);
    try {
      await deleteTask(task.id);
      if (editingId === task.id) resetEditor();
      await reload();
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section className="h-fit rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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

          {nativeNotifications.kind !== "unsupported" && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
              {nativeNotifications.kind === "granted" ? (
                <>
                  <p className="font-medium">APK 本地提醒已开启</p>
                  <p className="text-blue-700 dark:text-blue-300">
                    已同步 {nativeNotifications.pending} 项活动任务；即使网页未打开，系统也会按时提醒。
                  </p>
                  {nativeNotifications.warning && (
                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                      {nativeNotifications.warning}
                    </p>
                  )}
                </>
              ) : nativeNotifications.kind === "denied" ? (
                <>
                  <p className="font-medium">通知权限已被拒绝</p>
                  <p>请在系统的应用设置中允许通知，然后返回这里重新检查。</p>
                  <button type="button" onClick={() => void enableNativeNotifications()} className="mt-2 font-medium underline underline-offset-2">重新检查</button>
                </>
              ) : nativeNotifications.kind === "error" ? (
                <>
                  <p className="font-medium">本地提醒同步失败</p>
                  <p>{nativeNotifications.message}</p>
                  <button type="button" onClick={() => void syncNativeNotifications(tasks)} className="mt-2 font-medium underline underline-offset-2">重试同步</button>
                </>
              ) : nativeNotifications.kind === "prompt" ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">开启 APK 本地提醒</p>
                    <p className="text-blue-700 dark:text-blue-300">授权后，任务到期可由手机系统直接弹窗。</p>
                  </div>
                  <button type="button" onClick={() => void enableNativeNotifications()} className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 font-medium text-white">开启</button>
                </div>
              ) : (
                <p>正在同步 APK 本地提醒…</p>
              )}
            </div>
          )}
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
      </section>

      <section aria-label="任务列表" className="min-w-0">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">My tasks</p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">我的任务</h2>
          </div>
          <span className="text-sm text-zinc-500">{tasks.length} 项</span>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        {loading ? (
          <p className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取任务…</p>
        ) : tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-zinc-950/60">
            <p className="font-medium text-zinc-800 dark:text-zinc-200">还没有任务</p>
            <p className="mt-1 text-sm text-zinc-500">在左侧创建第一项学习任务。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <article id={`task-${task.id}`} key={task.id} className="scroll-m-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold text-zinc-950 dark:text-zinc-50">{task.title}</h3>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {taskKindLabel(task.kind)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${task.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>
                        {task.status === "active" ? "运行中" : task.status === "paused" ? "已暂停" : "已完成"}
                      </span>
                    </div>
                    {task.prompt && <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{task.prompt}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                      <span>{scheduleLabel(task)}</span>
                      <span>下次：{nextRunLabel(task)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {task.status !== "completed" && (
                      <>
                        <button type="button" disabled={busyId === task.id} onClick={() => { setEditingId(task.id); setForm(formFromTask(task)); }} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900">编辑</button>
                        <button type="button" disabled={busyId === task.id} onClick={() => void toggleTask(task)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900">{task.status === "active" ? "暂停" : "恢复"}</button>
                      </>
                    )}
                    <button type="button" disabled={busyId === task.id} onClick={() => void removeTask(task)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">删除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
