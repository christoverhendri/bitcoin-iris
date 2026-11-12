'use client';

import { useSyncExternalStore } from 'react';
import { EXCHANGE_ADDRESSES } from '@/lib/onchain/exchangeRegistry';
import { classifyTx, type ClassifiedFlow } from '@/lib/onchain/classifyFlow';
import type { EsploraTxIo } from '@/lib/sources/esplora';

/**
 * Live exchange-wallet wire. Subscribes to every registry address on
 * blockchain.info's public socket (`addr_sub`) and classifies each unconfirmed
 * transaction with the same `classifyTx` the server sweep uses, so the live
 * rows and the cached ones agree. mempool.space's socket is not used: it is
 * unreachable on some networks while this one is.
 *
 * Only the tracked registry is watched, so a quiet wire means no tracked wallet
 * moved, not that the market is quiet. Rows are kept in memory for the life of
 * the tab; the hook reports `status` so the UI can say when the socket is down.
 */
export type LiveFlow = { flow: ClassifiedFlow; seenAt: number };
export type FlowWireState = { status: 'connecting' | 'live' | 'down'; flows: LiveFlow[] };

const URL = 'wss://ws.blockchain.info/inv';
/** Live wire threshold: lower than the cached sweep (50 BTC) so activity shows. */
const MIN_BTC = 10;
const MAX_ROWS = 30;
const MAX_BACKOFF_MS = 30_000;
const SATS = 1e8;

let state: FlowWireState = { status: 'connecting', flows: [] };
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let ping: ReturnType<typeof setInterval> | null = null;
let attempts = 0;
const seen = new Set<string>();

function set(next: Partial<FlowWireState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

type RawIo = { addr?: string | null; value?: number };
type RawUtx = { hash?: string; inputs?: { prev_out?: RawIo | null }[]; out?: RawIo[] };

const toIo = (io: RawIo | null | undefined): EsploraTxIo => ({
  address: io?.addr ?? null,
  valueBtc: typeof io?.value === 'number' && Number.isFinite(io.value) ? io.value / SATS : 0,
});

function onUtx(x: RawUtx) {
  if (!x.hash || seen.has(x.hash)) return;
  seen.add(x.hash);
  const flow = classifyTx(
    {
      txid: x.hash,
      blockTime: 0,
      confirmed: false,
      vin: (x.inputs ?? []).map((i) => toIo(i.prev_out)),
      vout: (x.out ?? []).map(toIo),
    },
    MIN_BTC,
  );
  if (flow) set({ flows: [{ flow, seenAt: Date.now() }, ...state.flows].slice(0, MAX_ROWS) });
}

function stopPing() {
  if (ping) clearInterval(ping);
  ping = null;
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
    for (const a of EXCHANGE_ADDRESSES) ws.send(JSON.stringify({ op: 'addr_sub', addr: a.address }));
    // Keep-alive: the server drops idle sockets.
    ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
    }, 25_000);
    set({ status: 'live' });
  };
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(String(ev.data)) as { op?: string; x?: RawUtx };
      if (m.op === 'utx' && m.x) onUtx(m.x);
    } catch {
      /* ignore malformed frame */
    }
  };
  ws.onclose = () => {
    stopPing();
    if (socket === ws) socket = null;
    if (listeners.size) {
      set({ status: 'down' });
      schedule();
    }
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
      stopPing();
      const s = socket;
      socket = null;
      s?.close();
      state = { ...state, status: 'connecting' };
    }
  };
}

const SERVER: FlowWireState = { status: 'connecting', flows: [] };

export function useFlowWire(): FlowWireState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER);
}
