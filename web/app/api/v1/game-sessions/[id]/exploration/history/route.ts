import { getGamePlayApi } from "@/lib/api/gamePlayApi";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return getGamePlayApi().searchHistory(id, request);
}
