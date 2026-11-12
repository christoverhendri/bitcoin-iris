'use client';

import { PanelStrip, StatTile } from '@/components/primitives';
import { useLivePerp } from '@/lib/live/perpTicker';
import { fmtCompact, fmtPct, fmtUsd } from '@/lib/format';
import { signTone } from '@/lib/theme/tokens';

/**
 * Live perpetual funding, open interest and basis from Hyperliquid's socket.
 * Renders nothing until the first frame, so a blocked network or a dropped
 * socket leaves the page exactly as the server rendered it.
 */
export function LivePerp() {
  const p = useLivePerp();
  if (!p) return null;
  const funding8h = p.fundingHourly * 8 * 100;
  const annual = p.fundingHourly * 24 * 365 * 100;
  const basis = ((p.markPx - p.oraclePx) / p.oraclePx) * 100;
  return (
    <PanelStrip min={180}>
      <StatTile label="LIVE FUNDING (8H EQ.)" value={fmtPct(funding8h, true, 4)} tone={signTone(p.fundingHourly)} detail={`${fmtPct(annual, true, 1)} annualized · Hyperliquid`} />
      <StatTile label="LIVE OPEN INTEREST" value={`${fmtUsd(p.openInterestBtc).split('.')[0]} BTC`} detail={`≈ ${fmtCompact(p.openInterestBtc * p.markPx)}`} />
      <StatTile label="LIVE MARK" value={`$${fmtUsd(p.markPx)}`} detail={`oracle $${fmtUsd(p.oraclePx)}`} />
      <StatTile label="LIVE BASIS" value={fmtPct(basis, true, 3)} tone={signTone(basis)} detail="mark vs oracle" />
    </PanelStrip>
  );
}
