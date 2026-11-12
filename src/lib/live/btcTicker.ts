'use client';

import { useSyncExternalStore } from 'react';

/**
 * Live BTC/USDT 24h ticker from Binance's public WebSocket (push, ~1 update/s).
 * One shared socket for the whole tab, opened on first subscriber and closed
 * when the last one leaves. Reconnects with back-off; while it is down the
 * hook returns null and callers keep showing the server-rendered numbers.
 */
export type LiveTicker = {
  last: number;
  open24h: number;
  high24h: number;
  low24h: number;
  /** Quote volume in USD over the rolling 24h. */
  volume24hUsd: number;
  ts: number;
};

// binance.vision is Binance's public market-data mirror (reachable where the main
// host is blocked); the main host is the fallback. Each reconnect tries the next.
const URLS = [
  'wss://data-stream.binance.vision/ws/btcusdt@miniTicker',
  'wss://stream.binance.com:9443/ws/btcusdt@miniTicker',
];
const MAX_BACKOFF_MS = 30_000;

let current: LiveTicker | null = null;
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;

function emit() {
  listeners.forEach((l) => l());
}

function connect() {
  if (typeof WebSocket === 'undefined' || socket) return;
  let ws: WebSocket;
  try {
    ws = new WebSocket(URLS[attempts % URLS.length]);
  } catch {
    schedule();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    attempts = 0;
  };
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data)) as Record<string, string | number>;
      const last = Number(m.c);
      const open24h = Number(m.o);
      if (!(last > 0) || !(open24h > 0)) return;
      current = {
        last,
        open24h,
        high24h: Number(m.h),
        low24h: Number(m.l),
        volume24hUsd: Number(m.q),
        ts: Number(m.E) || Date.now(),
      };
      emit();
    } catch {
      /* ignore malformed frame */
    }
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    current = null;
    emit();
    if (listeners.size) schedule();
  };
  ws.onerror = () => ws.close();
}

function schedule() {
  if (retry) return;
  const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts++);
  retry = setTimeout(() => {
    retry = null;
    if (listeners.size) connect();
  }, delay);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) connect();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) {
      if (retry) clearTimeout(retry);
      retry = null;
      const s = socket;
      socket = null;
      s?.close();
      current = null;
    }
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

/** Live ticker, or null until the first frame (and whenever the socket is down). */
export function useLiveTicker(): LiveTicker | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
