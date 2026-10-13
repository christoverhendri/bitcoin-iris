'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { TimeframePills } from '@/components/shell/TimeframePills';

export function OverviewPriceWidget({price, technicals}: {price: ReactNode; technicals: ReactNode}) {
  const [tab,setTab] = useState<'price'|'technicals'>('price');
  return <div className="overview-chart">
    <div className="overview-chart-tabs" role="tablist" aria-label="Overview market data">
      <button role="tab" aria-selected={tab==='price'} aria-controls="overview-chart-price" id="overview-price-tab" onClick={() => setTab('price')}>Price action</button>
      <button role="tab" aria-selected={tab==='technicals'} aria-controls="overview-chart-technicals" id="overview-technicals-tab" onClick={() => setTab('technicals')}>Technicals</button>
      <Link href="/chain/derivatives" prefetch={false}>Derivatives</Link><Link href="/market/price" prefetch={false}>Open chart</Link>
    </div>
    <div className="overview-chart-timeframes"><TimeframePills /></div>
    <div role="tabpanel" id={`overview-chart-${tab}`} aria-labelledby={`overview-${tab==='price'?'price':'technicals'}-tab`}>{tab==='price'?price:technicals}</div>
  </div>;
}
