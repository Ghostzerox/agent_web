import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
const actorId = z.string().min(1).max(60);
export const SEMANTIC_LABELS = {
  dialogue: "台词", action: "行动意图", world_narration: "旁白建议",
  private_thought: "私人想法", ooc_instruction: "场外创作指令",
} as const;
export const semanticFragmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dialogue"), text, targetId: actorId, channel: z.enum(["direct", "public"]) }).strict(),
  ...(["action", "world_narration", "private_thought", "ooc_instruction"] as const)
    .map((kind) => z.object({ kind: z.literal(kind), text }).strict()),
]);
export const semanticInputSchema = z.array(semanticFragmentSchema).min(1).max(8)
  .refine((parts) => parts.reduce((size, part) => size + part.text.length, 0) <= 8000, "语义输入总计不能超过8000字。");
export type SemanticInput = z.infer<typeof semanticInputSchema>;
export type SemanticKind = SemanticInput[number]["kind"];

export const perceptionRecordSchema = z.object({
  sourceRequestId: z.uuid(), tick: z.number().int().nonnegative(), locationId: actorId,
  kind: z.enum(["dialogue", "action", "world_narration", "private_thought", "ooc_instruction", "host_result", "reply"]),
  speakerId: actorId, audience: z.array(actorId).min(1).max(50),
  evidence: z.enum(["statement", "fact", "rumor", "legend", "opinion", "inference"]),
  text,
}).strict();
export const cognitionSchema = z.object({
  sessionId: z.uuid(), worldId: actorId, worldVersion: z.string().min(1).max(60),
  records: z.array(perceptionRecordSchema).max(200),
  lastInput: semanticInputSchema.optional(),
}).strict();
export type PerceptionRecord = z.infer<typeof perceptionRecordSchema>;

export function formatSemanticInput(parts: SemanticInput): string {
  return parts.map((part) => `[${SEMANTIC_LABELS[part.kind]}${part.kind === "dialogue" ? ` / ${part.channel === "direct" ? "定向" : "公开"} → ${part.targetId}` : ""}] ${part.text}`).join("\n\n");
}
