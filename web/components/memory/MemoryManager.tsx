"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  deleteMemory,
  listMemories,
  updateMemory,
  type MemoryItem,
} from "@/lib/api/memoryClient";
import type { MemoryCandidateKind } from "@/lib/memory/types";
import { deleteServerSession } from "@/lib/api/conversationClient";
import { AppLink } from "@/components/platform/AppLink";
import { getFileExportAdapter } from "@/lib/platform/fileExport";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";

const KIND_LABELS: Record<MemoryCandidateKind, string> = {
  preference: "偏好",
  goal: "目标",
  profile: "个人资料",
  fact: "事实",
};

type Draft = {
  content: string;
  kind: MemoryCandidateKind;
  pinned: boolean;
  validUntil: string;
};

function localInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function draftFor(item: MemoryItem): Draft {
  return {
    content: item.content,
    kind: item.kind,
    pinned: item.pinned,
    validUntil: localInputValue(item.validUntil),
  };
}

function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "记忆操作失败，请稍后重试";
}

export function MemoryManager() {
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showExpired, setShowExpired] = useState(false);
  const [query, setQuery] = useState("");
  const [snapshotAt, setSnapshotAt] = useState(() => Date.now());
  const dirty = items.some((item) => drafts[item.id] && JSON.stringify(drafts[item.id]) !== JSON.stringify(draftFor(item)));
  const dirtyRef = useRef(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useNavigationGuard(busyId !== null || dirty);

  const load = useCallback(async () => {
    try {
      const loaded = await listMemories();
      setSnapshotAt(Date.now());
      setItems(loaded);
      setDrafts(Object.fromEntries(loaded.map((item) => [item.id, draftFor(item)])));
      setError(null);
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void listMemories()
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
        setDrafts(Object.fromEntries(loaded.map((item) => [item.id, draftFor(item)])));
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (active) setError(friendlyError(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const refresh = () => { if (dirtyRef.current) { setStatus("其他记忆已变化，已保留编辑草稿；请核对后手动刷新。"); return; } void load(); };
    window.addEventListener("memory-items-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("memory-items-changed", refresh);
    };
  }, [load]);

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (showExpired || !item.validUntil || new Date(item.validUntil).getTime() > snapshotAt) && item.content.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [items, showExpired, snapshotAt, query],
  );
  const expiredCount = items.filter(
    (item) => item.validUntil && new Date(item.validUntil).getTime() <= snapshotAt,
  ).length;

  const save = async (item: MemoryItem, clearSourceEvidence = false) => {
    if (clearSourceEvidence && !window.confirm("保留这条已确认记忆，但清除其来源链接和候选证据副本？原始对话不会被删除。")) return;
    const draft = drafts[item.id] ?? draftFor(item);
    if (!draft.content.trim()) return;
    setBusyId(item.id);
    setError(null);
    setStatus(null);
    try {
      const updated = await updateMemory(item.id, {
        content: draft.content.trim(),
        kind: draft.kind,
        pinned: draft.pinned,
        validUntil: draft.validUntil ? new Date(draft.validUntil).toISOString() : null,
        expectedVersion: item.version,
        ...(clearSourceEvidence ? { clearSourceEvidence: true } : {}),
      });
      setItems((current) => current.map((value) => (value.id === updated.id ? updated : value)));
      setDrafts((current) => ({ ...current, [updated.id]: draftFor(updated) }));
      setStatus("记忆已更新，下一次相关问题会立即使用新版本。");
    } catch (saveError) {
      setError(friendlyError(saveError));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: MemoryItem) => {
    if (!window.confirm("确定永久删除这条记忆吗？删除后不会再发送给模型。")) return;
    setBusyId(item.id);
    setError(null);
    setStatus(null);
    try {
      await deleteMemory(item.id, item.version);
      setItems((current) => current.filter((value) => value.id !== item.id));
      setStatus("记忆已删除，后续回答不会再使用它。");
    } catch (deleteError) {
      setError(friendlyError(deleteError));
    } finally {
      setBusyId(null);
    }
  };

  const exportAll = async () => {
    setError(null);
    setStatus(null);
    try {
      const exportedAt = new Date().toISOString();
      const content = `${JSON.stringify(
        {
          format: "ai-study-companion.memories",
          schemaVersion: 1,
          exportedAt,
          memories: items.map(({ id, sourceConversationId, sourceMessageId, kind, content: value, evidenceQuote, sensitivity, pinned, validUntil, lastUsedAt, useCount, createdAt, updatedAt }) => ({
            id,
            sourceConversationId,
            sourceMessageId,
            kind,
            content: value,
            evidenceQuote,
            sensitivity,
            pinned,
            validUntil,
            lastUsedAt,
            useCount,
            createdAt,
            updatedAt,
          })),
        },
        null,
        2,
      )}\n`;
      const result = await getFileExportAdapter().export({
        filename: `memories-${exportedAt.slice(0, 10)}.json`,
        mediaType: "application/json",
        content,
        directory: "memory-exports",
        shareTitle: "AI 学习伴侣记忆导出",
        shareText: "此文件包含个人长期记忆，请只分享给可信对象。",
        dialogTitle: "分享记忆文件",
      });
      setStatus(result.method === "share" ? "已打开系统分享面板。" : "记忆 JSON 已下载。");
    } catch (exportError) {
      setError(friendlyError(exportError));
    }
  };

  const removeSourceAndMemories = async (item: MemoryItem) => {
    if (!item.sourceConversationId || !window.confirm("永久删除这条记忆的原始对话、该对话的全部消息及其所有关联记忆/候选证据？已导出文件和旧备份不会自动擦除。")) return;
    setBusyId(item.id); setError(null);
    try { await deleteServerSession(item.sourceConversationId, { deleteRelatedMemories: true }); await load(); window.dispatchEvent(new Event("memory-items-changed")); setStatus("原对话、关联记忆及候选证据已删除。"); }
    catch (failure) { setError(friendlyError(failure)); }
    finally { setBusyId(null); }
  };

  if (loading) {
    return <p className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">正在读取长期记忆…</p>;
  }

  return (
    <section aria-labelledby="confirmed-memory-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="confirmed-memory-title" className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">已确认的长期记忆</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">每次回答最多检索 5 条、约 500 Token；只发送与当前问题相关且未过期的记忆。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={busyId !== null} onClick={() => { if (!dirty || window.confirm("刷新将放弃未保存的记忆正文草稿，继续？")) void load(); }}>刷新已确认记忆</button>
          {expiredCount > 0 && (
            <label className="flex items-center gap-1.5 text-zinc-500">
              <input type="checkbox" checked={showExpired} onChange={(event) => setShowExpired(event.target.checked)} />
              显示已过期（{expiredCount}）
            </label>
          )}
          <button type="button" onClick={() => void exportAll()} disabled={items.length === 0} className="rounded-lg border border-zinc-300 px-3 py-1.5 font-medium disabled:opacity-40 dark:border-zinc-700">导出 JSON</button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {status && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{status}</p>}
      <label className="block text-sm">筛选记忆内容<input aria-label="筛选记忆内容" value={query} onChange={(event) => setQuery(event.target.value)} className="ml-2 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" /></label>
      <p className="text-xs text-zinc-500">同类记忆可能并存；有冲突请查看证据后更正/删除，系统不会自动决定哪条是真的。永久删除也会清除该条记忆的候选证据副本，不会删除原始对话。</p>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">还没有可用的长期记忆。确认下方候选后，它会出现在这里。</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((item) => {
            const draft = drafts[item.id] ?? draftFor(item);
            const expired = Boolean(item.validUntil && new Date(item.validUntil).getTime() <= snapshotAt);
            return (
              <article key={item.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">{KIND_LABELS[item.kind]}</span>
                  {item.pinned && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700 dark:bg-blue-950 dark:text-blue-200">已固定</span>}
                  {expired && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-950 dark:text-amber-200">已过期</span>}
                  <span className="ml-auto text-zinc-400">使用 {item.useCount} 次</span>
                </div>

                <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  记忆内容
                  <textarea aria-label={`编辑记忆：${item.content}`} rows={3} maxLength={500} value={draft.content} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, content: event.target.value } }))} className="mt-1.5 w-full resize-y rounded-xl border border-zinc-300 bg-transparent px-3 py-2.5 text-sm dark:border-zinc-700" />
                </label>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">类型
                    <select aria-label={`记忆类型：${item.content}`} value={draft.kind} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, kind: event.target.value as MemoryCandidateKind } }))} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-transparent px-2.5 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
                      {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-zinc-500">有效期（留空表示长期）
                    <input aria-label={`记忆有效期：${item.content}`} type="datetime-local" value={draft.validUntil} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, validUntil: event.target.value } }))} className="mt-1 block w-full rounded-lg border border-zinc-300 bg-transparent px-2.5 py-2 text-sm text-zinc-800 dark:border-zinc-700 dark:text-zinc-200" />
                  </label>
                </div>

                <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input type="checkbox" checked={draft.pinned} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, pinned: event.target.checked } }))} />
                  固定这条记忆（只提高相关结果中的排序，不会强制发送）
                </label>

                <p className="mt-3 text-xs text-zinc-400">敏感等级：{item.sensitivity} · 最近使用：{item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("zh-CN") : "尚未使用"}</p>
                <details className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs leading-5 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <summary className="cursor-pointer font-medium">查看来源证据</summary>
                  <p className="mt-2 break-words">{item.evidenceQuote || "来源证据已清除；这条记忆由你独立确认保留。"}</p>
                  <p className="mt-1 break-all text-zinc-400">来源消息：{item.sourceMessageId ?? "原对话已删除"}</p>
                  {item.sourceConversationId && <AppLink href={`/chat?session=${item.sourceConversationId}`} className="mt-2 inline-block underline">打开来源对话</AppLink>}
                </details>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={busyId === item.id || !draft.content.trim()} onClick={() => void save(item)} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950">保存修改</button>
                  <button type="button" disabled={busyId === item.id} onClick={() => void remove(item)} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300">永久删除</button>
                  {(item.evidenceQuote || item.sourceMessageId) && <button type="button" disabled={busyId !== null} onClick={() => void save(item, true)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs dark:border-zinc-700">保留记忆，清除来源证据</button>}
                  {item.sourceConversationId && <button type="button" disabled={busyId !== null} onClick={() => void removeSourceAndMemories(item)} className="rounded-lg border border-red-200 px-3 py-2 text-xs text-red-700">删除原对话及关联记忆</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
