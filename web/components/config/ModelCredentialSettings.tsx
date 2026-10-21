"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useConfirmAction } from "@/components/ui/Actions";
import { ModelUsagePanel } from "./ModelUsagePanel";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import {
  deleteModelCredential,
  getModelCredentialStatus,
  saveModelCredential,
  testModelCredential,
  type ModelCredentialStatus,
} from "@/lib/api/modelCredentialClient";

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

export function ModelCredentialSettings() {
  const { confirm, confirmation } = useConfirmAction();
  const [status, setStatus] = useState<ModelCredentialStatus | null>(null);
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<"save" | "test" | "delete" | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{
    kind: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  useNavigationGuard(Boolean(operation) || Boolean(!loading && status && (apiKey || provider !== (status.provider ?? "") || baseUrl !== (status.baseUrl ?? "") || model !== (status.model ?? ""))));

  async function refresh() {
    try {
      const nextStatus = await getModelCredentialStatus();
      setStatus(nextStatus);
      setProvider(nextStatus.provider ?? "");
      setBaseUrl(nextStatus.baseUrl ?? "");
      setModel(nextStatus.model ?? "");
    } catch (error) {
      setFeedback({ kind: "error", message: messageFrom(error) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void getModelCredentialStatus()
      .then((nextStatus) => {
        if (!active) return;
        setStatus(nextStatus);
        setProvider(nextStatus.provider ?? "");
        setBaseUrl(nextStatus.baseUrl ?? "");
        setModel(nextStatus.model ?? "");
      })
      .catch((error: unknown) => {
        if (active) {
          setFeedback({ kind: "error", message: messageFrom(error) });
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const input = () => ({ apiKey, provider, baseUrl, model });

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOperation("save");
    setFeedback(null);
    try {
      const nextStatus = await saveModelCredential(input());
      setStatus(nextStatus);
      setProvider(nextStatus.provider ?? "");
      setBaseUrl(nextStatus.baseUrl ?? "");
      setModel(nextStatus.model ?? "");
      setApiKey("");
      setShowApiKey(false);
      setFeedback({
        kind: "success",
        message:
          "配置已保存：API Key 已加密，Provider、Base URL 和 Model 以明文保存在服务端。",
      });
    } catch (error) {
      setFeedback({ kind: "error", message: messageFrom(error) });
    } finally {
      setOperation(null);
    }
  }

  async function handleTest() {
    setOperation("test");
    setFeedback(null);
    try {
      const result = await testModelCredential(input());
      setFeedback(
        result.modelAvailable
          ? { kind: "success", message: "连接成功，目标模型当前可用。" }
          : {
              kind: "warning",
              message: "API Key 可连接 Provider，但模型列表中没有目标模型。",
            },
      );
    } catch (error) {
      setFeedback({ kind: "error", message: messageFrom(error) });
    } finally {
      setOperation(null);
    }
  }

  async function handleDelete() {
    if (!await confirm({ title: "删除模型配置？", description: "将移除保存的凭据，之后AI请求不可用，直到重新配置。已有对话不会删除。", confirmLabel: "删除配置", danger: true })) {
      return;
    }
    setOperation("delete");
    setFeedback(null);
    try {
      await deleteModelCredential();
      setApiKey("");
      await refresh();
      setFeedback({ kind: "success", message: "服务端凭据已删除。" });
    } catch (error) {
      setFeedback({ kind: "error", message: messageFrom(error) });
    } finally {
      setOperation(null);
    }
  }

  const busy = operation !== null;
  const canSubmit = Boolean(
    apiKey.trim().length >= 8 &&
      provider.trim() &&
      baseUrl.trim() &&
      model.trim(),
  );
  const feedbackClass =
    feedback?.kind === "success"
      ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300"
      : feedback?.kind === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
        : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300";

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 ui-panel">{confirmation}
      <div>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          模型连接
        </h2>
<p className="mt-2 text-sm text-[var(--workspace-muted)]">填写服务地址、模型和Key，保存后用于各模式。测试连接不会保存修改。</p><details className="mt-2 text-sm"><summary>凭据如何保存？</summary><p>Key在服务端加密，不写入浏览器存储，不完整返回。Provider、Base URL和Model按要求明文保存。</p></details>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500 dark:text-zinc-400">状态</span>
          <span
            className={
              status?.configured
                ? "font-medium text-green-700 dark:text-green-400"
                : "font-medium text-amber-700 dark:text-amber-400"
            }
          >
            {loading ? "读取中…" : status?.configured ? "已配置" : "未配置"}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500 dark:text-zinc-400">来源</span>
          <span className="text-right text-zinc-800 dark:text-zinc-200">
            {status?.source === "stored"
              ? "服务端加密存储"
              : "—"}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500 dark:text-zinc-400">API Key</span>
          <span className="text-right text-zinc-800 dark:text-zinc-200">
            {status?.apiKeyHint ?? (status?.configured ? "已隐藏" : "—")}
          </span>
        </div>
        {status?.source === "stored" &&
          !status.configured &&
          status.missing.length > 0 && (
            <p className="border-t border-zinc-200 pt-3 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              服务端缺少：{status.missing.join("、")}
            </p>
          )}
      </section>

      <form className="space-y-4" onSubmit={handleSave}><fieldset disabled={loading || busy} className="space-y-4">
        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Provider
          <input
            aria-label="Provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            required
            maxLength={100}
            pattern="[A-Za-z0-9][A-Za-z0-9._-]*"
            autoComplete="off"
            spellCheck={false}
            placeholder="例如：deepseek"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <span className="mt-1 block text-xs font-normal text-zinc-500">
            当前连接协议仍为 OpenAI-compatible；这里填写厂商标识。
          </span>
        </label>

        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Base URL
          <input
            aria-label="Base URL"
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            required
            autoComplete="url"
            spellCheck={false}
            placeholder="例如：https://api.deepseek.com"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>

        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Model
          <input
            aria-label="Model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="例如：deepseek-chat"
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-950 outline-none transition focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
          />
        </label>

        <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          API Key
          <div className="mt-1.5 flex rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
            <input
              aria-label="API Key"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              spellCheck={false}
              placeholder="输入新的 API Key"
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-zinc-950 outline-none dark:text-zinc-50"
            />
            <button
              type="button"
              onClick={() => setShowApiKey((visible) => !visible)}
              className="px-3 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {showApiKey ? "隐藏" : "显示"}
            </button>
          </div>
          <span className="mt-1 block text-xs font-normal text-zinc-500">
            更新 Provider、Base URL 或 Model 时，需要重新输入 Key。
          </span>
        </label>

        {feedback && (
          <p role={feedback.kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${feedbackClass}`}>
            {feedback.message}
          </p>
        )}

        {!canSubmit && <p className="text-xs text-[var(--workspace-muted)]">请填写Provider、有效Base URL、Model和至少8位Key，再保存或测试。</p>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={busy || !canSubmit}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {operation === "test" ? "测试中…" : "测试连接"}
          </button>
          <button
            type="submit"
            disabled={busy || !canSubmit}
            className="ui-button ui-button-primary"
          >
            {operation === "save" ? "保存中…" : "保存配置"}
          </button>
          {status?.source === "stored" && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
            >
              {operation === "delete" ? "删除中…" : "删除凭据"}
            </button>
          )}
        </div>
      </fieldset></form>

      <ModelUsagePanel />

      <p className="text-xs leading-5 text-zinc-500">
        当前版本面向 localhost 与 Tailscale 私有访问，尚无应用登录；不要通过公网
        Funnel 或端口转发暴露此页面。
      </p>
    </div>
  );
}
