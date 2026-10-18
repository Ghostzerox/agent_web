import { TaskClientError, type TaskRecord, type TaskInput, type TaskKind } from "@/lib/api/taskClient";
import type { TaskSchedule } from "@/lib/tasks/schedule";

export type FormState = {
  title: string;
  kind: TaskKind;
  prompt: string;
  scheduleType: TaskSchedule["type"];
  onceDate: string;
  time: string;
  weekday: number;
};

export const EMPTY_FORM: FormState = {
  title: "",
  kind: "reminder",
  prompt: "",
  scheduleType: "daily",
  onceDate: "",
  time: "20:00",
  weekday: 1,
};

export const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

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

export function formFromTask(task: TaskRecord): FormState {
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

export function inputFromForm(form: FormState): TaskInput {
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

export function scheduleLabel(task: TaskRecord): string {
  const schedule = scheduleFromTask(task);
  if (schedule.type === "once") return "仅一次";
  if (schedule.type === "daily") return `每天 ${schedule.time}`;
  return `每${WEEKDAYS[schedule.weekday - 1]} ${schedule.time}`;
}

export function nextRunLabel(task: TaskRecord): string {
  if (!task.nextRunAt) return "已暂停";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(task.nextRunAt));
}

export function friendlyError(error: unknown): string {
  if (error instanceof TaskClientError && error.code === "VERSION_CONFLICT") {
    return "任务已在其他页面发生变化，列表已刷新，请重新操作。";
  }
  if (error instanceof Error) return error.message;
  return "操作失败，请稍后重试。";
}

export function taskKindLabel(kind: TaskKind): string {
  if (kind === "agent_prompt") return "AI 生成";
  if (kind === "personal_briefing") return "个人简报";
  if (kind === "book_recommendation") return "书籍推荐";
  if (kind === "reflection_question") return "思考问题";
  return "普通提醒";
}

export function promptFieldLabel(kind: TaskKind): string {
  if (kind === "agent_prompt") return "给 AI 的任务要求";
  if (kind === "personal_briefing") return "关注主题或简报要求";
  if (kind === "book_recommendation") return "本期主题或选书要求";
  if (kind === "reflection_question") return "本次反思主题或目标";
  return "提醒内容（可选）";
}
