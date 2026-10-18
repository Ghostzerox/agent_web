import type { Session } from "@/lib/conversation/session";

type SessionSidebarProps = {
  sessions: Session[];
  activeSessionId: string | null;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  mobile?: boolean;
  onClose?: () => void;
};

function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 86_400_000) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  onCreate,
  onSelect,
  onDelete,
  mobile = false,
  onClose,
}: SessionSidebarProps) {
  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 ${
        mobile ? "w-full" : "w-64"
      }`}
    >
      {mobile && (
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            对话列表
          </h2>
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="inline-flex size-9 items-center justify-center rounded-lg text-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label="关闭对话列表"
          >
            ×
          </button>
        </div>
      )}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onCreate}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + 新建对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {sessions.length === 0 ? (
          <p className="mt-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
            暂无对话，点击上方按钮开始
          </p>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => {
              const active = session.id === activeSessionId;
              return (
                <div key={session.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(session.id)}
                    className={`flex-1 rounded-lg px-3 py-2 text-left transition-colors ${
                      active
                        ? "bg-zinc-200 dark:bg-zinc-800"
                        : "hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <p
                      className={`truncate text-sm ${
                        active
                          ? "font-medium text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {session.title}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {formatSessionTime(session.updatedAt)}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(session.id);
                    }}
                    aria-label={`删除对话：${session.title}`}
                    className={`min-w-11 shrink-0 rounded-lg px-1.5 py-1 text-xs text-zinc-400 transition-opacity hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-400 ${
                      mobile ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    }`}
                    title="删除对话"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <p className="border-t border-zinc-200 p-4 text-xs leading-6 text-zinc-500 dark:border-zinc-800">历史保留分支；重新生成不会覆盖旧回答。</p>
    </aside>
  );
}
