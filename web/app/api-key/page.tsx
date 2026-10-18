import { AppShell } from "@/components/ui/AppShell";
import { ModelCredentialSettings } from "@/components/config/ModelCredentialSettings";

export const dynamic = "force-dynamic";

export default function ApiKeyPage() {
  return (
    <AppShell route="/api-key" title="模型服务配置" description="选择 Provider 与模型，管理凭据和 Token 用量。">
      <ModelCredentialSettings />
    </AppShell>
  );
}
