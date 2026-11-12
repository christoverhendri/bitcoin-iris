'use client';

import { useSyncExternalStore } from 'react';

/**
 * Live BTC perpetual context from Hyperliquid's public WebSocket
 * (`activeAssetCtx`): funding, open interest, mark/oracle price, pushed about
 * once a second. Binance and Bybit futures streams are blocked on some
 * networks (the same reason `btcTicker.ts` uses the binance.vision mirror), so
 * this venue is the one that stays reachable. Same shared-socket lifecycle as
 * `btcTicker.ts`; the hook returns null until the first frame and whenever the
 * socket is down.
 */
export type LivePerp = {
  /** Funding per HOUR (Hyperliquid settles hourly), decimal fraction. */
  fundingHourly: number;
  openInterestBtc: number;
  markPx: number;
  oraclePx: number;
  ts: number;
};

const URL = 'wss://api.hyperliquid.xyz/ws';
const SUB = JSON.stringify({ method: 'subscribe', subscription: { type: 'activeAssetCtx', coin: 'BTC' } });
const MAX_BACKOFF_MS = 30_000;

let current: LivePerp | null = null;
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
    ws = new WebSocket(URL);
  } catch {
    schedule();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    attempts = 0;
    ws.send(SUB);
  };
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data)) as { channel?: string; data?: { coin?: string; ctx?: Record<string, string> } };
      if (m.channel !== 'activeAssetCtx' || m.data?.coin !== 'BTC' || !m.data.ctx) return;
      const c = m.data.ctx;
      const fundingHourly = Number(c.funding);
      const markPx = Number(c.markPx);
      const oraclePx = Number(c.oraclePx);
      const openInterestBtc = Number(c.openInterest);
      if (![fundingHourly, markPx, oraclePx, openInterestBtc].every(Number.isFinite) || markPx <= 0) return;
      current = { fundingHourly, openInterestBtc, markPx, oraclePx, ts: Date.now() };
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

export function useLivePerp(): LivePerp | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
