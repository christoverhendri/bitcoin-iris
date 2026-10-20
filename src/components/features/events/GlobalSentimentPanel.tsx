'use client';

import { Suspense, useState } from 'react';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import type { NewsArticle } from '@/lib/features/news';
import { WorldMap, type DetailPayload } from './WorldMap';
import { EmberGlobe } from './EmberGlobe';
import { EventNewsRail } from './EventNewsRail';
import { EventDetail } from './EventDetail';
import { EventLayerToggle } from './EventLayerToggle';

export interface GlobalSentimentPanelProps {
  events: Envelope<GeoEvent[]>;
  news: Envelope<NewsArticle[]>;
  activeCats: Set<EventCategory> | null;
}

export function GlobalSentimentPanel({ events, news, activeCats }: GlobalSentimentPanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [view, setView] = useState<'globe' | 'flat'>('globe');

  return (
    <Panel still style={{ display: 'flex', flexDirection: 'column', minHeight: 460 }}>
      <PanelHeader
        title="World events"
        note={`${events.data.length} events · crypto, macro, geopolitical`}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="seg" role="group" aria-label="Map view">
              {([
                ['globe', 'Globe'],
                ['flat', 'Map'],
              ] as const).map(([v, lbl]) => (
                <button key={v} type="button" className="seg-btn" onClick={() => setView(v)} aria-pressed={view === v}>
                  {lbl}
                </button>
              ))}
            </div>
            <MockBadge env={events} />
          </div>
        }
      />

      <div style={{ position: 'relative', zIndex: 4, padding: '4px 26px 14px' }}>
        <Suspense fallback={null}>
          <EventLayerToggle />
        </Suspense>
      </div>

      <div style={{ position: 'relative', zIndex: 4, display: 'flex', flexWrap: 'wrap', gap: 20, padding: '0 22px 22px' }}>
        <div
          style={{
            flex: '999 1 560px',
            minWidth: 0,
            position: 'relative',
            aspectRatio: '1 / 1',
            maxHeight: 700,
            minHeight: 440,
            borderRadius: 24,
            overflow: 'hidden',
            background: '#0d0907',
          }}
        >
          {view === 'globe' ? (
            <EmberGlobe
              events={events.data}
              activeCats={activeCats}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              onOpenDetail={setDetail}
            />
          ) : (
            <WorldMap
              events={events.data}
              activeCats={activeCats}
              selectedKey={selectedKey}
              onSelectKey={setSelectedKey}
              onOpenDetail={setDetail}
            />
          )}
          {detail ? (
            <EventDetail
              detail={detail}
              onClose={() => {
                setDetail(null);
                setSelectedKey(null);
              }}
              onPick={(e) => {
                setDetail({ kind: 'event', event: e });
                setSelectedKey(e.id);
              }}
            />
          ) : null}
        </div>

        <div
          style={{
            flex: '1 1 340px',
            minWidth: 0,
            maxHeight: 700,
            borderRadius: 24,
            overflow: 'hidden',
          }}
          className="iris-inset"
        >
          <EventNewsRail
            events={events.data}
            news={news.data}
            activeCats={activeCats}
            selectedKey={selectedKey}
            onSelectKey={setSelectedKey}
            onOpenDetail={setDetail}
          />
        </div>
      </div>

      <SourceFootnote env={events} />
    </Panel>
  );
}
