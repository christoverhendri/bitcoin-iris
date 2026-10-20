import type { CSSProperties, ReactNode } from 'react';

/**
 * A panel surface: a solid warm card whose edge catches the accent light (see
 * `.iris-card` / `.iris-panel` in globals.css). It lifts a little on hover and
 * a band of light sweeps across it. `still` keeps it from moving, for panels
 * that hold something the visitor drags.
 */
export function Panel({
  children,
  style,
  className,
  scroll,
  still,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  /** Make the panel body scroll instead of growing the shell. */
  scroll?: boolean;
  /** No hover lift or sheen. */
  still?: boolean;
}) {
  return (
    <div
      className={`iris-card iris-panel${still ? ' still' : ''}${className ? ` ${className}` : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: scroll ? 'hidden' : 'clip',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A grid of cards with an even gutter. (It used to be a 1px grid whose gap was
 * filled with the line colour so the gutter was the border. Cards now carry
 * their own edge, so the gutter is just space.)
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
        gap: 20,
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
