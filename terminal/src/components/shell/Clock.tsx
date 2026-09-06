'use client';

import { useEffect, useState } from 'react';

/**
 * The live clock in the topbar.
 *
 * Renders an empty placeholder on the server and fills in after mount — the
 * time differs between server and client by definition, so rendering it during
 * SSR would be a guaranteed hydration mismatch.
 */
export function Clock() {
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString('en-GB', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      className="iris-micro"
      suppressHydrationWarning
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 10,
        color: 'var(--mut)',
        minWidth: 62,
        display: 'inline-block',
        textAlign: 'right',
      }}
    >
      {time ?? '--:--:--'}
    </span>
  );
}
