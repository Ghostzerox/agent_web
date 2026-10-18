"use client";

import { useEffect, useState } from "react";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatErrorBanner } from "@/components/chat/ChatErrorBanner";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { ModeSelector } from "@/components/chat/ModeSelector";
import { PromptExportControl } from "@/components/chat/PromptExportControl";
import { KnowledgeSelector } from "@/components/chat/KnowledgeSelector";
import { ConversationSummaryControl } from "@/components/chat/ConversationSummaryControl";
import { SessionSidebar } from "@/components/chat/SessionSidebar";
import { AppLink } from "@/components/platform/AppLink";
import { AppShell } from "@/components/ui/AppShell";
import { Drawer } from "@/components/ui/Drawer";
import { Disclosure } from "@/components/ui/Disclosure";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";
import { MODULE_TOOL_IDS } from "@/lib/platform/workspaceNavigation";
import { useAppQueryReady } from "@/components/platform/useAppQuery";
import { useNavigationGuard } from "@/components/platform/useNavigationGuard";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";
import { coreModeRegistry, isCoreModeId } from "@/lib/agent/modeRegistry";
import type { CoreModeId } from "@/lib/agent/modeRegistry";
import type { Session } from "@/lib/conversation/session";
import { streamSessionReply } from "@/lib/ai/sessionReply";
import { useChatRuns } from "@/components/chat/useChatRuns";
import { useChatSessions } from "@/components/chat/useChatSessions";
import { applyRetryReply, applySendReply } from "@/lib/ai/chatService";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import type { SearchMode } from "@/lib/search/webSearch";
import {
  appendServerMessage,
  getServerSession,
  renameServerSession,
  serverRecordToMessage,
  type ServerSession,
} from "@/lib/api/conversationClient";
import { extractMemoryCandidateFromMessage } from "@/lib/api/memoryCandidateClient";
import {
  appendMessage,
  checkoutSessionAt,
} from "@/lib/conversation/tree";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function ChatPage() {
  const params = useAppQueryReady();
  if (!params) return <p role="status">正在打开对话空间…</p>;
  return params.get("view") === "tools" ? <AppShell route="/chat" title="专业工具" description="基础计算与原文定位，不自动发给 AI。"><ToolsWorkbench toolIds={MODULE_TOOL_IDS.chat} /></AppShell> : <ChatWorkspace />;
}

