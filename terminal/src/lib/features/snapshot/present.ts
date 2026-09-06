import { fmtCompact, fmtPct, fmtUsd } from '@/lib/format';
import { type Tone, signTone } from '@/lib/theme/tokens';
import type { BtcSnapshot } from './types';

export interface SnapshotRow {
  label: string;
  value: string;
  tone: Tone;
}

/**
 * Label/format/colour mapping, shared by the live and mock paths so a mocked
 * panel is pixel-identical to a live one apart from the badge.
 */
export function toSnapshotRows(s: BtcSnapshot): SnapshotRow[] {
  return [
    { label: 'LAST', value: fmtUsd(s.last), tone: 'txt' },
    { label: '24H CHG', value: fmtUsd(s.change24hAbs, true), tone: signTone(s.change24hAbs) },
    { label: '24H HIGH', value: fmtUsd(s.high24h), tone: 'txt' },
    { label: '24H LOW', value: fmtUsd(s.low24h), tone: 'txt' },
    { label: '7D', value: fmtPct(s.return7dPct), tone: signTone(s.return7dPct) },
    { label: '30D', value: fmtPct(s.return30dPct), tone: signTone(s.return30dPct) },
    { label: 'VOL 24H', value: fmtCompact(s.volume24hUsd), tone: 'txt' },
    { label: 'MCAP', value: fmtCompact(s.marketCapUsd), tone: 'txt' },
    { label: 'DOMINANCE', value: fmtPct(s.dominancePct, false), tone: 'down' },
    { label: 'REALIZED VOL', value: fmtPct(s.realizedVol30dPct, false), tone: 'amber' },
  ];
}
