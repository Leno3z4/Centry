'use client';

import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import MultiMarketLending from '../../../components/MultiMarketLending';

export default function MarketsPage() {
  return <Providers><AppShell><MultiMarketLending /></AppShell></Providers>;
}
