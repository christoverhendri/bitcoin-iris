'use client';

import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/primitives';

interface Turn {
  id: number;
  q: string;
  text: string | null;
  engine?: 'llm' | 'rules';
  error?: boolean;
}

/**
 * The assistant card: question chips instead of a text box. Each tap asks the
 * server (which reads today's checklist) and the answer types itself out.
 * Nothing persists: leaving the page starts a new conversation.
 */
export function Assistant({ questions }: { questions: readonly { key: string; label: string }[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Record<number, number>>({});
  const box = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  const ask = async (key: string, label: string) => {
    if (busy) return;
    const id = nextId.current++;
    setBusy(true);
    setTurns((t) => [...t, { id, q: label, text: null }]);
    try {
      const r = await fetch('/api/strategy/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: key }) });
      const j = (await r.json()) as { text?: string; engine?: 'llm' | 'rules' };
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, text: j.text ?? 'Maaf, jawaban belum bisa dibuat.', engine: j.engine, error: !j.text } : x)));
    } catch {
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, text: 'Koneksi ke server gagal. Coba lagi sebentar.', error: true } : x)));
    } finally {
      setBusy(false);
    }
  };

  // Type the newest answer out, a few characters per frame.
  const last = turns[turns.length - 1];
  useEffect(() => {
    if (!last?.text) return;
    const full = last.text.length;
    const id = last.id;
    let raf = 0;
    const step = () => {
      let done = false;
      setShown((s) => {
        const n = Math.min(full, (s[id] ?? 0) + 6);
        done = n >= full;
        return { ...s, [id]: n };
      });
      if (!done) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [last?.id, last?.text]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' });
  }, [turns, shown]);

  return (
    <Panel style={{ height: '100%' }} still>
      <div style={{ position: 'relative', zIndex: 4, padding: '24px 26px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#ffb27a" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
          </svg>
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 className="t-title" style={{ margin: 0, fontSize: 18 }}>
            Asisten BitPulse
          </h2>
          <span style={{ fontSize: 13, color: 'var(--dim)' }}>Pilih pertanyaan, jawabannya dari checklist hari ini</span>
        </span>
      </div>
      <div ref={box} style={{ position: 'relative', zIndex: 4, flex: 1, minHeight: 220, maxHeight: 460, overflowY: 'auto', padding: '6px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {turns.length === 0 ? (
          <div className="iris-inset" style={{ padding: '16px 18px', fontSize: 15, lineHeight: 1.55, color: '#e9ddd2' }}>
            Halo! Aku merangkum semua sinyal di terminal ini jadi bahasa sehari-hari. Pilih salah satu pertanyaan di bawah.
          </div>
        ) : null}
        {turns.map((t) => (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '9px 14px', borderRadius: '16px 16px 4px 16px', background: '#261b13', fontSize: 14.5 }}>{t.q}</span>
            <div
              style={{
                alignSelf: 'flex-start',
                maxWidth: '95%',
                padding: '12px 16px',
                borderRadius: '16px 16px 16px 4px',
                background: t.error ? 'var(--sunk)' : 'color-mix(in srgb, var(--accent) 9%, var(--sunk))',
                fontSize: 14.5,
                lineHeight: 1.6,
                color: '#e9ddd2',
                whiteSpace: 'pre-wrap',
              }}
            >
              {t.text === null ? (
                <span style={{ display: 'inline-flex', gap: 5 }} aria-label="Menyusun jawaban">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="iris-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffb27a', animationDelay: `${i * 0.2}s` }} />
                  ))}
                </span>
              ) : (
                t.text.slice(0, shown[t.id] ?? (t === last ? 0 : t.text.length))
              )}
            </div>
            {t.text !== null && t.engine ? (
              <span style={{ fontSize: 12, color: 'var(--dim)', paddingLeft: 4 }} data-tip={t.engine === 'llm' ? 'Ditulis ulang oleh LLM gratis dari fakta checklist' : 'Disusun dari template aturan atas checklist'}>
                {t.engine === 'llm' ? 'AI · dari checklist hari ini' : 'Aturan · dari checklist hari ini'}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', zIndex: 4, padding: '12px 26px 22px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {questions.map((q) => (
          <button
            key={q.key}
            type="button"
            disabled={busy}
            onClick={() => ask(q.key, q.label)}
            className="seg-btn"
            style={{ border: 0, cursor: busy ? 'wait' : 'pointer', fontSize: 13.5, padding: '9px 14px', background: '#1c140e', color: '#ffb27a', opacity: busy ? 0.6 : 1 }}
          >
            {q.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}
