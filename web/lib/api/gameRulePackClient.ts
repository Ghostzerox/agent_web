import { requestJson } from "@/lib/api/jsonRequest";
import {
  gameRulePackDraftResultSchema,
  gameRulePackSetupResultSchema,
} from "@/lib/gameRulePacks/contracts";

export class GameRulePackClientError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = "GameRulePackClientError";
  }
}

async function request(id: string, init?: RequestInit): Promise<unknown> {
  return requestJson("/api/v1/game-rule-packs/"+encodeURIComponent(id), init, { error: ({ message, code, status }) => new GameRulePackClientError(message, code, status) });
}

export async function getGameRulePackSetup(id: string) {
  return gameRulePackSetupResultSchema.parse(await request(id));
}

export async function prepareGameRulePackDraft(id: string, setup: unknown, expectedVersion: number) {
  return gameRulePackDraftResultSchema.parse(await request(id, {
    method: "POST", body: JSON.stringify({ setup, expectedVersion }),
  }));
}
