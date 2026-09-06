import type { ReactNode } from 'react';

/** 9px mono, .16em tracking, 1px bottom hairline. The panel title idiom. */
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '5px 8px',
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--line)',
        minHeight: 27,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, rowGap: 2, minWidth: 0 }}>
        <span
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.02em',
            color: 'var(--amber)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </span>
        {note ? (
          <span
            className="iris-micro"
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '0',
              color: 'var(--mut)',
            }}
          >
            {note}
          </span>
        ) : null}
      </div>
      {right ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{right}</div> : null}
    </div>
  );
}
