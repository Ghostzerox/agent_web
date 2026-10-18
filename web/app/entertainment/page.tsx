import { AppShell } from "@/components/ui/AppShell";
import { EntertainmentWorkspace } from "@/components/game/EntertainmentWorkspace";

export const dynamic = "force-dynamic";

export default function EntertainmentPage() {
  return (
    <AppShell route="/entertainment" title="娱乐模式" description="进入独立的虚构世界；角色、分支与现实记忆分开保存。">
      <EntertainmentWorkspace />
    </AppShell>
  );
}
