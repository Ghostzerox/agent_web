import { getGameEventDesignApi } from "@/lib/api/gameEventDesignApi";
async function handle(request: Request, { params }: { params: Promise<{ path?: string[] }> }) { return getGameEventDesignApi()(request, (await params).path); }
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
