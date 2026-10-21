import { getConversationSummaryApi } from "@/lib/api/conversationSummaryApi";
import { withModelOperation } from "@/lib/ai/server/operationContext";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = (await context.params).id;
  return withModelOperation(request, () => getConversationSummaryApi().handle(request, id));
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
