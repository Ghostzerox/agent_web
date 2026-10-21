import { getModelApi } from "@/lib/api/modelApi";
import { withModelOperation } from "@/lib/ai/server/operationContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return withModelOperation(request, () => getModelApi().stream(request));
}
