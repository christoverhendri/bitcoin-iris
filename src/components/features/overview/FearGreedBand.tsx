import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { FearGreedData } from '@/lib/features/fearGreed';

export interface FearGreedBandProps {
  fearGreed: Envelope<FearGreedData>;
}

const WORD: Record<FearGreedData['classification'], string> = {
  'Extreme Fear': 'Extreme fear',
  Fear: 'Fear',
  Neutral: 'Neutral',
  Greed: 'Greed',
  'Extreme Greed': 'Extreme greed',
};

/**
 * The alternative.me index as a half-dial: the arc fills to today's value and
 * a light dot sits at its end. The change line is the index's own move versus
 * yesterday, as the source reports it.
 */
export function FearGreedCard({ fearGreed }: FearGreedBandProps) {
  const fg = fearGreed.data;
  const v = Math.max(0, Math.min(100, fg.value));
  const greedy = fg.classification === 'Greed' || fg.classification === 'Extreme Greed';
  // The dot at the end of the arc: 0 at the left end, 100 at the right.
  const a = Math.PI * (1 - v / 100);
  const dx = 80 + 70 * Math.cos(a);
  const dy = 82 - 70 * Math.sin(a);
  const up = fg.changePct >= 0;

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="Fear & greed" right={<MockBadge env={fearGreed} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '0 22px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          <svg width="100%" viewBox="0 0 160 92" role="img" aria-label={`Fear and Greed index ${fg.value}, ${WORD[fg.classification]}`}>
            <path d="M10 82 A70 70 0 0 1 150 82" fill="none" stroke="var(--line2)" strokeWidth={10} strokeLinecap="round" />
            <path
              d="M10 82 A70 70 0 0 1 150 82"
              fill="none"
              stroke={greedy ? 'var(--accent)' : '#b8663a'}
              strokeWidth={10}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${v} 100`}
              style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 55%, transparent))' }}
            />
            <circle cx={dx} cy={dy} r={6} fill="#ffd2ae" />
          </svg>
          <span
            className="t-display"
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, textAlign: 'center', fontSize: 34 }}
          >
            {fg.value}
          </span>
        </div>
        <span style={{ fontSize: 14, textAlign: 'center', color: '#e9ddd2' }}>
          {WORD[fg.classification]},{' '}
          <span style={{ color: up ? '#ffb27a' : 'var(--down)' }}>
            {up ? '+' : ''}
            {fg.changePct.toFixed(1)}%
          </span>{' '}
          vs yesterday
        </span>
      </div>
      <SourceFootnote env={fearGreed} />
    </Panel>
  );
}
