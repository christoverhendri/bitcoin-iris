import type { CSSProperties, ReactNode } from 'react';

/**
 * A panel surface. No radius, no shadow — depth comes from the surface ramp
 * (bg #08090c -> sunk #0b0d11 -> panel #0e1014) and 1px hairlines.
 */
export function Panel({
  children,
  style,
  className,
  scroll,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** Make the panel body scroll instead of growing the shell. */
  scroll?: boolean;
}) {
  return (
    <div
      className={['iris-panel', className].filter(Boolean).join(' ')}
      style={{
        background: 'var(--panel)',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        ...(scroll ? { overflow: 'hidden' } : null),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The signature layout trick from the original: a grid whose 1px gap is filled
 * by the line colour, so the gutter *is* the border. No double borders, and
 * every divider lines up across the whole page for free.
 */
export function PanelGrid({
  children,
  columns,
  rows,
  style,
  className,
}: {
  children: ReactNode;
  /** e.g. `minmax(0,1fr) minmax(230px,290px)` */
  columns?: string;
  rows?: string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gap: 1,
        background: 'var(--line)',
        gridTemplateColumns: columns,
        gridTemplateRows: rows,
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Auto-fitting strip of cards (KPI row, stat strip). */
export function PanelStrip({
  children,
  min = 230,
  style,
}: {
  children: ReactNode;
  min?: number;
  style?: CSSProperties;
}) {
  return (
    <PanelGrid
      columns={`repeat(auto-fit, minmax(${min}px, 1fr))`}
      style={style}
    >
      {children}
    </PanelGrid>
  );
}
