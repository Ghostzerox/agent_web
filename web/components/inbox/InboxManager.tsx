"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteInboxItem,
  listInboxItems,
  updateBriefingFeedback,
  updateInboxStatus,
  type BriefingFeedback,
  type InboxFilter,
  type InboxItem,
} from "@/lib/api/inboxClient";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { useConfirmAction } from "@/components/ui/Actions";
import { AppLink } from "@/components/platform/AppLink";
import { appHref } from "@/lib/platform/appNavigation";
import { useAppQuery } from "@/components/platform/useAppQuery";

const FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "unread", label: "未读" },
  { value: "read", label: "已读" },
];

const BRIEFING_FEEDBACK: Array<{
  value: BriefingFeedback;
  label: string;
}> = [
  { value: "helpful", label: "有帮助" },
  { value: "not_relevant", label: "不相关" },
  { value: "duplicate", label: "内容重复" },
];

export function inboxTimeLabel(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function inboxSourceLabel(source: InboxItem["source"]): string {
  if (source === "agent_prompt") return "AI 定时任务";
  if (source === "personal_briefing") return "个人简报";
  if (source === "book_recommendation") return "书籍推荐";
  if (source === "reflection_question") return "思考问题";
  if (source === "proactive_checkin") return "主动问候";
  return "普通提醒";
}

export function InboxManager({ contentOnly = false }: { contentOnly?: boolean } = {}) {
  const { confirm, confirmation } = useConfirmAction();
  const params = useAppQuery();
  const source = params.get("source"); const highlight = params.get("highlight");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (nextFilter: InboxFilter) => {
    try {
      setItems(await listInboxItems(nextFilter));
      setError(null);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listInboxItems(filter)
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const interval = window.setInterval(() => void reload(filter), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [filter, reload]);

  const changeStatus = async (item: InboxItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateInboxStatus(item.id, item.status === "read" ? "unread" : "read");
      await reload(filter);
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: InboxItem) => {
    if (!await confirm({ title: "删除这条消息？", description: `将删除「${item.title}」，不会删除原任务或撤销行动；此操作不可撤销。`, confirmLabel: "删除消息", danger: true })) return;
    setBusyId(item.id);
    setError(null);
    try {
      await deleteInboxItem(item.id);
      await reload(filter);
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusyId(null);
    }
  };

  const changeFeedback = async (
    item: InboxItem,
    feedback: BriefingFeedback,
  ) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateBriefingFeedback(
        item.id,
        item.feedback === feedback ? null : feedback,
      );
      await reload(filter);
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems = items.filter((item) => (!source || item.source === source) && (!contentOnly || ["personal_briefing", "book_recommendation", "reflection_question"].includes(item.source)));
  const unreadCount = visibleItems.filter((item) => item.status === "unread").length;
  useEffect(() => {
    if (!loading && highlight) document.getElementById(`inbox-${highlight}`)?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [loading, highlight, items]);

  return (
    <section className="mx-auto w-full max-w-4xl" aria-label="提醒收件箱">{confirmation}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ui-kicker">{contentOnly ? "内容 / 最新投递" : "收件箱"}</p>
          <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            {contentOnly ? "最近值得读的" : "提醒消息"}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {filter === "all" ? `${unreadCount} 条未读` : `${visibleItems.length} 条记录`}
          </p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto" role="group" aria-label="筛选提醒">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => {
                if (option.value !== filter) setLoading(true);
                setFilter(option.value);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors ${
                filter === option.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950"
                  : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void reload(filter)}
            className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
          >
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}
      {!contentOnly && <nav className="ui-tabs mb-4" aria-label="消息来源">{[["", "全部来源"], ["reminder", "普通提醒"], ["personal_briefing", "新闻简报"], ["book_recommendation", "书籍"], ["reflection_question", "思考问题"]].map(([value, label]) => <AppLink key={value} href={value ? `/inbox?source=${value}` : "/inbox"} aria-current={(source ?? "") === value ? "page" : undefined}>{label}</AppLink>)}</nav>}
      {source && <p className="mb-4 text-sm text-zinc-500">来源筛选：{inboxSourceLabel(source as InboxItem["source"])}（当前已加载结果）。<a href={appHref("/inbox")} className="ml-2 underline">查看全部来源</a></p>}
      {!loading && highlight && !visibleItems.some((item) => item.id === highlight) && <p role="status" className="mb-4 rounded-xl border border-amber-300 p-3 text-sm">指定投递不在当前可访问列表或筛选中，可能已删除；没有自动标为已读。可清除筛选后重试。</p>}

      {loading ? (
        <p className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          正在读取提醒…
        </p>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-10 text-center dark:border-zinc-700 dark:bg-zinc-950/60">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">{contentOnly ? "还没有已投递的内容" : "这里暂时没有提醒"}</p>
          <p className="mt-1 text-sm text-zinc-500">{contentOnly ? "可以先设置新闻、书籍或思考问题订阅；浏览这里不会自动调用AI。" : "任务到达设定时间后，会自动出现在这里。"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <article
              key={item.id}
              id={`inbox-${item.id}`}
              tabIndex={highlight === item.id ? -1 : undefined}
              aria-label={highlight === item.id ? `定位结果：${item.title}` : undefined}
              style={highlight === item.id ? { outline: "2px solid var(--workspace-accent)", outlineOffset: "3px" } : undefined}
              className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 dark:bg-zinc-950 ${
                item.status === "unread"
                  ? "border-blue-200 dark:border-blue-900"
                  : "border-zinc-200 opacity-80 dark:border-zinc-800"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-label={item.status === "unread" ? "未读" : "已读"}
                  className={`mt-2 size-2 shrink-0 rounded-full ${item.status === "unread" ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-700"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <h3 className="break-words font-semibold text-zinc-950 dark:text-zinc-50">
                      {item.title}
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {inboxSourceLabel(item.source)}
                    </span>
                    <time className="shrink-0 text-xs text-zinc-500" dateTime={item.occurredAt}>
                      {inboxTimeLabel(item.occurredAt)}
                    </time>
                  </div>
                  {item.body && (
                    <details open={highlight === item.id} className="mt-2 break-words text-sm leading-6 text-zinc-600 dark:text-zinc-400"><summary className="min-h-11 cursor-pointer py-2">阅读正文</summary>
                      <MarkdownMessage content={item.body} />
                    </details>
                  )}
                  {item.source === "personal_briefing" && (
                    <div className="mt-4 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/70">
                      <p className="text-xs text-zinc-500">
                        这份简报对你有帮助吗？反馈会用于减少相似或不相关内容。
                      </p>
                      <div
                        className="mt-2 flex flex-wrap gap-2"
                        role="group"
                        aria-label={`${item.title}反馈`}
                      >
                        {BRIEFING_FEEDBACK.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            aria-pressed={item.feedback === option.value}
                            disabled={busyId === item.id}
                            onClick={() => void changeFeedback(item, option.value)}
                            className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
                              item.feedback === option.value
                                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200"
                                : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                        {item.taskId && (
                          <a
                            href={appHref(`/tasks?task=${item.taskId}&edit=1`)}
                            className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
                          >
                            调整主题与频率
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {item.source === "book_recommendation" && (
                    <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-950/30">
                      <a href={appHref("/reading")} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        调整阅读画像
                      </a>
                      {item.taskId && (
                        <a href={appHref(`/tasks?task=${item.taskId}&edit=1`)} className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          调整主题与频率
                        </a>
                      )}
                    </div>
                  )}
                  {item.source === "proactive_checkin" && item.proactivityRationale && (
                    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-900 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
                      <p className="font-medium">为什么联系你</p>
                      <p className="mt-1">{item.proactivityRationale}</p>
                      <a href={appHref("/proactivity")} className="mt-2 inline-block underline underline-offset-2">降低频率、暂停或关闭这类问候</a>
                    </div>
                  )}
                  {item.reflectionQuestions && item.reflectionQuestions.length > 0 && (
                    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-900 dark:bg-sky-950/30">
                      <p className="text-xs font-medium text-sky-900 dark:text-sky-100">
                        问题质量诊断
                      </p>
                      <div className="mt-2 space-y-2 text-xs text-sky-800 dark:text-sky-200">
                        {item.reflectionQuestions.map((question) => (
                          <div key={question.question} className="flex flex-wrap gap-x-3 gap-y-1">
                            <span>相关性 {question.scores.relevance}/5</span>
                            <span>新颖性 {question.scores.novelty}/5</span>
                            <span>可行动性 {question.scores.actionability}/5</span>
                            <span>情绪负担 {question.scores.emotionalLoad}/5</span>
                            <span>综合 {question.scores.total.toFixed(2)}/5</span>
                            <span>从 {question.candidateCount} 个候选中筛选</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a href={appHref("/reflection")} className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                          调整提问偏好
                        </a>
                        {item.source === "reflection_question" && item.taskId && (
                          <a href={appHref(`/tasks?task=${item.taskId}&edit=1`)} className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
                            调整主题与频率
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void changeStatus(item)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      标为{item.status === "read" ? "未读" : "已读"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void remove(item)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
