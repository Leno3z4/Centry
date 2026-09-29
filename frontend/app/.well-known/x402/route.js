import { circleX402Discovery, circleX402Enabled } from '../../../lib/circleAgentX402';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!circleX402Enabled()) {
    return Response.json(
      { error: 'agent_services_disabled' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const origin = new URL(request.url).origin;
  return Response.json(circleX402Discovery({
    baseUrl: process.env.CENTRY_AGENT_SERVICE_BASE_URL || origin,
  }), {
    headers: {
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
