import { AppShell } from "@/components/ui/AppShell";
import { ReflectionPreferenceManager } from "@/components/reflection/ReflectionPreferenceManager";
import { AppLink } from "@/components/platform/AppLink";

export const dynamic = "force-dynamic";

export default function ReflectionPage() {
  return (
    <AppShell route="/reflection" title="思考问题" description="设置反思内容的目标与边界；对话模式在聊天页切换。">
      <div className="mb-5 flex flex-wrap gap-2"><AppLink href="/content" className="module-local-link">返回内容首页</AppLink><AppLink href="/inbox?source=reflection_question" className="module-local-link">阅读思考问题</AppLink></div><ReflectionPreferenceManager />
    </AppShell>
  );
}
