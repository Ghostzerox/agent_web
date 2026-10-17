"use client";
import { useEffect, useState } from "react";
import { TaskManager } from "./TaskManager";
import { ActionBoard } from "./ActionBoard";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";
export function TaskWorkspace() {
  const [section, setSection] = useState<"actions" | "scheduled">("actions");
  useEffect(() => { const read = () => { const params=currentAppSearchParams(); if (params.get("task") || params.get("section")==="scheduled") setSection("scheduled"); }; read(); window.addEventListener("hashchange", read); return () => window.removeEventListener("hashchange", read); }, []);
  return <div className="space-y-6"><nav aria-label="任务局部导航" className="flex gap-2">{([["actions", "行动与打卡"], ["scheduled", "定时任务"]] as const).map(([id, label]) => <button key={id} className="min-h-11 rounded-xl border px-4 text-sm aria-pressed:bg-emerald-700 aria-pressed:text-white" aria-pressed={section === id} onClick={() => { if (section !== id && requestNavigationPermission()) setSection(id); }}>{label}</button>)}</nav>{section === "actions" ? <ActionBoard /> : <TaskManager />}</div>;
}
