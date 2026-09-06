import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { FearGreedData } from '@/lib/features/fearGreed';

export interface FearGreedBandProps {
  fearGreed: Envelope<FearGreedData>;
}

function tone(c: FearGreedData['classification']): string {
  if (c === 'Extreme Greed' || c === 'Greed') return 'var(--up)';
  if (c === 'Extreme Fear' || c === 'Fear') return 'var(--down)';
  return 'var(--txt)';
}

const ZONES = [
  { label: 'EXTREME FEAR', to: 25, color: 'var(--down)' },
  { label: 'FEAR', to: 45, color: 'var(--amber)' },
  { label: 'NEUTRAL', to: 55, color: 'var(--mut)' },
  { label: 'GREED', to: 75, color: 'var(--blue)' },
  { label: 'EXTREME GREED', to: 100, color: 'var(--up)' },
];

export function FearGreedBand({ fearGreed }: FearGreedBandProps) {
  const fg = fearGreed.data;
  const v = Math.max(0, Math.min(100, fg.value));
  const changeUp = fg.changePct >= 0;

  return (
    <Panel>
      <PanelHeader
        title="FEAR & GREED"
        note="alternative.me · 0 = fear · 100 = greed"
        right={<MockBadge env={fearGreed} />}
      />
      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 26,
              fontWeight: 700,
              color: tone(fg.classification),
              lineHeight: 1,
            }}
          >
            {fg.value}
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 11,
              letterSpacing: '.14em',
              color: tone(fg.classification),
            }}
          >
            {fg.classification.toUpperCase()}
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: 9,
              color: changeUp ? 'var(--up)' : 'var(--down)',
            }}
          >
            {changeUp ? '+' : ''}
            {fg.changePct.toFixed(1)}% 24h
          </span>
        </div>

        {/* scale */}
        <div style={{ position: 'relative', height: 8, display: 'flex', gap: 1 }}>
          {ZONES.map((z, i) => {
            const from = i === 0 ? 0 : ZONES[i - 1].to;
            return (
              <div
                key={z.label}
                title={z.label}
                style={{ width: `${z.to - from}%`, background: z.color, opacity: 0.45 }}
              />
            );
          })}
          <div
            style={{
              position: 'absolute',
              left: `${v}%`,
              top: -3,
              width: 2,
              height: 14,
              background: 'var(--txt)',
              transform: 'translateX(-1px)',
            }}
          />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: 'var(--mono)',
            fontSize: 8,
            letterSpacing: '.1em',
            color: 'var(--dim)',
          }}
        >
          <span>0</span>
          <span>25</span>
          <span>50</span>
          <span>75</span>
          <span>100</span>
        </div>
      </div>
      <SourceFootnote env={fearGreed} />
    </Panel>
  );
}
