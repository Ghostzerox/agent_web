import { AppShell } from "@/components/ui/AppShell";
import { MemoryWorkspace } from "@/components/memory/MemoryWorkspace";

export const dynamic = "force-dynamic";

export default function MemoryPage() {
  return (
    <AppShell route="/memory" title="记忆" description="审核新的候选，管理你选择长期保留的信息。">
      <MemoryWorkspace />
    </AppShell>
  );
}
