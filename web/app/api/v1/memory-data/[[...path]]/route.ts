import { getMemoryDataApi } from "@/lib/api/memoryDataApi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) { return getMemoryDataApi().handle(request, (await context.params).path ?? []); }
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
