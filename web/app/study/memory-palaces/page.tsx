import { AppShell } from "@/components/ui/AppShell";
import { MemoryPalaceManager } from "@/components/memory/MemoryPalaceManager";
export default function LearningPalacesPage() {
  return <AppShell route="/study/memory-palaces" title="学习助记宫殿" description="为背书材料组织路线、位置和联想，不混入个人事实记忆。"><MemoryPalaceManager purposeFilter="learning" /></AppShell>;
}
