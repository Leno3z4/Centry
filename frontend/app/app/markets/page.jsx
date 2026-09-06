'use client';

import { Providers } from '../../../components/Providers';
import { AppShell } from '../../../components/AppShell';
import MarketDirectory from '../../../components/MarketDirectory';

export default function MarketsPage() {
  return <Providers><AppShell><MarketDirectory /></AppShell></Providers>;
}