function ChatWorkspace() {
  const { runningSessionIds, startRun, finishRun, cancelRun } = useChatRuns();
  const [requestedMode, setRequestedMode] = useState<CoreModeId | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [knowledgeSelections, setKnowledgeSelections] = useState<Record<string, string[]>>({});
  const [summarySelections, setSummarySelections] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [memoryCandidateReady, setMemoryCandidateReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [promptEnvelopes, setPromptEnvelopes] = useState<
    Record<string, PromptEnvelope>
  >({});

  const { sessions, activeSession, resolvedActiveSessionId, setActiveSessionId, input, setInput, messages, loading,
    updatingModeSessionId, replaceSession, handleNewSession: createSession, handleDeleteSession, handleSwitchVersion, handleModeChange, hasDrafts } =
    useChatSessions(runningSessionIds, cancelRun, setError);
  const handleNewSession = async () => { if (await createSession()) setSidebarOpen(false); };
  useNavigationGuard(hasDrafts || runningSessionIds.size > 0,
    runningSessionIds.size > 0 ? "有对话正在生成。离开会取消生成，未完成的回答不会保存。" : "有会话草稿尚未发送，离开页面后需要重新输入。");
  const requestReply = (session: Session, trigger: "send" | "retry", signal: AbortSignal, onDelta: (text: string, provisionalId: string) => void) =>
    streamSessionReply({ session, trigger, signal, searchMode, knowledgeCollectionIds: knowledgeSelections[session.id] ?? [],
      useSummary: summarySelections[session.id] ?? false, onDelta,
      onEnvelope: (envelope) => setPromptEnvelopes((current) => ({ ...current, [session.id]: envelope })) });
  useEffect(() => {
    const readModeIntent = () => {
      const requested = currentAppSearchParams().get("mode");
      setRequestedMode(isCoreModeId(requested) && requested !== "entertainment" ? requested : null);
    };
    window.addEventListener("hashchange", readModeIntent);
    const frame = requestAnimationFrame(readModeIntent);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", readModeIntent);
    };
  }, []);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !resolvedActiveSessionId || !activeSession) return;

    setInput("");
    setError(null);
    const sessionId = resolvedActiveSessionId;
    const controller = startRun(sessionId);

    let persistedUserSession = activeSession;
    try {
      const userResult = await appendServerMessage(sessionId, {
        parentMessageId: activeSession.activeLeafId ?? null,
        role: "user",
        content: trimmed,
      });
      const userMessage = serverRecordToMessage(userResult.message);
      void extractMemoryCandidateFromMessage({
        conversationId: sessionId,
        messageId: userResult.message.id,
      })
        .then((result) => {
          if (result.candidate?.status === "pending") {
            setMemoryCandidateReady(true);
          }
        })
        .catch(() => {
          // Candidate extraction is advisory and must never block the answer.
        });
      persistedUserSession = {
        ...appendMessage(activeSession, userMessage),
        updatedAt: new Date(userResult.conversation.updatedAt).getTime(),
        serverVersion: userResult.conversation.version,
      };
      if (messages.length === 0) {
        const title = trimmed.slice(0, 20);
        const renamed = await renameServerSession(
          sessionId,
          title,
          persistedUserSession.serverVersion,
        );
        persistedUserSession = {
          ...persistedUserSession,
          title,
          updatedAt: new Date(renamed.updatedAt).getTime(),
          serverVersion: renamed.version,
        };
      }
      replaceSession(persistedUserSession);

      const { reply, citations, verification } = await requestReply(persistedUserSession, "send", controller.signal,
        (text, provisionalId) => replaceSession(applySendReply(persistedUserSession, text, provisionalId) as ServerSession));
      const assistantResult = await appendServerMessage(sessionId, {
        parentMessageId: userMessage.id ?? null,
        role: "assistant",
        content: reply,
        citations,
        verification,
      });
      replaceSession({
        ...appendMessage(
          persistedUserSession,
          serverRecordToMessage(assistantResult.message),
        ),
        updatedAt: new Date(assistantResult.conversation.updatedAt).getTime(),
        serverVersion: assistantResult.conversation.version,
      } as ServerSession);
    } catch (sendError) {
      replaceSession(persistedUserSession);
      if (!isAbortError(sendError) && !controller.signal.aborted) {
        setError(
          sendError instanceof Error ? sendError.message : "消息发送失败",
        );
      }
    } finally {
      finishRun(sessionId, controller);
    }
  };

  const handleRetry = async (messageId: string) => {
    if (loading || !resolvedActiveSessionId || !activeSession) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    if (!message || message.role !== "assistant") return;
    if (!window.confirm("确定要重新生成回复吗？")) return;

    const sessionId = resolvedActiveSessionId;
    const retrySession = checkoutSessionAt(activeSession, message.parentId ?? null);
    const controller = startRun(sessionId);
    setError(null);

    try {
      const { reply, citations, verification } = await requestReply(retrySession, "retry", controller.signal,
        (text, provisionalId) => replaceSession(applyRetryReply(activeSession, text, messageId, provisionalId) as ServerSession));
      await appendServerMessage(sessionId, {
        parentMessageId: message.parentId ?? null,
        role: "assistant",
        content: reply,
        citations,
        verification,
      });
      replaceSession(await getServerSession(sessionId));
    } catch (retryError) {
      replaceSession(activeSession);
      if (!isAbortError(retryError) && !controller.signal.aborted) {
        setError(
          retryError instanceof Error ? retryError.message : "重新生成失败",
        );
      }
    } finally {
      finishRun(sessionId, controller);
    }
  };

  return (
    <AppShell route="/chat" title="AI 对话" description="自动 · 专业 · 陪伴 · 反思" chat actions={<ChatHeader
        onOpenSidebar={() => setSidebarOpen(true)}
        sidebarOpen={sidebarOpen}
        actions={
          <div className="flex items-center gap-2">
            <ModeSelector
              mode={activeSession?.mode ?? "auto"}
              disabled={
                !activeSession ||
                loading ||
                updatingModeSessionId === resolvedActiveSessionId
              }
              onChange={handleModeChange}
            />
            <PromptExportControl
              envelope={
                resolvedActiveSessionId
                  ? promptEnvelopes[resolvedActiveSessionId] ?? null
                  : null
              }
            />
          </div>
        }
      />}>
      <div className="flex min-h-0 flex-1 flex-col">

      {requestedMode && requestedMode !== (activeSession?.mode ?? "auto") && <div className="flex flex-wrap items-center justify-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <span>你选择了{coreModeRegistry.get(requestedMode).label}入口。切换只改变当前会话后续回答，不会自动生成。</span>
        <button type="button" disabled={!activeSession || loading || Boolean(updatingModeSessionId)} onClick={() => void handleModeChange(requestedMode).then(() => setRequestedMode(null))} className="rounded-lg border border-current px-3">切换当前会话为{coreModeRegistry.get(requestedMode).label}</button>
        <button type="button" onClick={() => setRequestedMode(null)} className="px-2 underline">保留原模式</button>
      </div>}


      {error && (
        <ChatErrorBanner message={error} onDismiss={() => setError(null)} />
      )}

      {memoryCandidateReady && (
        <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100">
          <span>发现一条可能值得长期记住的信息，尚未保存。</span>
          <AppLink href="/memory?view=candidates" className="font-medium underline underline-offset-2">查看并确认</AppLink>
          <button type="button" onClick={() => setMemoryCandidateReady(false)} className="text-xs opacity-70 underline">稍后处理</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden shrink-0 md:flex">
          <SessionSidebar
            sessions={sessions}
            activeSessionId={resolvedActiveSessionId}
            onCreate={handleNewSession}
            onSelect={setActiveSessionId}
            onDelete={handleDeleteSession}
          />
        </div>

        {sidebarOpen && (
          <Drawer id="mobile-session-drawer" label="对话列表" onClose={() => setSidebarOpen(false)}>
              <SessionSidebar
                sessions={sessions}
                activeSessionId={resolvedActiveSessionId}
                onCreate={handleNewSession}
                onSelect={(id) => {
                  setActiveSessionId(id);
                  setSidebarOpen(false);
                }}
                onDelete={handleDeleteSession}
                mobile
                onClose={() => setSidebarOpen(false)}
              />
          </Drawer>
        )}

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
            <MessageList
              hasActiveSession={Boolean(activeSession)}
              messages={messages}
              allMessages={activeSession?.messages ?? []}
              loading={loading}
              onRetry={handleRetry}
              onSwitchVersion={handleSwitchVersion}
            />
          </div>

          {resolvedActiveSessionId && <div className="max-h-[35vh] shrink-0 overflow-y-auto"><Disclosure title="本次对话的资料与上下文">
            <KnowledgeSelector key={resolvedActiveSessionId} mode={activeSession?.mode ?? "auto"} selected={knowledgeSelections[resolvedActiveSessionId] ?? []} disabled={loading} onChange={(ids) => setKnowledgeSelections((current) => ({ ...current, [resolvedActiveSessionId]: ids }))} />
            <ConversationSummaryControl key={`${resolvedActiveSessionId}:${activeSession?.activeLeafId ?? ""}`} conversationId={resolvedActiveSessionId} leafId={activeSession?.activeLeafId ?? null} enabled={summarySelections[resolvedActiveSessionId] ?? false} onChange={(value) => setSummarySelections((current) => ({ ...current, [resolvedActiveSessionId]: value }))} disabled={loading} envelope={promptEnvelopes[resolvedActiveSessionId]} />
          </Disclosure></div>}
          {resolvedActiveSessionId && (
            <ChatComposer
              value={input}
              loading={loading}
              searchMode={searchMode}
              onChange={setInput}
              onSearchModeChange={setSearchMode}
              onSend={sendMessage}
              onStop={() =>
                cancelRun(resolvedActiveSessionId)
              }
            />
          )}
        </main>
      </div>
      </div>
    </AppShell>
  );
}
