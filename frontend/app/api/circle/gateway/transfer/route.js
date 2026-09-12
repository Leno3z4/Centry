import { CIRCLE_GATEWAY_TESTNET_API } from '../../../../../constants/circleGateway';

export async function POST(request) {
  try {
    const body = await request.json();
    const burnIntent = body?.burnIntent;
    const signature = body?.signature;

    if (!burnIntent?.spec || !signature) {
      return Response.json({ success: false, error: 'A signed Gateway burn intent is required.' }, { status: 400 });
    }

    const response = await fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ burnIntent, signature }]),
      cache: 'no-store',
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return Response.json(
        { success: false, error: json?.message || json?.error || `Circle Gateway returned HTTP ${response.status}.` },
        { status: response.status },
      );
    }

    if (!json?.attestation || !json?.signature) {
      return Response.json({ success: false, error: 'Circle Gateway did not return a usable attestation.' }, { status: 502 });
    }

    return Response.json({
      success: true,
      transferId: json.transferId || null,
      attestation: json.attestation,
      signature: json.signature,
      fees: json.fees || null,
      expirationBlock: json.expirationBlock || null,
    }, { status: 200 });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Unable to request a Gateway attestation.' }, { status: 500 });
  }
}
