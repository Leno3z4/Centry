import { CIRCLE_GATEWAY_TESTNET_API, GATEWAY_TESTNET_CHAINS } from '../../../../../constants/circleGateway';

function isEvmAddress(value) { return /^0x[a-fA-F0-9]{40}$/.test(String(value || '')); }
function decimal(value) { const number = Number(value || 0); return Number.isFinite(number) && number >= 0 ? number : 0; }

export async function POST(request) {
  try {
    const body = await request.json();
    const depositor = body?.depositor;
    if (!isEvmAddress(depositor)) return Response.json({ success: false, error: 'A valid EVM wallet address is required.' }, { status: 400 });

    const sources = GATEWAY_TESTNET_CHAINS.map(({ domain }) => ({ domain, depositor }));
    const payload = { token: 'USDC', sources };
    const [balanceResponse, depositResponse] = await Promise.all([
      fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/balances`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' }),
      fetch(`${CIRCLE_GATEWAY_TESTNET_API}/v1/deposits`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' }),
    ]);

    const balancesJson = await balanceResponse.json().catch(() => ({}));
    const depositsJson = await depositResponse.json().catch(() => ({}));
    if (!balanceResponse.ok) return Response.json({ success: false, error: balancesJson?.message || balancesJson?.error || `Circle Gateway returned HTTP ${balanceResponse.status}.` }, { status: balanceResponse.status });
    if (!depositResponse.ok) return Response.json({ success: false, error: depositsJson?.message || depositsJson?.error || `Circle Gateway deposits returned HTTP ${depositResponse.status}.` }, { status: depositResponse.status });

    const balances = Array.isArray(balancesJson?.balances) ? balancesJson.balances : [];
    const pendingDeposits = Array.isArray(depositsJson?.deposits) ? depositsJson.deposits : [];
    const normalized = GATEWAY_TESTNET_CHAINS.map((chain) => {
      const match = balances.find((item) => Number(item?.domain) === chain.domain);
      const finalized = decimal(match?.balance);
      const pending = pendingDeposits.filter((item) => Number(item?.domain) === chain.domain).reduce((sum, item) => sum + decimal(item?.amount), 0);
      return { ...chain, balance: finalized.toFixed(6), pendingBalance: pending.toFixed(6), spendable: finalized > 0, pendingCount: pendingDeposits.filter((item) => Number(item?.domain) === chain.domain).length };
    });

    const total = normalized.reduce((sum, chain) => sum + decimal(chain.balance), 0);
    const pendingTotal = normalized.reduce((sum, chain) => sum + decimal(chain.pendingBalance), 0);

    return Response.json({ success: true, depositor, balances: normalized, total: total.toFixed(6), pendingTotal: pendingTotal.toFixed(6), hasPending: pendingTotal > 0 }, { status: 200 });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'Unable to query Circle Gateway.' }, { status: 500 });
  }
}
