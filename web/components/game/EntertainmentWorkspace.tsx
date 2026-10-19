"use client";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { MODULE_LINKS } from "@/lib/platform/workspaceNavigation";
import { ModuleDirectory } from "@/components/ui/ModuleDirectory";
import { GameSessionManager } from "./GameSessionManager";
import { WorldCreationWorkspace } from "./WorldCreationWorkspace";
import { AssetDesignWorkspace } from "./AssetDesignWorkspace";
import { DrawPoolWorkspace } from "./DrawPoolWorkspace";
import { DrawSessionWorkspace } from "./DrawSessionWorkspace";
export function EntertainmentWorkspace() {
  const params = useAppQuery();
  const section = params.get("section");
  if (params.get("view") === "draws" && params.get("session") && params.get("parent"))
    return <DrawSessionWorkspace key={`${params.get("session")}:${params.get("parent")}:${params.get("draw") ?? "list"}`} sessionId={params.get("session")!} parentTurnId={params.get("parent")!} drawId={params.get("draw")} />;
  if (params.get("view") === "creator" && params.get("world") && section === "draw-pools") return <DrawPoolWorkspace key={params.get("world")} worldId={params.get("world")!} />;
  if (params.get("view") === "creator" && params.get("world") && (section === "design-items" || section === "design-characters"))
    return <AssetDesignWorkspace key={`${params.get("world")}:${section}:${params.get("design") ?? "list"}`} worldId={params.get("world")!} kind={section === "design-items" ? "item" : "character"} />;
  if (params.get("view") === "creator") return <WorldCreationWorkspace key={params.get("world") ?? "creator"} />;
  return params.has("session") || params.get("view") === "worlds" ? <GameSessionManager key={params.get("session") ?? "worlds"} /> : <ModuleDirectory title="为想象力打开一扇门" description="先选择世界与存档，或进入规则包冒险。地图、装备、角色和历史只会出现在当前世界里，不放到全局导航。" links={MODULE_LINKS.entertainment.slice(1)} />;
}
