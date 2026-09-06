'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface DrawerState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const DrawerCtx = createContext<DrawerState>({ open: false, setOpen: () => {} });
export const useDrawer = () => useContext(DrawerCtx);

/**
 * The app shell: a fixed-height two-column grid, exactly as the original
 * (`grid-template-columns: 198px 1fr; height: 100vh; overflow: hidden`).
 *
 * `--rail` collapses to 0 below 1024px (see globals.css) and the sidebar
 * becomes an overlay drawer instead — the original had no mobile behaviour at all.
 */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // Escape closes it, as any overlay should.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <DrawerCtx.Provider value={{ open, setOpen }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--rail) minmax(0, 1fr)',
          height: '100dvh',
          overflow: 'hidden',
        }}
      >
        {sidebar}
        <div style={{ gridColumn: 2, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
      {open ? (
        <button
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
            zIndex: 40,
          }}
        />
      ) : null}
    </DrawerCtx.Provider>
  );
}
