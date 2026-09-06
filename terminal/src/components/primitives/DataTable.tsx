import type { ReactNode } from 'react';

/**
 * Wraps a table in its own horizontal scroll container so a wide table scrolls
 * inside its panel rather than widening the shell grid. The original had no
 * media queries and would blow out below ~1000px.
 */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', minWidth: 0, maxWidth: '100%' }}>
      <table className="iris-table">{children}</table>
    </div>
  );
}
