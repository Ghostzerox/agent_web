import { AppShell } from "@/components/ui/AppShell";
import { MemoryCandidateManager } from "@/components/memory/MemoryCandidateManager";
import { MemoryManager } from "@/components/memory/MemoryManager";
import { KnowledgeLibrary } from "@/components/memory/KnowledgeLibrary";
import { MemoryPalaceManager } from "@/components/memory/MemoryPalaceManager";
import { MemoryDataControls } from "@/components/memory/MemoryDataControls";

export const dynamic = "force-dynamic";

export default function MemoryPage() {
  return (
    <AppShell route="/memory" title="记忆" description="审核新的候选，管理你选择长期保留的信息。">
      <div className="space-y-8"><MemoryDataControls /><MemoryPalaceManager /><KnowledgeLibrary /><MemoryManager /><MemoryCandidateManager /></div>
    </AppShell>
  );
}
