"use client";
import { useEffect, useState } from "react";
import { currentAppSearchParams } from "@/lib/platform/appNavigation";

/** Stable SSR first paint; same-path hash queries and history navigation stay reactive. */
export function useAppQueryReady(): URLSearchParams | null {
  const [query, setQuery] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setQuery(currentAppSearchParams().toString());
    // MobileApp can reject a history change and restore the previous hash synchronously.
    // Read after those listeners, never unmount a dirty editor before that decision.
    let active = true;
    const afterNavigation = () => window.setTimeout(() => { if (active) read(); }, 0);
    read(); window.addEventListener("hashchange", afterNavigation); window.addEventListener("popstate", afterNavigation);
    return () => { active = false; window.removeEventListener("hashchange", afterNavigation); window.removeEventListener("popstate", afterNavigation); };
  }, []);
  return query === null ? null : new URLSearchParams(query);
}
export function useAppQuery(): URLSearchParams { return useAppQueryReady() ?? new URLSearchParams(); }
