import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: 'legacy_unitflow_v25_pool_quotes_disabled_on_mainnet',
      message: 'The legacy V2.5 pool quote surface is disabled on Arc Mainnet. Use the main Centry swap flow powered by UnitFlow V3.',
    },
    { status: 410 },
  );
}
