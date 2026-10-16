import { getMemoryPalaceApi } from "@/lib/api/memoryPalaceApi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) { return getMemoryPalaceApi().handle(request, (await context.params).path ?? []); }
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
