import { getGamePlayApi } from "@/lib/api/gamePlayApi";
import { withModelOperation } from "@/lib/ai/server/operationContext";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withModelOperation(request, () => getGamePlayApi().createTurn(id, request));
}
