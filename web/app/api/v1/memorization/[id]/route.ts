import { getMemorizationApi } from "@/lib/api/memorizationApi";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: RouteContext<"/api/v1/memorization/[id]">) {
  const { id } = await context.params;
  return getMemorizationApi().update(id, request);
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/v1/memorization/[id]">,
) {
  const { id } = await context.params;
  return getMemorizationApi().get(id);
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/v1/memorization/[id]">,
) {
  const { id } = await context.params;
  return getMemorizationApi().delete(id, request);
}
