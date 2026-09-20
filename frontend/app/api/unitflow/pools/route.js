import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'legacy_unitflow_v25_pool_surface_disabled_on_mainnet',
      message: 'The legacy V2.5 pool registry is testnet-specific. Mainnet pool browsing and liquidity actions have not been wired to the deployed UnitFlow V3 contracts.',
    },
    { status: 410 },
  );
}
