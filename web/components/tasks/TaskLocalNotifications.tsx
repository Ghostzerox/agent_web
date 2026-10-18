"use client";
import { useCallback, useState } from "react";
import type { TaskRecord } from "@/lib/api/taskClient";
import { reconcileAndCacheLocalTaskNotifications } from "@/lib/notifications/localNotificationReliability";
import { getCapacitorLocalNotificationAdapter } from "@/lib/platform/capacitorLocalNotifications";
import { friendlyError } from "./taskForm";

type NativeNotificationState =
  | { kind: "unsupported" }
  | { kind: "checking" | "syncing" }
  | { kind: "prompt" | "denied" }
  | { kind: "granted"; pending: number; warning?: string }
  | { kind: "error"; message: string };


export function useTaskNotifications(tasks: TaskRecord[]) {
  const [nativeNotifications, setNativeNotifications] = useState<NativeNotificationState>({ kind: "unsupported" });
  const syncNativeNotifications = useCallback(async (loaded: TaskRecord[], requestPermission = false) => {
    const adapter = getCapacitorLocalNotificationAdapter();
    if (!adapter) { setNativeNotifications({ kind: "unsupported" }); return; }
    try {
      setNativeNotifications({ kind: requestPermission ? "syncing" : "checking" });
      const permission = requestPermission ? await adapter.requestPermission() : await adapter.checkPermission();
      if (permission !== "granted") { setNativeNotifications({ kind: permission }); return; }
      setNativeNotifications({ kind: "syncing" });
      const result = await reconcileAndCacheLocalTaskNotifications(adapter, loaded);
      setNativeNotifications({ kind: "granted", pending: result.pending, warning: result.warning });
    } catch (error) { setNativeNotifications({ kind: "error", message: friendlyError(error) }); }
  }, []);
  const enableNativeNotifications = () => syncNativeNotifications(tasks, true);
  return { nativeNotifications, syncNativeNotifications, enableNativeNotifications };
}

export function TaskNotificationStatus({ nativeNotifications, syncNativeNotifications, enableNativeNotifications, tasks }: ReturnType<typeof useTaskNotifications> & { tasks: TaskRecord[] }) {
  return <>          {nativeNotifications.kind !== "unsupported" && (
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
</>;
}
