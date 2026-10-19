import { getGameWorldApi } from "@/lib/api/gameWorldApi";

async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return getGameWorldApi()(request, (await params).path);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
