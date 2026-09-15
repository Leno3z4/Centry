import { CIRCLE_GATEWAY_TESTNET_API, GATEWAY_TESTNET_CHAINS } from '../../../../../constants/circleGateway';

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));
}

function decimal(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const depositor = body?.depositor;

    if (!isEvmAddress(depositor)) {
      return Response.json({ success: false, error: 'A valid EVM wallet address is required.' }, { status: 400 });
    }

    const response = await fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/balances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'USDC',
        sources: GATEWAY_TESTNET_CHAINS.map(({ domain }) => ({ domain, depositor })),
      }),
      cache: 'no-store',
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      return Response.json(
        { success: false, error: json?.message || json?.error || `Circle Gateway returned HTTP ${response.status}.` },
        { status: response.status },
      );
    }

    const balances = Array.isArray(json?.balances) ? json.balances : [];
    const normalized = GATEWAY_TESTNET_CHAINS.map((chain) => {
      const match = balances.find((item) => Number(item?.domain) === chain.domain);
      const finalized = decimal(match?.balance);
      const pending = decimal(match?.pendingBalance ?? match?.pending);
      return {
        ...chain,
        balance: finalized.toFixed(6),
        pendingBalance: pending.toFixed(6),
        spendable: finalized > 0,
      };
    });

    const total = normalized.reduce((sum, chain) => sum + decimal(chain.balance), 0);
    const pendingTotal = normalized.reduce((sum, chain) => sum + decimal(chain.pendingBalance), 0);

    return Response.json({
      success: true,
      depositor,
      balances: normalized,
      total: total.toFixed(6),
      pendingTotal: pendingTotal.toFixed(6),
      hasPending: pendingTotal > 0,
    }, { status: 200 });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Unable to query Circle Gateway.' }, { status: 500 });
  }
}
