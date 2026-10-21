import type { ModelBusiness } from "@/lib/ai/modelUsage";
import type { ModelProviderConfig } from "./modelConfig";

export const DEFAULT_OUTPUT_BUDGETS: Record<ModelBusiness, number> = {
  chat: 8192, "agent-task": 8192, news: 3072, books: 6144, reflection: 2048,
  memorization: 1536, "problem-solving": 8192, "review-card": 2048, game: 6144, "context-summary": 2048,
};
export type GenerationBudget = { maxOutputTokens: number | null; tokenParameter: "max_tokens" | "max_completion_tokens" | null; inputCharacterLimit: number };
export const WORLD_OUTPUT_BUDGETS = { "world-authoring": 16384, "world-section": 8192 } as const;
export type WorldGenerationOutputProfile = keyof typeof WORLD_OUTPUT_BUDGETS;

export function inputTextCharacters(messages: readonly { content: string | readonly ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] }[]): number {
  return messages.reduce((total, message) => total + (typeof message.content === "string" ? message.content.length : message.content.reduce((size, part) => size + (part.type === "text" ? part.text.length : 0), 0)), 0);
}

export function resolveGenerationBudget(
  config: Pick<ModelProviderConfig, "baseUrl">,
  business: ModelBusiness,
  latestText = "",
  env: Record<string, string | undefined> = process.env,
  outputProfile?: WorldGenerationOutputProfile,
): GenerationBudget {
  const input = Number(env.AI_MAX_INPUT_CHARACTERS ?? "160000");
  const inputCharacterLimit = Number.isSafeInteger(input) && input >= 1000 && input <= 2_000_000 ? input : 160000;
  const configured = env.AI_OUTPUT_TOKEN_PARAMETER ?? "auto";
  const tokenParameter = configured === "max_tokens" || configured === "max_completion_tokens" ? configured : configured === "auto" && new URL(config.baseUrl).hostname === "api.deepseek.com" ? "max_tokens" : null;
  let maxOutputTokens = DEFAULT_OUTPUT_BUDGETS[business];
  const profile = business === "game" ? outputProfile : undefined;
  if (profile) maxOutputTokens = WORLD_OUTPUT_BUDGETS[profile];
  if ((business === "chat" || business === "agent-task") && /(?:详细|详尽|完整讲解|逐步推导|深入分析|in detail|comprehensive)/iu.test(latestText)) maxOutputTokens = 16384;
  try {
    const overrides: unknown = JSON.parse(env.AI_OUTPUT_TOKEN_BUDGETS_JSON ?? "{}");
    if (overrides && typeof overrides === "object") {
      // Explicit profile settings win; the existing game override remains a catch-all ceiling.
      for (const key of [business, ...(profile ? [profile] : [])]) {
        const value = (overrides as Record<string, unknown>)[key];
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 256 && value <= 131072) maxOutputTokens = value;
      }
    }
  } catch { /* Invalid optional configuration uses conservative defaults. */ }
  return { maxOutputTokens: tokenParameter ? maxOutputTokens : null, tokenParameter, inputCharacterLimit };
}

export function latestRequestText(messages: readonly { role: string; content: string | readonly ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] }[]): string {
  const user = [...messages].reverse().find((message) => message.role === "user");
  if (!user) return "";
  return typeof user.content === "string" ? user.content : user.content.filter((part) => part.type === "text").map((part) => (part as { text: string }).text).join("\n");
}
