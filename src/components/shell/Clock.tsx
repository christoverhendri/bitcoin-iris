'use client';

import { useEffect, useState } from 'react';

/**
 * The live UTC clock in the top bar. UTC because every timestamp in the
 * terminal (candle closes, worker schedules, releases) is stated in UTC.
 *
 * Renders a placeholder on the server and fills in after mount — the time
 * differs between server and client by definition, so rendering it during SSR
 * would be a guaranteed hydration mismatch.
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
          timeZone: 'UTC',
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      suppressHydrationWarning
      style={{ fontSize: 14, color: '#a8968a', minWidth: 96, display: 'inline-block', textAlign: 'right' }}
    >
      {time ?? '--:--:--'} UTC
    </span>
  );
}
