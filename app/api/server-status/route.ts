import { getPublicServerStatuses } from "../../lib/server-status";

export async function GET() {
  return Response.json(
    { servers: getPublicServerStatuses(), generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=300" } },
  );
}
