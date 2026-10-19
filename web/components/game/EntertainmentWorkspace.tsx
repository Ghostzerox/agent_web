"use client";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { MODULE_LINKS } from "@/lib/platform/workspaceNavigation";
import { ModuleDirectory } from "@/components/ui/ModuleDirectory";
import { GameSessionManager } from "./GameSessionManager";
import { WorldCreationWorkspace } from "./WorldCreationWorkspace";
export function EntertainmentWorkspace() {
  const params = useAppQuery();
  if (params.get("view") === "creator") return <WorldCreationWorkspace key={params.get("world") ?? "creator"} />;
  return params.has("session") || params.get("view") === "worlds" ? <GameSessionManager key={params.get("session") ?? "worlds"} /> : <ModuleDirectory title="为想象力打开一扇门" description="先选择世界与存档，或进入规则包冒险。地图、装备、角色和历史只会出现在当前世界里，不放到全局导航。" links={MODULE_LINKS.entertainment.slice(1)} />;
}
