import { requestJson } from "./jsonRequest";
import type { WorldBlueprint, WorldBrief, WorldOrigins, WorldSection } from "@/lib/game/worlds/contracts";
import type { GameSessionDetail } from "./gameSessionClient";

export type WorldDraftSummary = { id: string; name: string; brief: string; version: number };
export type WorldDraft = { id: string; input: WorldBrief; content: WorldBlueprint | null; origins: WorldOrigins;
  lockedSections: WorldSection[]; version: number; createdAt: string; updatedAt: string };
export type WorldDraftDetail = WorldDraft & { issues: string[]; revisions: { revision: number; draftVersion: number; createdAt: string }[] };
const path = (id: string, action = "") => `/api/v1/game-worlds/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;
export const listWorldDrafts = () => requestJson<WorldDraftSummary[]>("/api/v1/game-worlds");
export const getWorldDraft = (id: string) => requestJson<WorldDraftDetail>(path(id));
export const createWorldDraft = (input: WorldBrief) => requestJson<WorldDraft>("/api/v1/game-worlds", { method: "POST", body: JSON.stringify(input) });
export const saveWorldDraft = (draft: WorldDraft) => requestJson<WorldDraft>(path(draft.id), { method: "PATCH", body: JSON.stringify({
  expectedVersion: draft.version, input: draft.input, content: draft.content, lockedSections: draft.lockedSections,
}) });
export const generateWorldDraft = (id: string, expectedVersion: number, sections: WorldSection[], requestId: string, signal?: AbortSignal) =>
  requestJson<WorldDraft>(path(id, "generate"), { method: "POST", body: JSON.stringify({ expectedVersion, sections, requestId }), signal });
export const publishWorldDraft = (id: string, expectedVersion: number) => requestJson<{ revision: number; draftVersion: number }>(path(id, "publish"), {
  method: "POST", body: JSON.stringify({ expectedVersion, confirmed: true, constraintReviewConfirmed: true }),
});
export const createPublishedWorldSave = (id: string, revision: number, requestId: string) => requestJson<GameSessionDetail>(path(id, "saves"), {
  method: "POST", body: JSON.stringify({ revision, requestId }),
});
