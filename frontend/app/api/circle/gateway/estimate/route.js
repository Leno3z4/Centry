import { CIRCLE_GATEWAY_TESTNET_API } from '../../../../../constants/circleGateway';
import { rateLimit, rateLimitResponse, withRateLimitHeaders } from '../../../../../lib/rateLimit';

export async function POST(request) {
  const limit = rateLimit(request, 'gateway-estimate', { max: 20, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  try {
    const body = await request.json();
    const specs = Array.isArray(body?.specs) ? body.specs : body?.spec ? [body.spec] : [];
    if (!specs.length) return withRateLimitHeaders(Response.json({ success: false, error: 'At least one Gateway transfer spec is required.' }, { status: 400 }), limit);
    const response = await fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/estimate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(specs.map((spec) => ({ spec }))), cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return withRateLimitHeaders(Response.json({ success: false, error: json?.message || json?.error || `Circle Gateway returned HTTP ${response.status}.` }, { status: response.status }), limit);
    const estimates = Array.isArray(json?.body) ? json.body.map((item) => item?.burnIntent).filter(Boolean) : [];
    if (estimates.length !== specs.length) return withRateLimitHeaders(Response.json({ success: false, error: 'Circle Gateway did not return a usable estimate for every transfer intent.' }, { status: 502 }), limit);
    return withRateLimitHeaders(Response.json({ success: true, estimates, fees: json?.fees || null }, { status: 200 }), limit);
  } catch (error) {
    return withRateLimitHeaders(Response.json({ success: false, error: error?.message || 'Unable to estimate Gateway transfer fees.' }, { status: 500 }), limit);
  }
}
