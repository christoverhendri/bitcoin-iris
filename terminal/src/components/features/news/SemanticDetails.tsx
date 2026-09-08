import type { SemanticNews } from '@/lib/sources/semanticNews';

export function SemanticDetails({ semantic }: { semantic?: SemanticNews }) {
  if (!semantic) return null;
  return <div style={{ fontSize: 10, color: 'var(--mut)', lineHeight: 1.5 }}>
    <div>Semantic rules{semantic.parse.needs_review ? ' · review required' : ''}</div>
    <div>Ranking weight: {semantic.weighting.post_weight.toFixed(4)} · evaluated {new Date(semantic.weighting.as_of).toISOString().slice(0, 16).replace('T', ' ')} UTC</div>
    <div>This weight ranks news relevance and freshness; it does not estimate price impact.</div>
    <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
      {semantic.parse.events.slice(0, 8).map((event, index) => <li key={index}>
        {event.event_type.replaceAll('_', ' ')} · {event.polarity} · {event.modality}
        <blockquote style={{ margin: '2px 0', whiteSpace: 'pre-wrap' }}>{event.evidence.text}</blockquote>
      </li>)}
    </ul>
    {!semantic.parse.events.length && <div>No supported event was extracted.</div>}
  </div>;
}
