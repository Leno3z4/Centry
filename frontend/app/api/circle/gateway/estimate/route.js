import { CIRCLE_GATEWAY_TESTNET_API } from '../../../../../constants/circleGateway';

export async function POST(request) {
  try {
    const body = await request.json();
    const spec = body?.spec;
    if (!spec) return Response.json({ success: false, error: 'A Gateway transfer spec is required.' }, { status: 400 });

    const response = await fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/estimate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ spec }]),
      cache: 'no-store',
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) return Response.json({ success: false, error: json?.message || json?.error || `Circle Gateway returned HTTP ${response.status}.` }, { status: response.status });

    const estimate = json?.body?.[0]?.burnIntent || json?.burnIntent;
    if (!estimate?.maxFee || !estimate?.maxBlockHeight) return Response.json({ success: false, error: 'Circle Gateway did not return a usable transfer estimate.' }, { status: 502 });

    return Response.json({ success: true, burnIntent: estimate }, { status: 200 });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Unable to estimate Gateway transfer fees.' }, { status: 500 });
  }
}
