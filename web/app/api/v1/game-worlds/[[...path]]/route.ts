import { getGameWorldApi } from "@/lib/api/gameWorldApi";
import { withModelOperation } from "@/lib/ai/server/operationContext";

async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path;
  return withModelOperation(request, () => getGameWorldApi()(request, path));
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
