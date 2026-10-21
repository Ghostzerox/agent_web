import type { ModelBusiness } from "@/lib/ai/modelUsage";
import type { ModelProviderConfig } from "./modelConfig";

export type GenerationBudget = { maxOutputTokens: number | null; tokenParameter: "max_tokens" | "max_completion_tokens" | null; inputCharacterLimit: number };
export type WorldGenerationOutputProfile = "world-authoring" | "world-section";

export function inputTextCharacters(messages: readonly { content: string | readonly ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] }[]): number {
  return messages.reduce((total, message) => total + (typeof message.content === "string" ? message.content.length : message.content.reduce((size, part) => size + (part.type === "text" ? part.text.length : 0), 0)), 0);
}

export function resolveGenerationBudget(
  config: Pick<ModelProviderConfig, "baseUrl">,
  business: ModelBusiness,
  env: Record<string, string | undefined> = process.env,
  outputProfile?: WorldGenerationOutputProfile,
): GenerationBudget {
  const input = Number(env.AI_MAX_INPUT_CHARACTERS ?? "160000");
  const inputCharacterLimit = Number.isSafeInteger(input) && input >= 1000 && input <= 2_000_000 ? input : 160000;
  const configured = env.AI_OUTPUT_TOKEN_PARAMETER ?? "auto";
  const tokenParameter = configured === "max_tokens" || configured === "max_completion_tokens" ? configured : configured === "auto" && new URL(config.baseUrl).hostname === "api.deepseek.com" ? "max_tokens" : null;
  // No application output quota by default. Efficiency must not truncate useful answers.
  let maxOutputTokens: number | null = null;
  const profile = business === "game" ? outputProfile : undefined;
  try {
    const overrides: unknown = JSON.parse(env.AI_OUTPUT_TOKEN_BUDGETS_JSON ?? "{}");
    if (overrides && typeof overrides === "object") {
      // Only an explicit operator override opts into a quota; profile settings take precedence.
      for (const key of [business, ...(profile ? [profile] : [])]) {
        const value = (overrides as Record<string, unknown>)[key];
        if (typeof value === "number" && Number.isSafeInteger(value) && value >= 256 && value <= 131072) maxOutputTokens = value;
      }
    }
  } catch { /* Invalid optional configuration does not impose a quota. */ }
  return { maxOutputTokens: tokenParameter ? maxOutputTokens : null, tokenParameter: maxOutputTokens === null ? null : tokenParameter, inputCharacterLimit };
}
