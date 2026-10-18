import { GameSessionRepositoryError } from "./errors";

export function gameTurnPath<T extends { id: string; parentTurnId: string | null }>(
  turns: readonly T[],
  leafId: string | null,
): T[] {
  if (!leafId) return [];
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const path: T[] = [];
  const visited = new Set<string>();
  let current: T | undefined = byId.get(leafId);
  if (!current) {
    throw new GameSessionRepositoryError(
      "GAME_TURN_NOT_FOUND",
      "Selected game branch was not found in this session.",
    );
  }
  while (current) {
    if (visited.has(current.id)) {
      throw new Error("Game turn tree contains a cycle.");
    }
    visited.add(current.id);
    path.push(current);
    current = current.parentTurnId
      ? byId.get(current.parentTurnId)
      : undefined;
  }
  return path.reverse();
}
