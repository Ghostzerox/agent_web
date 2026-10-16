import type { ChatMessage } from "@/lib/config";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { ResponseVerificationPanel } from "@/components/chat/ResponseVerificationPanel";
import { MessageSpeechControl } from "@/components/chat/MessageSpeechControl";
import { isKnowledgeCitation, isSafeCitation } from "@/lib/knowledge/citations";
import { appHref } from "@/lib/platform/appNavigation";
import { requestNavigationPermission } from "@/lib/platform/navigationGuard";

type MessageListProps = {
  hasActiveSession: boolean;
  messages: ChatMessage[];
  allMessages: ChatMessage[];
  loading: boolean;
  onRetry: (messageId: string) => void;
  onSwitchVersion: (
    messageId: string,
    direction: "prev" | "next",
  ) => void;
};

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MessageList({
  hasActiveSession,
  messages,
  allMessages,
  loading,
  onRetry,
  onSwitchVersion,
}: MessageListProps) {
  if (!hasActiveSession) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
          开始你的第一段对话
        </h2>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          打开对话列表并点击「新建对话」开始
        </p>
      </div>
    );
  }

  if (messages.length === 0 && !loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <h2 className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
          开始你的第一段对话
        </h2>
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          输入问题，AI 将为你提供帮助
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-7">
      {messages.map((message, index) => {
        const versions =
          message.role === "assistant" && message.id
            ? allMessages.filter(
                (candidate) =>
                  candidate.role === "assistant" &&
                  (candidate.parentId ?? null) ===
                    (message.parentId ?? null),
              )
            : [];
        const activeVersion = versions.findIndex(
          (candidate) => candidate.id === message.id,
        );
        const hasVersions = versions.length > 1 && activeVersion !== -1;

        return (
          <div
            key={message.id ?? index}
            className={`flex flex-col ${
              message.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`min-w-0 rounded-2xl px-4 py-4 text-sm leading-7 whitespace-pre-wrap ${
                message.role === "user"
                  ? "max-w-[88%] bg-[var(--workspace-active)] text-[var(--workspace-ink)] sm:max-w-[80%]"
                  : "w-full border border-[var(--workspace-border)] bg-[var(--workspace-surface)] text-[var(--workspace-ink)]"
              }`}
            >
              <MarkdownMessage content={message.content} />
              {message.role === "assistant" &&
                message.citations &&
                message.citations.some(isSafeCitation) && (
                  <details className="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <summary className="mb-2 cursor-pointer text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      参考来源（{message.citations.filter(isSafeCitation).length}）
                    </summary>
                    <div className="grid gap-2">
                      {message.citations
                        .filter(isSafeCitation)
                        .map((citation, citationIndex) => (
                        <a
                          key={`${citation.url}-${citationIndex}`}
                          href={isKnowledgeCitation(citation) ? appHref(citation.url) : citation.url}
                          target={isKnowledgeCitation(citation) ? undefined : "_blank"}
                          onClick={(event) => { if (isKnowledgeCitation(citation) && !requestNavigationPermission()) event.preventDefault(); }}
                          rel="noopener noreferrer"
                          className="rounded-lg border border-zinc-200 px-3 py-2 transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:border-zinc-800 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
                        >
                          <span className="block text-xs font-medium text-blue-700 dark:text-blue-400">
                            {citation.id ? `[${citation.id}] ` : ""}
                            {citation.title}
                          </span>
                          {citation.source && (
                            <span className="mt-1 block truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                              {citation.source}
                            </span>
                          )}
                        </a>
                        ))}
                    </div>
                  </details>
                )}
              {message.role === "assistant" && message.verification && (
                <ResponseVerificationPanel
                  verification={message.verification}
                />
              )}
            </div>

            <div
              className={`mt-1 flex flex-wrap items-center gap-2 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.createdAt && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  {formatMessageTime(message.createdAt)}
                </span>
              )}

              {hasVersions && (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <button
                    type="button"
                    onClick={() => onSwitchVersion(message.id!, "prev")}
                    disabled={activeVersion === 0}
                    aria-label="上一个回答版本"
                    className="hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-300"
                  >
                    ◀
                  </button>
                  <span>
                    {activeVersion + 1}/{versions.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSwitchVersion(message.id!, "next")}
                    disabled={activeVersion === versions.length - 1}
                    aria-label="下一个回答版本"
                    className="hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-300"
                  >
                    ▶
                  </button>
                </span>
              )}

              {message.role === "assistant" && message.id && !loading && (
                <>
                  <MessageSpeechControl
                    messageId={message.id}
                    content={message.content}
                  />
                  <button
                    type="button"
                    onClick={() => onRetry(message.id!)}
                    className="text-xs text-zinc-400 transition-colors hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                  >
                    重新生成
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {loading && (
        <div className="flex justify-start">
          <div role="status" className="rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-4 py-3 text-sm text-[var(--workspace-muted)]">
            AI 思考中...
          </div>
        </div>
      )}
    </div>
  );
}
