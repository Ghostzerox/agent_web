import { requestJson } from "./jsonRequest";
import type { AssetDesignContent, AssetField } from "@/lib/game/worlds/assetContracts";
import type { WorldBlueprint, WorldBrief } from "@/lib/game/worlds/contracts";
export type AssetDesignSummary = { id: string; name: string; kind: "item" | "character"; version: number; sourceWorldVersion: number; appliedWorldVersion: number | null };
export type AssetDesignDraft = { id: string; worldId: string; brief: string; content: AssetDesignContent; lockedFields: AssetField[];
  origins: Record<string, "user" | "ai">; sourceWorldVersion: number; sourceSnapshot: { input: WorldBrief; content: WorldBlueprint };
  version: number; appliedWorldVersion: number | null; createdAt: string; updatedAt: string };
export type AssetDesignDetail = AssetDesignDraft & { currentWorldVersion: number; issues: string[] };
const path = (id: string, action = "") => `/api/v1/game-designs/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;
export const listAssetDesigns = (worldId: string) => requestJson<AssetDesignSummary[]>(`/api/v1/game-designs?worldId=${encodeURIComponent(worldId)}`);
export const getAssetDesign = (id: string) => requestJson<AssetDesignDetail>(path(id));
export const createAssetDesign = (input: { worldId: string; expectedWorldVersion: number; kind: "item" | "character"; brief: string; targetId?: string }) => requestJson<AssetDesignDraft>("/api/v1/game-designs", { method: "POST", body: JSON.stringify(input) });
export const saveAssetDesign = (draft: AssetDesignDraft) => requestJson<AssetDesignDraft>(path(draft.id), { method: "PATCH", body: JSON.stringify({ expectedVersion: draft.version, brief: draft.brief, content: draft.content, lockedFields: draft.lockedFields }) });
export const generateAssetDesign = (draft: AssetDesignDraft, fields: AssetField[], requestId: string, signal?: AbortSignal) => requestJson<AssetDesignDraft>(path(draft.id, "generate"), {
  method: "POST", body: JSON.stringify({ expectedVersion: draft.version, fields, requestId }), signal,
});
export const confirmAssetDesign = (draft: AssetDesignDraft) => requestJson<{ appliedWorldVersion: number }>(path(draft.id, "confirm"), {
  method: "POST", body: JSON.stringify({ expectedVersion: draft.version, expectedWorldVersion: draft.sourceWorldVersion, confirmed: true }),
});
export const rebaseAssetDesign = (draft: AssetDesignDraft, worldVersion: number) => requestJson<AssetDesignDraft>(path(draft.id, "rebase"), {
  method: "POST", body: JSON.stringify({ expectedVersion: draft.version, expectedWorldVersion: worldVersion, confirmed: true }),
});
