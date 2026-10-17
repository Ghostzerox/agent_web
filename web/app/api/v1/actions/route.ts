import { getActionApi } from "@/lib/api/actionApi";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) { return getActionApi().handle(request); }
export function POST(request: Request) { return getActionApi().handle(request); }
