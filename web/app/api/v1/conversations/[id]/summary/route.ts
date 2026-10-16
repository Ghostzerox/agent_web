import { getConversationSummaryApi } from "@/lib/api/conversationSummaryApi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ id: string }> }) { return getConversationSummaryApi().handle(request, (await context.params).id); }
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
