import type { LocalNotificationAdapter } from "@/lib/platform/capabilities";
import type { TaskRecord } from "@/lib/api/taskClient";
import { createLocalReminderCache, reconcileAndCacheLocalTaskNotifications, type LocalReminderCache } from "./localNotificationReliability";
// Cancel affected cached reminders before network refresh; do not restore stale
// schedules after a successful action write merely because the network fails.
export async function syncActionNotifications(adapter:LocalNotificationAdapter, taskIds:string[], load:()=>Promise<TaskRecord[]>, cache:LocalReminderCache=createLocalReminderCache()) {
  if(await adapter.checkPermission() !== "granted") return;
  const previous=await cache.read();
  if(previous && taskIds.length) {
    const reminders=previous.reminders.filter((r)=>!taskIds.includes(r.taskId));
    await cache.write(reminders);
    await adapter.reconcile(reminders);
  }
  return reconcileAndCacheLocalTaskNotifications(adapter,await load(),cache);
}
