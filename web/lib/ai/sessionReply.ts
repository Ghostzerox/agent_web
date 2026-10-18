import { buildAgentPrompt } from "@/lib/agent/promptBuilder";
import type { Session } from "@/lib/conversation/session";
import type { SearchMode } from "@/lib/search/webSearch";
import type { PromptEnvelope, PromptTrigger } from "./promptEnvelope";
import type { MessageCitation, ResponseVerification } from "./messages";
import { sendChatMessage } from "./chatService";

/** Shared send/retry generation protocol; persistence remains with the caller. */
export async function streamSessionReply(options: {
  session: Session; trigger: PromptTrigger; signal: AbortSignal;
  searchMode: SearchMode; knowledgeCollectionIds: string[]; useSummary: boolean;
  onDelta: (text: string, provisionalId: string) => void;
  onEnvelope: (envelope: PromptEnvelope) => void;
}): Promise<{ reply: string; citations: MessageCitation[]; verification: ResponseVerification | null }> {
  options.signal.throwIfAborted();
  const provisionalId = crypto.randomUUID();
  let citations: MessageCitation[] = [];
  let verification: ResponseVerification | null = null;
  const { session } = options;
  const reply = await sendChatMessage(
    buildAgentPrompt({ session, memory: [] }),
    { trigger: options.trigger, conversation: { id: session.id, title: session.title, activeLeafId: session.activeLeafId },
      searchMode: options.searchMode, knowledgeCollectionIds: options.knowledgeCollectionIds, useSummary: options.useSummary },
    options.signal,
    (_delta, text) => options.onDelta(text, provisionalId),
    options.onEnvelope,
    (value) => { citations = value; },
    (value) => { verification = value; },
  );
  options.signal.throwIfAborted();
  return { reply, citations, verification };
}
