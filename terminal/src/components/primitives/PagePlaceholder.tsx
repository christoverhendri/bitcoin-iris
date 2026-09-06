import { Panel, PanelGrid, PanelHeader } from './index';

/**
 * Phase 0 scaffolding: renders a page's planned panels as empty, correctly
 * headed surfaces so the layout can be verified against the original before any
 * data exists. Each panel is replaced by its real component in Phase 2.
 */
export function PagePlaceholder({ panels }: { panels: string[] }) {
  return (
    <PanelGrid
      columns="repeat(auto-fit, minmax(300px, 1fr))"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      {panels.map((title) => (
        <Panel key={title} style={{ minHeight: 180 }}>
          <PanelHeader title={title} note="PENDING" />
          <div
            className="iris-micro"
            style={{
              flex: 1,
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 9,
              letterSpacing: '.16em',
              color: 'var(--dim)',
              padding: 24,
            }}
          >
            NOT WIRED YET
          </div>
        </Panel>
      ))}
    </PanelGrid>
  );
}
