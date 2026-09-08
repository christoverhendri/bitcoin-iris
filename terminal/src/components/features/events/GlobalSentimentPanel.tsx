'use client';

import { Suspense, use, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useQueryState } from 'nuqs';
import { Panel, PanelHeader, MockBadge, SourceFootnote } from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { EventCategory, GeoEvent } from '@/lib/features/geopoliticalEvents';
import type { NewsArticle } from '@/lib/features/news';
import { ArchiveMore } from '../news/ArchiveMore';
import { useLiveNews } from '../news/useLiveNews';
import { NewsRefreshStatus } from '../news/NewsRefreshStatus';
import { WorldMap, type DetailPayload } from './WorldMap';
import { EventNewsRail } from './EventNewsRail';
import { EventDetail } from './EventDetail';
import { EventLayerToggle } from './EventLayerToggle';

const GlobeMap = dynamic(() => import('./GlobeMap').then((mod) => mod.GlobeMap), {
  loading: () => <div role="status" style={{ minHeight: 460, padding: 16 }}>Loading 3D map…</div>,
});

export interface GlobalSentimentPanelProps {
  events: Envelope<GeoEvent[]>;
  news: Envelope<NewsArticle[]>;
  flowData?: Promise<Envelope<GeoEvent[]>>;
}

function FlowMarkers({ data, onResolve }: { data: Promise<Envelope<GeoEvent[]>>; onResolve: (events: GeoEvent[]) => void }) {
  const result = use(data);
  useEffect(() => {
    onResolve(result.isMock ? [] : result.data);
  }, [result, onResolve]);
  return <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
    {result.isMock ? 'On-chain unavailable' : `${result.data.length} on-chain events`}
    <MockBadge env={result} />
  </span>;
}

export function GlobalSentimentPanel({ events: baseEvents, news: initialNews, flowData }: GlobalSentimentPanelProps) {
  const liveNews = useLiveNews(initialNews);
  const { news } = liveNews;
  const [flows, setFlows] = useState<GeoEvent[]>([]);
  const events = { ...baseEvents, data: [...baseEvents.data, ...flows] };
  const [cats] = useQueryState('cats', { defaultValue: 'ALL', shallow: true });
  const activeCats = cats === 'ALL' || !cats
    ? null : new Set(cats.split(',').filter(Boolean) as EventCategory[]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [view, setView] = useState<'globe' | 'flat'>('flat');

  return (
    <Panel style={{ display: 'flex', flexDirection: 'column', minHeight: 460 }}>
      <PanelHeader
        title="GLOBAL EVENT MAP"
        note="CRYPTO · MACRO · GEOPOLITICAL"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {([
                ['globe', '3D'],
                ['flat', '2D'],
              ] as const).map(([v, lbl]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    letterSpacing: '.1em',
                    padding: '3px 8px',
                    border: '1px solid var(--line2)',
                    background: view === v ? '#1b2430' : 'transparent',
                    color: view === v ? 'var(--txt)' : 'var(--mut)',
                    cursor: 'pointer',
                  }}
                >
                  {lbl}
                </button>
              ))}
            </div>
            {events.isMock && <span role="status" style={{ color: 'var(--amber)', fontSize: 10 }}>NEWS EVENTS UNAVAILABLE</span>}
          </div>
        }
      />

      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--sunk)',
        }}
      >
        {flowData && <div style={{ color: 'var(--mut)', fontSize: 10, marginBottom: 6 }}>
          <Suspense fallback={<span role="status">Loading on-chain markers…</span>}>
            <FlowMarkers data={flowData} onResolve={setFlows} />
          </Suspense>
        </div>}
        <Suspense fallback={null}>
          <EventLayerToggle />
        </Suspense>
      </div>

      <div className="sentiment-workspace" style={{ gap: 1, background: 'var(--line)' }}>
        <div
          style={{
            flex: '2 1 560px',
            minWidth: 0,
            position: 'relative',
            background: 'var(--panel)',
          }}
        >
          {view === 'globe' ? (
            <GlobeMap
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
            flex: '1 1 300px',
            minWidth: 0,
            height: 440,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--panel)',
          }}
        >
          <div style={{ flexShrink: 0 }}>
            <NewsRefreshStatus {...liveNews} />
            <ArchiveMore {...liveNews} />
          </div>
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

      {events.isMock
        ? <div role="status" className="iris-micro" style={{ padding: '7px 12px', color: 'var(--mut)', borderTop: '1px solid var(--line)' }}>No verified news events are available. On-chain events are reported separately.</div>
        : <SourceFootnote env={events} />}
    </Panel>
  );
}
