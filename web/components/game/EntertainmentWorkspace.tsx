"use client";
import { useAppQuery } from "@/components/platform/useAppQuery";
import { MODULE_LINKS } from "@/lib/platform/workspaceNavigation";
import { ModuleDirectory } from "@/components/ui/ModuleDirectory";
import { GameSessionManager } from "./GameSessionManager";
import { WorldCreationWorkspace } from "./WorldCreationWorkspace";
import { AssetDesignWorkspace } from "./AssetDesignWorkspace";
import { DrawPoolWorkspace } from "./DrawPoolWorkspace";
import { DrawSessionWorkspace } from "./DrawSessionWorkspace";
import { EventDesignWorkspace } from "./EventDesignWorkspace";
export function EntertainmentWorkspace() {
  const params = useAppQuery();
  const section = params.get("section");
  if (params.get("view") === "creator" && params.get("world") && section === "design-events") return <EventDesignWorkspace key={`${params.get("world")}:${params.get("event") ?? "list"}`} source={{ kind: "world", worldId: params.get("world")! }} id={params.get("event")} />;
  if (params.get("view") === "events" && params.get("session") && params.get("parent")) return <EventDesignWorkspace key={`${params.get("session")}:${params.get("parent")}:${params.get("event") ?? "list"}`} source={{ kind: "session", sessionId: params.get("session")!, parentTurnId: params.get("parent")! }} id={params.get("event")} />;
  if (params.get("view") === "draws" && params.get("session") && params.get("parent"))
    return <DrawSessionWorkspace key={`${params.get("session")}:${params.get("parent")}:${params.get("draw") ?? "list"}`} sessionId={params.get("session")!} parentTurnId={params.get("parent")!} drawId={params.get("draw")} />;
  if (params.get("view") === "creator" && params.get("world") && section === "draw-pools") return <DrawPoolWorkspace key={params.get("world")} worldId={params.get("world")!} />;
  if (params.get("view") === "creator" && params.get("world") && (section === "design-items" || section === "design-characters"))
    return <AssetDesignWorkspace key={`${params.get("world")}:${section}:${params.get("design") ?? "list"}`} worldId={params.get("world")!} kind={section === "design-items" ? "item" : "character"} />;
  if (params.get("view") === "creator") return <WorldCreationWorkspace key={params.get("world") ?? "creator"} />;
  return params.has("session") || params.get("view") === "worlds" ? <GameSessionManager key={params.get("session") ?? "worlds"} /> : <ModuleDirectory title="为想象力打开一扇门" description="继续一段旅程，或亲手创作一个可以自由探索的世界。" links={MODULE_LINKS.entertainment.slice(1)} />;
}
