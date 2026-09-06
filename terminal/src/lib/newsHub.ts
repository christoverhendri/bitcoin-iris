/** One refresh loop per server process, active only while browsers subscribe. */
export function createNewsHub<T>(load: () => Promise<T>, intervalMs = 60_000) {
  const listeners = new Set<(value: T | null) => void>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  const refresh = () => {
    if (pending) return pending;
    pending = (async () => {
      let value: T | null;
      try { value = await load(); } catch { value = null; }
      for (const listener of listeners) listener(value);
    })().finally(() => { pending = undefined; });
    return pending;
  };
  return {
    subscribe(listener: (value: T | null) => void) {
      listeners.add(listener);
      if (!timer) timer = setInterval(() => { void refresh(); }, intervalMs);
      void refresh();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { clearInterval(timer); timer = undefined; }
      };
    },
  };
}
