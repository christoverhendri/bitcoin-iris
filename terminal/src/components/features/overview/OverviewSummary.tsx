import Link from 'next/link';
import type { Envelope } from '@/lib/envelope';
import type { BtcSnapshot } from '@/lib/features/snapshot';
import type { WeeklyForecastData } from '@/lib/features/weeklyForecast';
import type { FearGreedData } from '@/lib/features/fearGreed';
import type { ConfluenceData } from '@/lib/features/confluence';
import { MockBadge, SourceFootnote } from '@/components/primitives';
import { fmtPct, fmtUsd } from '@/lib/format';

export function OverviewSummary({ snapshot, weekly, fear, evidence }: {
  snapshot: Envelope<BtcSnapshot>; weekly: Envelope<WeeklyForecastData>;
  fear: Envelope<FearGreedData>; evidence: Envelope<ConfluenceData>;
}) {
  const score = evidence.data.scores.overall;
  const direction = weekly.data.label;
  const tone = direction === 'BULLISH' ? 'var(--up)' : direction === 'BEARISH' ? 'var(--down)' : 'var(--txt)';
  return <div className="overview-summary">
    <article className="summary-card"><header>BTC / USD <MockBadge env={snapshot} /></header><strong>{fmtUsd(snapshot.data.last)}</strong><p style={{color:snapshot.data.change24hPct >= 0 ? 'var(--up)' : 'var(--down)'}}>{fmtUsd(snapshot.data.change24hAbs)} · {fmtPct(snapshot.data.change24hPct)} <span>(24h)</span></p><SourceFootnote env={snapshot} compact /></article>
    <article className="summary-card"><header>MARKET REGIME <MockBadge env={weekly} /></header><strong className="summary-regime" style={{color:tone}}>{direction}</strong><p>{weekly.data.confidence.toFixed(0)}% rule strength <span>(uncalibrated)</span></p><progress max={100} value={weekly.data.confidence} /><Link href="/forecast/weekly" prefetch={false}>Inspect method</Link></article>
    <article className="summary-card"><header>FEAR & GREED <MockBadge env={fear} /></header><strong style={{color:fear.data.value >= 50 ? 'var(--up)' : 'var(--down)'}}>{fear.data.value}<small>{fear.data.classification}</small></strong><progress className="fear-progress" max={100} value={fear.data.value} /><SourceFootnote env={fear} compact /></article>
    <article className="summary-card"><header>EVIDENCE SCORE <MockBadge env={evidence} /></header><strong>{score.toFixed(0)} <small>/ 100</small></strong><p>Heuristic composite · uncalibrated</p><progress className="evidence-progress" max={100} value={score} /><Link href="/research/confluence" prefetch={false}>Inspect evidence</Link></article>
    <article className="summary-card summary-takeaway"><header>KEY TAKEAWAY</header><p>The rule-based outlook is {direction.toLowerCase()}. Fear & Greed reads {fear.data.classification.toLowerCase()}; the evidence composite is {score.toFixed(0)}/100.</p><Link href="/research/confluence" prefetch={false}>Explore the underlying evidence</Link><small>{weekly.isMock || evidence.isMock ? 'Includes placeholder inputs. Interpret with care.' : 'Research indicators, not a calibrated forecast.'}</small></article>
  </div>;
}
