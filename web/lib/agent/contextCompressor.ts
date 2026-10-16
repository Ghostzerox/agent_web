// Deprecated legacy API. R5.4 uses conversation/summary.ts + the server Repository.
// Never return a head/tail excerpt disguised as a summary; raw history must be preserved.

import { type ChatMessage } from "@/lib/config";
import { type MemoryItem } from "./memory";

export const COMPRESSION_THRESHOLD = 20;

type CompressionResult = {
  summary: string;
  memoryItems: MemoryItem[];
};

export function compress(messages: ChatMessage[]): CompressionResult {
  void messages;
  return { summary: "", memoryItems: [] };
}
