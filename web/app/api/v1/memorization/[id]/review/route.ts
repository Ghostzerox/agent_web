import { getMemorizationApi } from "@/lib/api/memorizationApi";
import { withModelOperation } from "@/lib/ai/server/operationContext";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/v1/memorization/[id]/review">,
) {
  const { id } = await context.params;
  return withModelOperation(request, () => getMemorizationApi().review(id, request));
}
