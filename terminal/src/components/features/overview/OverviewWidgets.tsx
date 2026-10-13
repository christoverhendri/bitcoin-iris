import Link from 'next/link';
import type { Envelope } from '@/lib/envelope';
import type { ChainNetworkData } from '@/lib/features/chainNetwork';
import type { ChainFlowsData } from '@/lib/features/chainFlows';
import type { MacroMetric } from '@/lib/features/macroCountry';
import { Panel, PanelHeader, KeyValueRow, MockBadge, SourceFootnote } from '@/components/primitives';
import { fmtUsd, fmtPct } from '@/lib/format';
import { SOURCES } from '@/lib/sources';

export function OverviewChain({network, flows}: {network: Envelope<ChainNetworkData>; flows: Envelope<ChainFlowsData>}) {
  return <div className="overview-chain-stack"><Panel><PanelHeader title="ON-CHAIN INTELLIGENCE" right={<><MockBadge env={network} /><Link href="/chain/network" prefetch={false}>View all</Link></>} />
    <KeyValueRow label="Hash rate" value={`${network.data.hashrate.currentEhs.toFixed(1)} EH/s`} />
    <KeyValueRow label="Hash rate change" value={fmtPct(network.data.hashrate.changePct)} />
    <KeyValueRow label="Mempool transactions" value={network.data.mempool.txCount.toLocaleString('en-US')} />
    <KeyValueRow label="Blocks / 24h" value={network.data.blocks24h?.toLocaleString('en-US') ?? '—'} />
    <SourceFootnote env={network} /></Panel>
    <Panel><PanelHeader title="EXCHANGE FLOWS" right={<><MockBadge env={flows} /><Link href="/chain/flows" prefetch={false}>View all</Link></>} />
    <KeyValueRow label="Observed net deposits" value={`${flows.data.netflowBtc.toLocaleString('en-US',{maximumFractionDigits:2})} BTC`} />
    <KeyValueRow label="Tracked reserve · subset" value={`${flows.data.trackedReserveBtc.toLocaleString('en-US',{maximumFractionDigits:0})} BTC`} />
    <KeyValueRow label="Tracked exchanges" value={String(flows.data.exchangeCount)} />
    <SourceFootnote env={flows} /></Panel></div>;
}

export function OverviewMacro({macro}: {macro: Envelope<MacroMetric[]>}) {
  const us = macro.data.find((m) => m.country === 'US') ?? macro.data[0];
  return <Panel><PanelHeader title="MACRO SNAPSHOT · US" right={<><MockBadge env={macro} /><Link href="/macro/data?country=US" prefetch={false}>View details</Link></>} />
    {us ? <><KeyValueRow label="CPI index" value={fmtUsd(us.cpi)} /><KeyValueRow label="Policy rate" value={`${us.rate.toFixed(2)}%`} /><KeyValueRow label="GDP growth" value={fmtPct(us.growth)} /><KeyValueRow label="Inflation" value={`${us.inflation.toFixed(2)}%`} /></> : <p className="dashboard-empty">Macro observations unavailable.</p>}
    <SourceFootnote env={macro} /></Panel>;
}

export function SourceInspector() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Panel><PanelHeader title="SOURCE INSPECTOR" note="DEV ONLY" />
    <p className="source-inspector-note">Configured providers · availability is determined by each panel.</p>
    {SOURCES.filter((s) => ['coinbase','derivatives','mempool_space','fred','rss'].includes(s.key)).map((s) => <KeyValueRow key={s.key} label={s.displayName} value={s.requiresKey ? 'KEY REQUIRED' : 'KEYLESS'} tone="blue" />)}
  </Panel>;
}
