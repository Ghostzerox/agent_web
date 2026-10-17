import { z } from "zod";
import type { WorldHistory } from "./contracts";

export const explorationHistoryQuerySchema = z.object({
  parentTurnId: z.uuid().nullable(), q: z.string().trim().max(120).default(""),
  locationId: z.string().max(60).optional(), actorId: z.string().max(60).optional(),
  kind: z.enum(["fact", "rumor", "legend", "opinion"]).optional(),
  origin: z.enum(["setting", "play"]).optional(),
  limit: z.number().int().min(1).max(20).default(15),
}).strict();
export type ExplorationHistoryQuery = z.input<typeof explorationHistoryQuerySchema>;
export type ExplorationHistoryResult = {
  scope: "selected-branch"; entries: (WorldHistory & { sourceTurnId: string })[];
  matched: number; omitted: number; characterBudget: number;
};

/** Accept ancestor path only, not a session's unfiltered turn list. No embeddings or model calls. */
export function searchWorldHistory(path: readonly { id: string; stateSnapshot: { exploration?: { history: WorldHistory[] } } }[],
  rawQuery: ExplorationHistoryQuery): ExplorationHistoryResult {
  const query = explorationHistoryQuerySchema.parse(rawQuery);
  const entries = new Map<string, WorldHistory & { sourceTurnId: string }>();
  for (const turn of path) for (const entry of turn.stateSnapshot.exploration?.history ?? []) {
    const key = `${entry.id}:${entry.source}`;
    if (!entries.has(key)) entries.set(key, { ...entry, sourceTurnId: turn.id });
  }
  const needle = query.q.toLocaleLowerCase();
  const matches = [...entries.values()].filter((entry) => (!query.kind || entry.kind === query.kind)
    && (!query.origin || entry.origin === query.origin)
    && (!query.locationId || entry.locationId === query.locationId)
    && (!query.actorId || entry.actorIds.includes(query.actorId))
    && (!needle || `${entry.text} ${entry.source}`.toLocaleLowerCase().includes(needle))).sort((a, b) => b.tick - a.tick);
  const selected: ExplorationHistoryResult["entries"] = []; let size = 0;
  for (const entry of matches) {
    if (selected.length >= query.limit) break;
    const length = JSON.stringify(entry).length;
    if (size + length > 6000) continue;
    selected.push(entry); size += length;
  }
  return { scope: "selected-branch", entries: selected, matched: matches.length, omitted: matches.length - selected.length, characterBudget: 6000 };
}
