import Link from 'next/link';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { GeoEvent } from '@/lib/features/geopoliticalEvents';
import { fmtAgo } from '@/lib/format';
import { softCase } from '@/lib/softCase';

const DAY = 86_400_000;

const toneColor = (s: GeoEvent['sentiment']) =>
  s === 'positive' ? 'var(--accent)' : s === 'negative' ? '#e8d5c4' : '#7a5338';
const toneWord = (s: GeoEvent['sentiment']) => (s === 'positive' ? 'Positive' : s === 'negative' ? 'Negative' : 'Neutral');

/**
 * The Overview's view of the world: every event of the 24 hours up to the
 * newest one as a dot on a time strip, and the latest few as a list. The window
 * is anchored on the newest event (as the Sentiment strip does), not the render
 * clock. The full interactive globe lives on the Sentiment page.
 */
export function WorldEventsCard({ events }: { events: Envelope<GeoEvent[]> }) {
  const ref = events.data.length ? Math.max(...events.data.map((e) => e.publishedAt)) : 0;
  const recent = events.data
    .filter((e) => ref - e.publishedAt <= DAY)
    .sort((a, b) => b.publishedAt - a.publishedAt);
  const latest = (recent.length ? recent : [...events.data].sort((a, b) => b.publishedAt - a.publishedAt)).slice(0, 4);

  return (
    <Panel style={{ height: '100%' }}>
      <PanelHeader title="World events, 24h" note={`${recent.length} tracked`} right={<MockBadge env={events} />} />
      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          role="img"
          aria-label={`${recent.length} events in the last 24 hours`}
          style={{ position: 'relative', height: 56, borderRadius: 14, background: 'var(--sunk)' }}
        >
          {recent.map((e) => {
            const f = 1 - (ref - e.publishedAt) / DAY;
            const size = e.sentiment === 'neutral' ? 8 : 13;
            return (
              <span
                key={e.id}
                title={`${e.headline} · ${e.place}`}
                style={{
                  position: 'absolute',
                  left: `${(4 + f * 92).toFixed(2)}%`,
                  top: '50%',
                  width: size,
                  height: size,
                  margin: -size / 2,
                  borderRadius: '50%',
                  background: toneColor(e.sentiment),
                  opacity: 0.9,
                  boxShadow: e.sentiment === 'positive' ? '0 0 14px color-mix(in srgb, var(--accent) 60%, transparent)' : undefined,
                }}
              />
            );
          })}
          <span
            className="iris-pulse"
            style={{ position: 'absolute', right: 10, top: '50%', width: 10, height: 10, marginTop: -5, borderRadius: '50%', background: '#ffd2ae' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dim)', marginTop: -10 }}>
          <span>24 jam sebelumnya</span>
          <span>Terbaru</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -12px' }}>
          {latest.map((e) => (
            <a
              key={e.id}
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ember-row"
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 12px', color: 'var(--txt)' }}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 15, lineHeight: 1.35 }}>{e.headline}</span>
                <span style={{ fontSize: 13, color: 'var(--dim)' }}>
                  {e.place} · {softCase(e.category.replace('_', ' '))} · {fmtAgo(new Date(e.publishedAt).toISOString())}
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: e.sentiment === 'positive' ? '#ffb27a' : e.sentiment === 'negative' ? 'var(--down)' : 'var(--dim)' }}>
                {toneWord(e.sentiment)}
              </span>
            </a>
          ))}
        </div>
        <Link href="/sentiment" style={{ fontSize: 14, fontWeight: 600 }}>
          Open the globe →
        </Link>
      </div>
      <SourceFootnote env={events} />
    </Panel>
  );
}
