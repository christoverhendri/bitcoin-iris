import type { ReactNode } from 'react';
import { type Envelope, explainMock } from '@/lib/envelope';
import { softCase } from '@/lib/softCase';

/**
 * Renders its panel only when the data is real (curation 2026-10-18: "tidak
 * boleh ada data dummy"). When the envelope is mocked — source unreachable,
 * key or database not configured — a one-line note takes the panel's place,
 * saying what is missing and how to unlock it. Placeholder numbers never reach
 * the screen.
 *
 * Stale-but-real data still renders (with its STALE badge): it is genuine, and
 * the badge says how old.
 */
export function LiveOnly({
  env,
  title,
  children,
}: {
  env: Envelope<unknown> | readonly Envelope<unknown>[];
  /** Panel name shown in the note. */
  title: string;
  children: ReactNode;
}) {
  const envs: readonly Envelope<unknown>[] = Array.isArray(env) ? env : [env as Envelope<unknown>];
  const missing = envs.find((e) => e.isMock);
  if (!missing) return <>{children}</>;
  return (
    <div
      role="note"
      title={explainMock(missing)}
      className="iris-inset"
      style={{ padding: '16px 20px', fontSize: 14, lineHeight: 1.55, color: 'var(--mut)' }}
    >
      <span style={{ fontWeight: 600, color: 'var(--txt)' }}>{softCase(title)}</span> — data belum tersedia (
      {reasonWords(missing)}). Panel disembunyikan supaya tidak menampilkan angka contoh.
    </div>
  );
}

function reasonWords(e: Envelope<unknown>): string {
  switch (e.reason) {
    case 'query_error':
      return `sumber ${e.sourceKey.replace(/_/g, ' ')} tidak bisa dihubungi`;
    case 'no_rows':
      // Direct-fetch features return null when every upstream call failed;
      // database-backed ones when no job has written rows yet.
      return e.sourceKey === 'whale_alert'
        ? 'belum ada data: perlu Supabase + kunci Whale Alert'
        : `sumber ${e.sourceKey.replace(/_/g, ' ')} tidak mengirim data — kemungkinan tidak terjangkau dari jaringan ini`;
    case 'source_disabled':
      return 'sumber dinonaktifkan';
    case 'source_failed':
      return 'sumber sedang gagal';
    case 'synthetic_rows':
      return 'data contoh dari worker';
    default:
      return 'sumber belum tersedia';
  }
}
