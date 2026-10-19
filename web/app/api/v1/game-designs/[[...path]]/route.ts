import { getGameAssetDesignApi } from "@/lib/api/gameAssetDesignApi";
async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return getGameAssetDesignApi()(request, (await params).path);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
