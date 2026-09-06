'use client';

import { useParams } from 'next/navigation';
import { Providers } from '../../../../components/Providers';
import { AppShell } from '../../../../components/AppShell';
import MarketDetail from '../../../../components/MarketDetail';

export default function MarketPage() {
  const params = useParams();
  const marketId = Array.isArray(params?.market) ? params.market[0] : params?.market;

  return <Providers><AppShell><MarketDetail marketId={marketId} /></AppShell></Providers>;
}
