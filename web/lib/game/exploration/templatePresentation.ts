import type { CreateGameSessionRequest } from "../contracts";

export type ExplorationTemplatePresentation = CreateGameSessionRequest & {
  templateId: string; templateVersion: string; hostContract: "exploration.v1";
  introduction: { summary: string; setting: string; playerRole: string; playStyle: string; scope: string; features: string[] };
};
