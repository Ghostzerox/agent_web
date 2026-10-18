import { z } from "zod";
export const CONTROL_MODES = ["professional", "companion", "reflection"] as const;
export const memoryModeControlSchema = z.object({ enabled: z.boolean(), allowSensitive: z.boolean() }).strict();
export const memoryControlsSchema = z.object({ professional: memoryModeControlSchema, companion: memoryModeControlSchema, reflection: memoryModeControlSchema }).strict();
export type MemoryControls = z.infer<typeof memoryControlsSchema>;
export const DEFAULT_MEMORY_CONTROLS: MemoryControls = { professional: { enabled: true, allowSensitive: true }, companion: { enabled: true, allowSensitive: true }, reflection: { enabled: true, allowSensitive: true } };
export type MemoryControlView = { settings: MemoryControls; version: number };
export function controlFor(settings: MemoryControls, consumer: string) { return CONTROL_MODES.includes(consumer as typeof CONTROL_MODES[number]) ? settings[consumer as keyof MemoryControls] : { enabled: false, allowSensitive: false }; }

export type MemoryUsageRecord<TDate = string> = {
  id: string; conversationId: string; status: "started" | "completed" | "failed" | "cancelled"; createdAt: TDate;
  summary: import("@/lib/conversation/summary").SummaryUse | null;
  knowledge: import("@/lib/knowledge/audit").KnowledgeRetrievalAudit | null;
  memories: { id: string; rank: number; estimatedTokens: number; currentState: "present" | "expired" | "deleted-or-unavailable" }[];
};
