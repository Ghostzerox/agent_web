import type { ChatMessage } from "@/lib/ai/messages";
import type { CoreModeId } from "@/lib/agent/modeRegistry";

export type { ChatMessage } from "@/lib/ai/messages";

export const CONVERSATION_SCHEMA_VERSION = 2 as const;

/** 当前服务端会话的客户端投影；不包含浏览器历史格式或持久化逻辑。 */
export type Session = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  schemaVersion: typeof CONVERSATION_SCHEMA_VERSION;
  activeLeafId: string | null;
  mode?: CoreModeId;
};
