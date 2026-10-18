"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Owns cancellation and pending state for independent conversations. */
export function useChatRuns() {
  const controllers = useRef(new Map<string, AbortController>());
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const active = controllers.current;
    return () => { for (const controller of active.values()) controller.abort(); active.clear(); };
  }, []);
  const startRun = (id: string) => {
    const controller = new AbortController();
    controllers.current.set(id, controller);
    setRunningSessionIds((current) => new Set(current).add(id));
    return controller;
  };
  const finishRun = (id: string, controller: AbortController) => {
    if (controllers.current.get(id) !== controller) return;
    controllers.current.delete(id);
    setRunningSessionIds((current) => { const next = new Set(current); next.delete(id); return next; });
  };
  const cancelRun = useCallback((id: string) => controllers.current.get(id)?.abort(), []);
  return { runningSessionIds, startRun, finishRun, cancelRun };
}
