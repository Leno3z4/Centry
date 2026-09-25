import { getProtocolAnalytics } from "../../../lib/agentStore";

export async function GET(request) {
  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") || 7);
  const days = Math.max(1, Math.min(90, Number.isFinite(requestedDays) ? requestedDays : 7));

  try {
    const analytics = await getProtocolAnalytics(days);
    return Response.json(
      {
        ...analytics,
        generatedAt: new Date().toISOString(),
        source: "Centry indexed onchain events",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "analytics_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
