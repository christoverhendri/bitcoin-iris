'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface DrawerState {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const DrawerCtx = createContext<DrawerState>({ open: false, setOpen: () => {} });
export const useDrawer = () => useContext(DrawerCtx);

/**
 * Fixed-height terminal shell with horizontal navigation and a scrolling workspace.
 * Retains the drawer context for components that still consume that interface.
 */
export function AppShell({ children }: { children: ReactNode }) {
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
      <div className="terminal-shell">
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', overflow: 'hidden' }}>
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
