import { AppShell } from "@/components/ui/AppShell";
import { VoiceProfileManager } from "@/components/voice/VoiceProfileManager";
import { Disclosure } from "@/components/ui/Disclosure";
import { ToolsWorkbench } from "@/components/tools/ToolsWorkbench";
import { MODULE_TOOL_IDS } from "@/lib/platform/workspaceNavigation";

export const dynamic = "force-dynamic";

export default function VoicePage() {
  return (
    <AppShell route="/voice" title="语音设置" description="找到适合你的音线，先试听，再保存。">
      <VoiceProfileManager />
      <Disclosure title="高级：朗读文本与分段预览"><ToolsWorkbench toolIds={MODULE_TOOL_IDS.voice} /></Disclosure>
    </AppShell>
  );
}
