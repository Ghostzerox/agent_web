import { getGameDrawApi } from "@/lib/api/gameDrawApi";
async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return getGameDrawApi()(request, (await params).path);
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
