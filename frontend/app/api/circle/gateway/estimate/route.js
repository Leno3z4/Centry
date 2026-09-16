import { CIRCLE_GATEWAY_TESTNET_API } from '../../../../../constants/circleGateway';

export async function POST(request) {
  try {
    const body = await request.json();
    const specs = Array.isArray(body?.specs) ? body.specs : body?.spec ? [body.spec] : [];
    if (!specs.length) return Response.json({ success: false, error: 'At least one Gateway transfer spec is required.' }, { status: 400 });

    const response = await fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(specs.map((spec) => ({ spec }))),
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return Response.json({ success: false, error: json?.message || json?.error || `Circle Gateway returned HTTP ${response.status}.` }, { status: response.status });

    const estimates = Array.isArray(json?.body)
      ? json.body.map((item) => item?.burnIntent).filter(Boolean)
      : [];
    if (estimates.length !== specs.length) return Response.json({ success: false, error: 'Circle Gateway did not return a usable estimate for every transfer intent.' }, { status: 502 });

    return Response.json({ success: true, estimates, fees: json?.fees || null }, { status: 200 });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Unable to estimate Gateway transfer fees.' }, { status: 500 });
  }
}
