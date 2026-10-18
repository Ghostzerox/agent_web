import { AppShell } from "@/components/ui/AppShell";
import { ReadingProfileManager } from "@/components/reading/ReadingProfileManager";
import { AppLink } from "@/components/platform/AppLink";

export const dynamic = "force-dynamic";

export default function ReadingPage() {
  return (
    <AppShell route="/reading" title="阅读画像" description="告诉知伴你想读什么；推荐内容会进入收件箱。">
      <div className="mb-5 flex flex-wrap gap-2"><AppLink href="/content" className="module-local-link">返回内容首页</AppLink><AppLink href="/inbox?source=book_recommendation" className="module-local-link">阅读书籍推荐</AppLink><AppLink href="/content?view=tools" className="module-local-link">整理书目</AppLink></div><ReadingProfileManager />
    </AppShell>
  );
}
