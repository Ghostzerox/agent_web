"use client";
import { useConfirmAction } from "@/components/ui/Actions";
import { useEffect, useState } from "react";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";
import type { CoreModeId } from "@/lib/agent/modeRegistry";
import { createServerSession, deleteServerSession, listServerSessions, getServerSession, setServerActiveLeaf, updateServerSession, type ServerSession } from "@/lib/api/conversationClient";
import { getActiveMessages, switchAssistantVersion } from "@/lib/conversation/tree";
import type { ChatMessage } from "@/lib/ai/messages";

export function useChatSessions(runningSessionIds: Set<string>, cancelRun: (id: string) => void, setError: (message: string | null) => void) {
  const { confirm, confirmation: deleteConfirmation } = useConfirmAction();
  const [sessions, setSessions] = useState<ServerSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [updatingModeSessionId, setUpdatingModeSessionId] = useState<string | null>(null);
  const replaceSession = (next: ServerSession) => {
    setSessions((current) =>
      current.map((session) => (session.id === next.id ? next : session)),
    );
  };


  useEffect(() => {
    let disposed = false;
    void listServerSessions().then((loaded) => {
      if (disposed) return;
      setSessions(loaded);
      const candidate = currentAppSearchParams().get("session") ?? window.sessionStorage.getItem("active-chat-session");
      setActiveSessionId(candidate && loaded.some((session) => session.id === candidate) ? candidate : loaded[0]?.id ?? null);
    }).catch((error) => {
      if (!disposed) setError(error instanceof Error ? error.message : "无法读取服务端会话");
    });
    return () => { disposed = true; };
  }, [setError]);
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
  useEffect(() => {
    if (resolvedActiveSessionId) window.sessionStorage.setItem("active-chat-session", resolvedActiveSessionId);
  }, [resolvedActiveSessionId]);

  const handleNewSession = async () => {
    try {
      setError(null);
      const session = await createServerSession();
      setSessions((current) => [session, ...current]);
      setActiveSessionId(session.id);
      return true;
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "无法创建会话",
      );
      return false;
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!await confirm({ title: "删除这个对话？", description: "对话及其来源证据副本将清除，已确认记忆独立保留；若要一并删除关联记忆，请到个人数据的来源操作中执行。", confirmLabel: "删除对话", danger: true })) return;
    try {
      cancelRun(id);
      await deleteServerSession(id);
      setSessions((current) => current.filter((session) => session.id !== id));
      if (id === resolvedActiveSessionId) setActiveSessionId(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "无法删除会话",
      );
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



  return { deleteConfirmation, sessions, activeSession, resolvedActiveSessionId, setActiveSessionId, input, setInput, messages, loading,
    updatingModeSessionId, replaceSession, handleNewSession, handleDeleteSession, handleSwitchVersion, handleModeChange,
    hasDrafts: Object.values(drafts).some((draft) => draft.trim().length > 0) };
}
