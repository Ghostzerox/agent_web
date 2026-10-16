import { getConversationApi } from "@/lib/api/conversationApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: ConversationRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getConversationApi().get(id);
}

export async function DELETE(
  request: Request,
  context: ConversationRouteContext,
): Promise<Response> {
  const { id } = await context.params;
  return getConversationApi().delete(id, request);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return getConversationApi().update(id, request);
}
