import type { ReactNode } from 'react';
import { softCase } from '@/lib/softCase';

/** The panel title idiom: an 18px semibold title, a quiet note beside it. */
export function PanelHeader({
  title,
  right,
  note,
}: {
  title: string;
  /** Badges or controls pinned to the right edge (MockBadge, filters). */
  right?: ReactNode;
  /** Secondary label rendered next to the title in --dim. */
  note?: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 4,
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '24px 26px 10px',
        flexWrap: 'wrap',
      }}
    >
      <h2 className="t-title" style={{ margin: 0, fontSize: 18, color: 'var(--txt)' }}>
        {softCase(title)}
      </h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {note ? <span style={{ fontSize: 13, color: 'var(--dim)' }}>{softCase(note)}</span> : null}
        {right}
      </div>
    </div>
  );
}
