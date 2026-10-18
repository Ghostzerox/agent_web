"use client";

import { useCallback, useEffect, useState } from "react";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { confirmMemoryCandidate, listMemoryCandidates, rejectMemoryCandidate, type MemoryCandidate } from "@/lib/api/memoryCandidateClient";
import { type MemoryCandidateKind, type MemorySensitivity } from "@/lib/memory/types";

const KIND_LABELS: Record<MemoryCandidateKind, string> = {
  preference: "偏好",
  goal: "目标",
  profile: "个人资料",
  fact: "明确事实",
};

const SENSITIVITY_LABELS: Record<MemorySensitivity, string> = {
  low: "低敏感",
  personal: "个人信息",
  sensitive: "敏感信息",
};

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export function MemoryCandidateManager() {
  const [items, setItems] = useState<MemoryCandidate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useNavigationGuard(busyId !== null || items.some((item) => item.status === "pending" && drafts[item.id] !== undefined && drafts[item.id] !== item.content));

  const load = useCallback(async () => {
    try {
      const loaded = await listMemoryCandidates("all");
      setItems(loaded);
      setDrafts(
        Object.fromEntries(
          loaded
            .filter((item) => item.status === "pending")
            .map((item) => [item.id, item.content]),
        ),
      );
      setError(null);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listMemoryCandidates("all")
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setDrafts(
          Object.fromEntries(
            loaded
              .filter((item) => item.status === "pending")
              .map((item) => [item.id, item.content]),
          ),
        );
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const resolve = async (
    item: MemoryCandidate,
    action: "confirm" | "reject",
  ) => {
    setBusyId(item.id);
    setError(null);
    try {
      const updated =
        action === "confirm"
          ? await confirmMemoryCandidate(
              item.id,
              (drafts[item.id] ?? item.content).trim(),
              item.version,
            )
          : await rejectMemoryCandidate(item.id, item.version);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate,
        ),
      );
      if (action === "confirm") {
        window.dispatchEvent(new Event("memory-items-changed"));
      }
    } catch (resolveError) {
      setError(friendlyError(resolveError));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const pending = items.filter((item) => item.status === "pending");
  const resolved = items.filter((item) => item.status !== "pending");

  if (loading) {
    return <p className="mx-auto max-w-5xl rounded-2xl border border-zinc-200 bg-white p-8 text-center text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取记忆候选…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <h2 className="font-semibold">记忆先确认，再生效</h2>
        <p className="mt-1">系统只从明确、可能长期有效的陈述中提出候选。问题、临时信息和疑似密钥不会进入候选；即使候选置信度很高，也不会自动成为长期记忆。</p>
        <p className="mt-1 text-xs opacity-75">确认后进入上方长期记忆；只有与当前问题相关、未过期且在预算内的内容才会发送给模型。</p>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}

      <section aria-labelledby="pending-memory-title">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="pending-memory-title" className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">等待你确认</h2>
          <button type="button" onClick={() => void load()} className="text-xs text-zinc-500 underline">刷新</button>
        </div>
        {pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">暂时没有待确认候选。你可以在对话中说“请记住：……”或明确表达长期目标与稳定偏好。</p>
        ) : (
          <div className="space-y-4">
            {pending.map((item) => (
              <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{KIND_LABELS[item.kind]}</span>
                  <span className={`rounded-full px-2.5 py-1 ${item.sensitivity === "sensitive" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>{SENSITIVITY_LABELS[item.sensitivity]}</span>
                  <span className="text-zinc-500">置信度 {item.confidence}%</span>
                  <time className="ml-auto text-zinc-400">{timeLabel(item.createdAt)}</time>
                </div>
                <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  确认后保存的内容
                  <textarea
                    aria-label={`编辑候选：${item.content}`}
                    rows={3}
                    maxLength={500}
                    value={drafts[item.id] ?? item.content}
                    onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm dark:border-zinc-700"
                  />
                </label>
                <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <p><span className="font-medium">原始证据：</span>{item.evidenceQuote}</p>
                  <p className="mt-1"><span className="font-medium">提出原因：</span>{item.reason}</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id || !(drafts[item.id] ?? item.content).trim()}
                    onClick={() => void resolve(item, "confirm")}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
                  >确认记住</button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void resolve(item, "reject")}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                  >不要记住</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {resolved.length > 0 && (
        <section aria-labelledby="resolved-memory-title">
          <h2 id="resolved-memory-title" className="mb-3 text-lg font-semibold text-zinc-950 dark:text-zinc-50">最近处理</h2>
          <div className="space-y-2">
            {resolved.slice(0, 20).map((item) => (
              <article key={item.id} className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs ${item.status === "confirmed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}>{item.status === "confirmed" ? "已确认" : "已拒绝"}</span>
                <div className="min-w-0">
                  <p className="break-words text-zinc-800 dark:text-zinc-200">{item.content}</p>
                  <p className="mt-1 text-xs text-zinc-400">{KIND_LABELS[item.kind]} · {timeLabel(item.resolvedAt ?? item.updatedAt)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
