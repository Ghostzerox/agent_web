"use client";
import { AppLink } from "@/components/platform/AppLink";
import { useAppQueryReady } from "@/components/platform/useAppQuery";
import { MEMORY_VIEW_LINKS, resolveMemoryView } from "@/lib/platform/memoryView";
import { MemoryCandidateManager } from "./MemoryCandidateManager";
import { MemoryManager } from "./MemoryManager";
import { KnowledgeLibrary } from "./KnowledgeLibrary";
import { MemoryPalaceManager } from "./MemoryPalaceManager";
import { MemoryDataControls } from "./MemoryDataControls";

export function MemoryWorkspace() {
  const params = useAppQueryReady();
  if (!params) return <p role="status">正在定位个人数据子页…</p>;
  const selected = resolveMemoryView(params);
  return <div className="space-y-5">
    {selected.view !== "learning" && <nav aria-label="个人数据子页" className="flex flex-wrap gap-2">{MEMORY_VIEW_LINKS.map((link, index) => <AppLink key={link.href} href={link.href} className="module-local-link" aria-current={selected.view === (["personal", "candidates", "knowledge", "navigation", "controls"] as const)[index] ? "page" : undefined}>{link.label}</AppLink>)}</nav>}
    {selected.error ? <p role="alert" className="rounded-xl border border-amber-400 p-4 text-sm">{selected.error}</p> : selected.view === "personal" ? <MemoryManager /> : selected.view === "candidates" ? <MemoryCandidateManager /> : selected.view === "knowledge" ? <KnowledgeLibrary key={params.toString()} /> : selected.view === "controls" ? <MemoryDataControls /> : <MemoryPalaceManager key={selected.view} purposeFilter={selected.view === "learning" ? "learning" : "navigation"} />}
    {selected.view === "learning" && <AppLink href="/study/memory-palaces" className="module-local-link inline-flex">打开学习助记专属页面</AppLink>}
  </div>;
}
