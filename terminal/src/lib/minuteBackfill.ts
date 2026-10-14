export interface MinuteBackfillProgress {
  state: 'running' | 'stalled' | 'stopped' | 'failed' | 'complete';
  collectedMinutes: number;
  completedWindows: number;
  totalWindows: number;
  percent: number;
  completedMonths: number;
  totalMonths: number;
  activeBatch: string | null;
  requestedStart: string;
  requestedEnd: string;
  lastFetch: string | null;
  capturedAt: string;
  requestsPerMinute: number | null;
  remainingSeconds: number | null;
  hasCollectorError: boolean;
}
