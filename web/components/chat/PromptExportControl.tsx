"use client";

import { useEffect, useState } from "react";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import type { PromptExportFormat } from "@/lib/ai/promptExport";
import { exportPromptEnvelope } from "@/lib/api/promptExportClient";
import { getFileExportAdapter } from "@/lib/platform/fileExport";
import { Drawer } from "@/components/ui/Drawer";

type PromptExportControlProps = {
  envelope: PromptEnvelope | null;
};

export function PromptExportControl({ envelope }: PromptExportControlProps) {
  const [open, setOpen] = useState(false);
  const [includeMemory, setIncludeMemory] = useState(false);
  const [exporting, setExporting] = useState<PromptExportFormat | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasMemory = envelope?.privacy.containsMemory ?? false;

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, exporting]);

  const startExport = async (format: PromptExportFormat) => {
    if (!envelope || exporting) return;
    setExporting(format);
    setStatus(null);
    setError(null);
    try {
      const artifact = await exportPromptEnvelope(
        envelope,
        format,
        includeMemory,
      );
      const result = await getFileExportAdapter().export(artifact);
      setStatus(
        result.method === "share"
          ? "已打开系统分享面板。"
          : `已下载 ${artifact.filename}`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : "Prompt 导出失败",
      );
    } finally {
      setExporting(null);
    }
  };

  const openDialog = () => {
    if (!envelope) return;
    setIncludeMemory(false);
    setStatus(null);
    setError(null);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!envelope}
        title={
          envelope
            ? "导出最近一次发送给模型的 Prompt"
            : "当前会话发送一次消息后即可导出 Prompt"
        }
        aria-label="导出 Prompt"
        className="rounded-xl border border-[var(--workspace-border)] px-3 py-2 text-xs font-medium text-[var(--workspace-muted)] hover:bg-[var(--workspace-active)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span className="sm:hidden" aria-hidden="true">↧</span><span className="hidden sm:inline">导出 Prompt</span>
      </button>

      {open && envelope && (
        <Drawer variant="sheet" id="prompt-export-dialog" label="导出最近一次 Prompt" onClose={() => { if (!exporting) setOpen(false); }}>
          <section
            aria-labelledby="prompt-export-title"
            className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="prompt-export-title"
                  className="text-base font-semibold text-zinc-950 dark:text-zinc-50"
                >
                  导出最近一次 Prompt
                </h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  服务端会校验本次请求的审计记录与内容哈希，再生成文件；不包含 API Key。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={Boolean(exporting)}
                aria-label="关闭"
                className="rounded-lg px-2 py-1 text-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                ×
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
              <dt className="text-zinc-500">对话</dt>
              <dd className="truncate text-zinc-800 dark:text-zinc-200">
                {envelope.conversation.title}
              </dd>
              <dt className="text-zinc-500">模型</dt>
              <dd className="truncate text-zinc-800 dark:text-zinc-200">
                {envelope.provider.model}
              </dd>
              <dt className="text-zinc-500">Run ID</dt>
              <dd className="truncate font-mono text-zinc-800 dark:text-zinc-200">
                {envelope.runId}
              </dd>
              <dt className="text-zinc-500">审计哈希</dt>
              <dd className="truncate font-mono text-zinc-800 dark:text-zinc-200">
                {envelope.integrity.contentHash}
              </dd>
              <dt className="text-zinc-500">捕获时间</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {new Date(envelope.createdAt).toLocaleString("zh-CN")}
              </dd>
            </dl>

            {hasMemory ? (
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <input
                  type="checkbox"
                  checked={includeMemory}
                  onChange={(event) => setIncludeMemory(event.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-medium">包含个人记忆上下文（含私人资料）</span>
                  <span className="mt-0.5 block text-xs opacity-75">
                    默认脱敏。只有确认文件保存位置和分享对象安全时才开启。
                  </span>
                </span>
              </label>
            ) : (
              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                本次请求没有使用个人记忆上下文。
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => void startExport("json")}
                disabled={Boolean(exporting)}
                className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
              >
                {exporting === "json" ? "正在导出…" : "导出 JSON"}
              </button>
              <button
                type="button"
                onClick={() => void startExport("markdown")}
                disabled={Boolean(exporting)}
                className="rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                {exporting === "markdown" ? "正在导出…" : "导出 Markdown"}
              </button>
            </div>

            {status && (
              <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">
                {status}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            )}
          </section>
        </Drawer>
      )}
    </>
  );
}
