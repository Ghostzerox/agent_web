import type { TaskRecord } from "@/lib/api/taskClient";
import type {
  LocalNotificationAdapter,
  LocalNotificationSyncResult,
  LocalReminderSnapshot,
} from "@/lib/platform/capabilities";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTime(value: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error("任务时间不是有效的 HH:mm 格式");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function localReminderFromTask(
  task: TaskRecord,
): LocalReminderSnapshot | null {
  if (task.kind !== "reminder" || task.status !== "active" || !task.nextRunAt) {
    return null;
  }
  if (task.localActionReminder?.nextRunAt === null) return null;
  const scheduledAt = new Date(task.localActionReminder?.nextRunAt ?? task.nextRunAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error(`任务 ${task.id} 的下次执行时间无效`);
  }

  let recurrence: LocalReminderSnapshot["recurrence"];
  if (
    task.scheduleType === "daily" &&
    "time" in task.scheduleValue &&
    !("weekday" in task.scheduleValue)
  ) {
    recurrence = { type: "daily", ...parseTime(task.scheduleValue.time) };
  } else if (
    task.scheduleType === "weekly" &&
    "time" in task.scheduleValue &&
    "weekday" in task.scheduleValue
  ) {
    if (
      !Number.isInteger(task.scheduleValue.weekday) ||
      task.scheduleValue.weekday < 1 ||
      task.scheduleValue.weekday > 7
    ) {
      throw new Error(`任务 ${task.id} 的星期设置无效`);
    }
    recurrence = {
      type: "weekly",
      weekday: task.scheduleValue.weekday,
      ...parseTime(task.scheduleValue.time),
    };
  }

  return {
    taskId: task.id,
    occurrenceId: `${task.id}:${task.version}:${task.nextRunAt}${task.localActionReminder ? `:action:${task.localActionReminder.version}:${task.localActionReminder.nextRunAt}` : ""}`,
    title: "学习提醒",
    body: task.title,
    scheduledAt: scheduledAt.toISOString(),
    deepLink: `/tasks?task=${encodeURIComponent(task.id)}`,
    recurrence: task.localActionReminder ? undefined : recurrence,
  };
}

export function localRemindersFromTasks(
  tasks: readonly TaskRecord[],
): LocalReminderSnapshot[] {
  return tasks.flatMap((task) => {
    const reminder = localReminderFromTask(task);
    return reminder ? [reminder] : [];
  });
}

export async function reconcileLocalTaskNotifications(
  adapter: LocalNotificationAdapter,
  tasks: readonly TaskRecord[],
): Promise<LocalNotificationSyncResult> {
  return adapter.reconcile(localRemindersFromTasks(tasks));
}
