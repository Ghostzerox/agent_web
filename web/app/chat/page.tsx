"use client";

import { useEffect, useRef, useState } from "react";
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
import { buildAgentPrompt } from "@/lib/agent/promptBuilder";
import { applyRetryReply, applySendReply, sendChatMessage } from "@/lib/ai/chatService";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import type {
  MessageCitation,
  ResponseVerification,
} from "@/lib/ai/messages";
import type { SearchMode } from "@/lib/search/webSearch";
import {
  appendServerMessage,
  createServerSession,
  deleteServerSession,
  getServerSession,
  listServerSessions,
  renameServerSession,
  serverRecordToMessage,
  setServerActiveLeaf,
  type ServerSession,
  updateServerSession,
} from "@/lib/api/conversationClient";
import { extractMemoryCandidateFromMessage } from "@/lib/api/memoryCandidateClient";
import type { ChatMessage } from "@/lib/ai/messages";
import {
  appendMessage,
  checkoutSessionAt,
  getActiveMessages,
  switchAssistantVersion,
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
  const [sessions, setSessions] = useState<ServerSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const controllers = useRef(new Map<string, AbortController>());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [requestedMode, setRequestedMode] = useState<CoreModeId | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [knowledgeSelections, setKnowledgeSelections] = useState<Record<string, string[]>>({});
  const [summarySelections, setSummarySelections] = useState<Record<string, boolean>>({});
  const [updatingModeSessionId, setUpdatingModeSessionId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [memoryCandidateReady, setMemoryCandidateReady] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [promptEnvelopes, setPromptEnvelopes] = useState<
    Record<string, PromptEnvelope>
  >({});

  const replaceSession = (next: ServerSession) => {
    setSessions((current) =>
      current.map((session) => (session.id === next.id ? next : session)),
    );
  };

  const refreshSessions = async (preferredId?: string | null) => {
    const loaded = await listServerSessions();
    setSessions(loaded);
    setActiveSessionId((current) => {
      const candidate = preferredId ?? current ?? window.sessionStorage.getItem("active-chat-session");
      return candidate && loaded.some((session) => session.id === candidate)
        ? candidate
        : loaded[0]?.id ?? null;
    });
  };

  useEffect(() => {
    let disposed = false;
    const readModeIntent = () => {
      const requested = currentAppSearchParams().get("mode");
      setRequestedMode(isCoreModeId(requested) && requested !== "entertainment" ? requested : null);
    };
    window.addEventListener("hashchange", readModeIntent);
    const initialize = async () => {
      readModeIntent();
      try {
        await refreshSessions(currentAppSearchParams().get("session"));
      } catch (loadError) {
        if (!disposed) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "无法读取服务端会话",
          );
        }
      }
    };
    void initialize();

    const activeControllers = controllers.current;
    return () => {
      disposed = true;
      window.removeEventListener("hashchange", readModeIntent);
      for (const controller of activeControllers.values()) controller.abort();
      activeControllers.clear();
    };
  }, []);

  const resolvedActiveSessionId =
    activeSessionId && sessions.some((session) => session.id === activeSessionId)
      ? activeSessionId
      : sessions[0]?.id ?? null;
  const activeSession = resolvedActiveSessionId
    ? sessions.find((session) => session.id === resolvedActiveSessionId) ?? null
    : null;
  const messages: ChatMessage[] = activeSession
    ? getActiveMessages(activeSession)
    : [];
  const loading = resolvedActiveSessionId
    ? runningSessionIds.has(resolvedActiveSessionId)
    : false;
  const input = resolvedActiveSessionId ? drafts[resolvedActiveSessionId] ?? "" : "";
  const setInput = (value: string) => {
    if (resolvedActiveSessionId) setDrafts((current) => ({ ...current, [resolvedActiveSessionId]: value }));
  };
  useNavigationGuard(Object.values(drafts).some((draft) => draft.trim().length > 0) || runningSessionIds.size > 0,
    runningSessionIds.size > 0 ? "有对话正在生成。离开会取消生成，未完成的回答不会保存。" : "有会话草稿尚未发送，离开页面后需要重新输入。");
  useEffect(() => {
    if (resolvedActiveSessionId) window.sessionStorage.setItem("active-chat-session", resolvedActiveSessionId);
  }, [resolvedActiveSessionId]);

  const markRunning = (sessionId: string, controller: AbortController) => {
    controllers.current.set(sessionId, controller);
    setRunningSessionIds((current) => new Set(current).add(sessionId));
  };

  const markFinished = (sessionId: string) => {
    controllers.current.delete(sessionId);
    setRunningSessionIds((current) => {
      const next = new Set(current);
      next.delete(sessionId);
      return next;
    });
  };

  const handleNewSession = async () => {
    try {
      setError(null);
      const session = await createServerSession();
      setSessions((current) => [session, ...current]);
      setActiveSessionId(session.id);
      setSidebarOpen(false);
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "无法创建会话",
      );
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!window.confirm("确定要删除这个对话吗？已确认记忆独立保留，但来源证据副本会清除。若要连同关联记忆删除，可在记忆页的来源操作中执行。")) return;
    try {
      controllers.current.get(id)?.abort();
      await deleteServerSession(id);
      setSessions((current) => current.filter((session) => session.id !== id));
      if (id === resolvedActiveSessionId) setActiveSessionId(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "无法删除会话",
      );
    }
  };

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading || !resolvedActiveSessionId || !activeSession) return;

    setInput("");
    setError(null);
    const sessionId = resolvedActiveSessionId;
    const controller = new AbortController();
    markRunning(sessionId, controller);

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

      const prompt = buildAgentPrompt({
        session: persistedUserSession,
        memory: [],
      });
      const provisionalId = crypto.randomUUID();
      let citations: MessageCitation[] = [];
      let verification: ResponseVerification | null = null;
      const reply = await sendChatMessage(
        prompt,
        {
          trigger: "send",
          conversation: {
            id: persistedUserSession.id,
            title: persistedUserSession.title,
            activeLeafId: persistedUserSession.activeLeafId ?? null,
          },
          searchMode,
          knowledgeCollectionIds: knowledgeSelections[sessionId] ?? [],
          useSummary: summarySelections[sessionId] ?? false,
        },
        controller.signal,
        (_delta, accumulated) => {
          replaceSession(
            applySendReply(
              persistedUserSession,
              accumulated,
              provisionalId,
            ) as ServerSession,
          );
        },
        (envelope) =>
          setPromptEnvelopes((current) => ({
            ...current,
            [sessionId]: envelope,
          })),
        (nextCitations) => {
          citations = nextCitations;
        },
        (nextVerification) => {
          verification = nextVerification;
        },
      );
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
      markFinished(sessionId);
    }
  };

  const handleRetry = async (messageId: string) => {
    if (loading || !resolvedActiveSessionId || !activeSession) return;
    const message = messages.find((candidate) => candidate.id === messageId);
    if (!message || message.role !== "assistant") return;
    if (!window.confirm("确定要重新生成回复吗？")) return;

    const sessionId = resolvedActiveSessionId;
    const retrySession = checkoutSessionAt(activeSession, message.parentId ?? null);
    const controller = new AbortController();
    const provisionalId = crypto.randomUUID();
    markRunning(sessionId, controller);
    setError(null);

    try {
      const prompt = buildAgentPrompt({ session: retrySession, memory: [] });
      let citations: MessageCitation[] = [];
      let verification: ResponseVerification | null = null;
      const reply = await sendChatMessage(
        prompt,
        {
          trigger: "retry",
          conversation: {
            id: retrySession.id,
            title: retrySession.title,
            activeLeafId: retrySession.activeLeafId ?? null,
          },
          searchMode,
          knowledgeCollectionIds: knowledgeSelections[sessionId] ?? [],
          useSummary: summarySelections[sessionId] ?? false,
        },
        controller.signal,
        (_delta, accumulated) => {
          replaceSession(
            applyRetryReply(
              activeSession,
              accumulated,
              messageId,
              provisionalId,
            ) as ServerSession,
          );
        },
        (envelope) =>
          setPromptEnvelopes((current) => ({
            ...current,
            [sessionId]: envelope,
          })),
        (nextCitations) => {
          citations = nextCitations;
        },
        (nextVerification) => {
          verification = nextVerification;
        },
      );
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
      markFinished(sessionId);
    }
  };

  const handleSwitchVersion = async (
    messageId: string,
    direction: "prev" | "next",
  ) => {
    if (!activeSession || !resolvedActiveSessionId || loading) return;
    const switched = switchAssistantVersion(activeSession, messageId, direction);
    if (switched.activeLeafId === activeSession.activeLeafId) return;
    try {
      const updated = await setServerActiveLeaf(
        resolvedActiveSessionId,
        switched.activeLeafId ?? null,
        activeSession.serverVersion,
      );
      replaceSession({
        ...switched,
        updatedAt: new Date(updated.updatedAt).getTime(),
        serverVersion: updated.version,
      } as ServerSession);
    } catch (switchError) {
      setError(
        switchError instanceof Error ? switchError.message : "无法切换回答版本",
      );
      try {
        replaceSession(await getServerSession(resolvedActiveSessionId));
      } catch {
        // 保留原始错误，避免恢复请求覆盖更有用的诊断信息。
      }
    }
  };

  const handleModeChange = async (mode: CoreModeId) => {
    if (
      !activeSession ||
      !resolvedActiveSessionId ||
      loading ||
      updatingModeSessionId ||
      (activeSession.mode ?? "auto") === mode
    ) {
      return;
    }

    const sessionId = resolvedActiveSessionId;
    setUpdatingModeSessionId(sessionId);
    setError(null);
    try {
      const updated = await updateServerSession(sessionId, {
        mode,
        expectedVersion: activeSession.serverVersion,
      });
      replaceSession({
        ...activeSession,
        mode,
        updatedAt: new Date(updated.updatedAt).getTime(),
        serverVersion: updated.version,
      });
    } catch (modeError) {
      setError(
        modeError instanceof Error ? modeError.message : "无法更新对话模式",
      );
      try {
        replaceSession(await getServerSession(sessionId));
      } catch {
        // 保留模式更新的原始错误，避免恢复请求覆盖诊断信息。
      }
    } finally {
      setUpdatingModeSessionId((current) =>
        current === sessionId ? null : current,
      );
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
                controllers.current.get(resolvedActiveSessionId)?.abort()
              }
            />
          )}
        </main>
      </div>
      </div>
    </AppShell>
  );
}
