"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useConfirmAction } from "@/components/ui/Actions";
import { TaskEditor } from "./TaskEditor";
import { TaskNotificationStatus, useTaskNotifications } from "./TaskLocalNotifications";
import { EMPTY_FORM, formFromTask, inputFromForm, scheduleFromTask, friendlyError, taskKindLabel, scheduleLabel, nextRunLabel, type FormState } from "./taskForm";
import {
  createTask,
  deleteTask,
  listTasks,
  TaskClientError,
  updateTask,
  type TaskRecord,
} from "@/lib/api/taskClient";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

export function TaskManager() {
  const { confirm, confirmation } = useConfirmAction();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notificationControl = useTaskNotifications(tasks);
  const { syncNativeNotifications } = notificationControl;
  const handledTaskLink = useRef<string | null>(null);
  const editingTask = tasks.find((task) => task.id === editingId);
  useNavigationGuard(submitting || busyId !== null || JSON.stringify(form) !== JSON.stringify(editingTask ? formFromTask(editingTask) : EMPTY_FORM));

  const installTasks = useCallback((loaded: TaskRecord[]) => {
    setTasks(loaded);
    setError(null);
    void syncNativeNotifications(loaded);
  }, [syncNativeNotifications]);

  const reload = async () => {
    try { installTasks(await listTasks()); }
    catch (error) { setError(friendlyError(error)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    void listTasks()
      .then((loaded) => { if (active) installTasks(loaded); })
      .catch((error: unknown) => { if (active) setError(friendlyError(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [installTasks]);

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
    if (!await confirm({ title: "删除定时任务？", description: `将删除「${task.title}」，不再安排后续提醒；原投递与行动记录不因此标为完成。`, confirmLabel: "删除任务", danger: true })) return;
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
    <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">{confirmation}
      <TaskEditor form={form} setForm={setForm} tasks={tasks} editingId={editingId} submitting={submitting} submit={submit} resetEditor={resetEditor}>
        <TaskNotificationStatus {...notificationControl} tasks={tasks} />
      </TaskEditor>

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
