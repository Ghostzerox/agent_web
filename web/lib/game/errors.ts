export class GameSessionRepositoryError extends Error {
  constructor(
    readonly code:
      | "GAME_SESSION_NOT_FOUND"
      | "GAME_CHARACTER_NOT_FOUND"
      | "GAME_TURN_NOT_FOUND"
      | "GAME_CHECKPOINT_NOT_FOUND"
      | "GAME_SESSION_VERSION_CONFLICT"
      | "GAME_CHARACTER_VERSION_CONFLICT"
      | "GAME_SESSION_INVALID_STATUS",
    message: string,
  ) {
    super(message);
    this.name = "GameSessionRepositoryError";
  }
}
