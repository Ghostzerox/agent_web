import { getGameAssetDesignApi } from "@/lib/api/gameAssetDesignApi";
import { withModelOperation } from "@/lib/ai/server/operationContext";
async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const path = (await params).path;
  return withModelOperation(request, () => getGameAssetDesignApi()(request, path));
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
