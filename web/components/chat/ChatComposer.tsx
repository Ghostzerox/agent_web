import type { KeyboardEvent } from "react";
import type { SearchMode } from "@/lib/search/webSearch";

type ChatComposerProps = {
  value: string;
  loading: boolean;
  searchMode: SearchMode;
  onChange: (value: string) => void;
  onSearchModeChange: (mode: SearchMode) => void;
  onSend: () => void;
  onStop: () => void;
};

export function ChatComposer({
  value,
  loading,
  searchMode,
  onChange,
  onSearchModeChange,
  onSend,
  onStop,
}: ChatComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !loading) {
      event.preventDefault();
      onSend();
    }
  };

  return (
    <footer className="shrink-0 border-t border-[var(--workspace-border)] bg-[var(--workspace-surface)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-6 sm:pt-3">
      <div className="mx-auto mb-2 flex max-w-2xl items-center gap-1" aria-label="联网搜索模式"><span className="mr-2 text-xs text-[var(--workspace-muted)]">搜索</span>
        {([
          ["auto", "自动"],
          ["on", "联网"],
          ["off", "关闭"],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={loading}
            aria-pressed={searchMode === mode}
            onClick={() => onSearchModeChange(mode)}
            className={`rounded-full px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
              searchMode === mode
                ? "bg-emerald-700 text-white dark:bg-emerald-600"
                : "bg-zinc-100 text-zinc-500 hover:text-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mx-auto flex max-w-2xl gap-2 sm:gap-3">
        <textarea
          rows={2}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="请输入你的问题"
          disabled={loading}
          aria-label="消息输入"
          className="max-h-40 min-w-0 flex-1 resize-y rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-bg)] px-3 py-3 text-base leading-6 text-[var(--workspace-ink)] placeholder-zinc-400 disabled:opacity-50 sm:px-4"
        />
        {loading ? (
          <button
            type="button"
            onClick={onStop}
            className="shrink-0 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:px-5 dark:bg-red-700 dark:hover:bg-red-600"
          >
            停止生成
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!value.trim()}
            className="ui-button ui-button-primary self-end shrink-0"
          >
            发送
          </button>
        )}
      </div>
      <p className="mx-auto mt-2 hidden max-w-2xl text-center text-[10px] text-zinc-400 sm:block">Enter 发送 · Shift + Enter 换行 · AI 的关键结论请核验</p>
    </footer>
  );
}
