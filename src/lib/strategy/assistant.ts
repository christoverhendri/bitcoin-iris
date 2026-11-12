import 'server-only';
/**
 * The strategy assistant. The visitor cannot type: they pick one of a few
 * fixed questions, and the answer is written from today's checklist only.
 *
 * Two writers share the same facts:
 *   - a free LLM (Groq, Gemini, OpenRouter or a local Ollama; see `llmConfig`),
 *     when configured: it rewrites the facts as plain Indonesian prose, told to
 *     use nothing but the facts it is given;
 *   - a rule-based writer, always available: templates over the same items.
 * The LLM failing (not configured, network, rate limit) falls back to the
 * rules, and the response says which writer answered.
 */
import type { CheckItem } from './checklist';
import type { StrategyState } from './load';

export const QUESTIONS = [
  { key: 'today', label: 'Gimana kabar hari ini?' },
  { key: 'why', label: 'Kenapa condongnya ke sana?' },
  { key: 'risk', label: 'Apa yang perlu diwaspadai?' },
  { key: 'aspects', label: 'Jelaskan semua aspek' },
  { key: 'calendar', label: 'Ada jadwal penting?' },
] as const;
export type QuestionKey = (typeof QUESTIONS)[number]['key'];
export const isQuestion = (k: string): k is QuestionKey => QUESTIONS.some((q) => q.key === k);

export interface Answer {
  text: string;
  engine: 'llm' | 'rules';
}

const LEAN = { bull: 'condong naik (bullish)', bear: 'condong turun (bearish)', neutral: 'campuran, belum ada arah yang jelas' } as const;
const usd = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const list = (xs: CheckItem[]) => xs.map((i) => `${i.label} (${i.reading})`).join(', ');
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const EVENT = { FOMC: 'keputusan suku bunga The Fed', CPI: 'data inflasi AS (CPI)', NFP: 'data tenaga kerja AS (NFP)' } as const;

/* ------------------------------------------------------------------ rules */

export function ruleAnswer(q: QuestionKey, s: StrategyState): string {
  const t = s.tally;
  const bulls = s.items.filter((i) => i.verdict === 'bull');
  const bears = s.items.filter((i) => i.verdict === 'bear');
  const neutrals = s.items.filter((i) => i.verdict === 'neutral');
  const price = s.price !== null ? `BTC sekarang di ${usd(s.price)}${s.change24hPct !== null ? ` (${s.change24hPct >= 0 ? '+' : '−'}${Math.abs(s.change24hPct).toFixed(2)}% dalam 24 jam)` : ''}. ` : '';
  const head = `${t.bull} dari ${t.total} sinyal bullish, ${t.bear} bearish, ${t.neutral} netral, jadi gambaran hari ini ${LEAN[t.lean]}.`;
  const gone = s.missing.length ? ` Sumber yang sedang tidak tersedia dan tidak dihitung: ${s.missing.join(', ')}.` : '';

  switch (q) {
    case 'today':
      return [
        `${price}${head}`,
        bulls.length ? `Yang mendukung naik: ${list(bulls)}.` : 'Belum ada sinyal yang jelas mendukung kenaikan.',
        bears.length ? `Yang menahan: ${list(bears)}.` : 'Tidak ada sinyal yang jelas menekan harga.',
        `Ini rangkuman sinyal, bukan saran beli atau jual.${gone}`,
      ].join('\n\n');
    case 'why': {
      const side = t.lean === 'bear' ? bears : t.lean === 'bull' ? bulls : [...bulls, ...bears];
      return [
        head,
        t.lean === 'neutral'
          ? `Kedua sisi hampir seimbang. Tiap sinyal dan aturannya:`
          : `Alasannya datang dari ${side.length} sinyal ini:`,
        side.map((i) => `• ${i.label}: ${i.reading}. ${i.rule}`).join('\n'),
      ].join('\n\n');
    }
    case 'risk': {
      const against = t.lean === 'bull' ? bears : t.lean === 'bear' ? bulls : [...bears, ...bulls];
      const soon = s.calendar?.upcoming.filter((e) => daysUntil(s.calendar!.today, e.date) <= 7) ?? [];
      return [
        against.length
          ? `Sinyal yang berlawanan dengan arah umum: ${list(against)}. Kalau sinyal-sinyal ini menguat, gambaran bisa berbalik.`
          : 'Hampir semua sinyal searah. Risikonya justru di situ: pasar yang terlalu satu arah gampang berbalik tajam.',
        neutrals.length ? `Masih menggantung (netral): ${list(neutrals)}.` : '',
        soon.length ? `Dalam 7 hari ada ${soon.map((e) => `${EVENT[e.kind]} (${daysUntil(s.calendar!.today, e.date)} hari lagi)`).join(' dan ')}; rilis seperti ini sering membuat harga bergerak tajam.` : '',
        `Model dan aturan ini membaca data masa lalu; kejadian tak terduga tidak tertangkap.${gone}`,
      ]
        .filter(Boolean)
        .join('\n\n');
    }
    case 'aspects': {
      const groups = [...new Set(s.items.map((i) => i.group))];
      return [
        head,
        ...groups.map((g) => {
          const xs = s.items.filter((i) => i.group === g);
          const word = (v: CheckItem['verdict']) => (v === 'bull' ? 'mendukung naik' : v === 'bear' ? 'menekan' : 'netral');
          return `${g}: ${xs.map((i) => `${i.label} ${word(i.verdict)} (${i.reading})`).join('; ')}.`;
        }),
      ].join('\n\n');
    }
    case 'calendar': {
      const c = s.calendar;
      if (!c || !c.upcoming.length) return 'Jadwal rilis makro AS sedang tidak bisa dibaca.';
      const recent = (c.recent ?? []).map((r) => {
        const dir = Math.abs(r.actual - r.previous) < (r.unit === 'k' ? 0.5 : 0.005) ? 'tidak berubah' : r.actual > r.previous ? 'naik' : 'turun';
        const v = (x: number) => (r.unit === 'k' ? `${Math.round(x)} ribu pekerjaan` : `${x.toFixed(2)}%`);
        return `${EVENT[r.kind]} terakhir ${v(r.actual)}, ${dir} dari ${v(r.previous)}`;
      });
      return [
        `Berikutnya: ${c.upcoming.slice(0, 4).map((e) => `${EVENT[e.kind]} dalam ${daysUntil(c.today, e.date)} hari`).join(', ')}.`,
        recent.length ? `Rilis terakhir: ${recent.join('; ')}.` : '',
        'Inflasi atau suku bunga yang lebih tinggi dari perkiraan biasanya menekan aset berisiko seperti BTC; angka yang lebih lunak biasanya membantu.',
      ]
        .filter(Boolean)
        .join('\n\n');
    }
  }
}

/* -------------------------------------------------------------------- LLM */

const SYSTEM = `Kamu asisten ringkasan di BitPulse, terminal riset Bitcoin. Tugasmu menjelaskan keadaan pasar hari ini dalam bahasa Indonesia yang santai tapi rapi, untuk orang awam.

Aturan:
- Pakai HANYA fakta di blok FAKTA. Jangan menambah angka, berita, atau peristiwa lain.
- Sebut sinyal dengan nama yang mudah dipahami dan jelaskan artinya dalam satu kalimat bila perlu.
- Jangan memberi saran membeli, menjual, atau menahan; ini ringkasan sinyal, bukan nasihat keuangan.
- Jawab dalam 2–4 paragraf pendek, tanpa judul dan tanpa markdown tebal. Boleh pakai daftar dengan "•" untuk menjelaskan banyak aspek.
- Kalau ada sumber yang tidak tersedia, sebut singkat di akhir.
- Jangan menyebut nama field atau kode seperti "lean", "bull", "verdict"; tulis dalam kalimat biasa ("condong naik", "condong turun", "netral").
- Rasio long/short di atas 1 berarti lebih banyak posisi long daripada short; di bawah 1 sebaliknya.
- Teks polos saja: tanpa tanda bintang, tanpa markdown.`;

const PROMPT: Record<QuestionKey, string> = {
  today: 'Pertanyaan: "Gimana kabar hari ini?" Beri gambaran umum: harga, berapa sinyal bullish dari total, apa yang paling mendukung dan apa yang paling menahan.',
  why: 'Pertanyaan: "Kenapa condongnya ke sana?" Jelaskan sinyal mana yang membuat gambaran condong ke arahnya, beserta aturan tiap sinyal.',
  risk: 'Pertanyaan: "Apa yang perlu diwaspadai?" Fokus pada sinyal yang berlawanan dengan arah umum, sinyal netral, dan jadwal rilis dalam 7 hari.',
  aspects: 'Pertanyaan: "Jelaskan semua aspek." Bahas tiap kelompok (Model, Sentimen, Teknikal, Makro, On-chain, Quant) satu per satu.',
  calendar: 'Pertanyaan: "Ada jadwal penting?" Jelaskan jadwal rilis makro berikutnya dan hasil rilis terakhir, serta kenapa itu penting bagi BTC.',
};

function facts(s: StrategyState) {
  return JSON.stringify(
    {
      harga: s.price,
      perubahan24jamPersen: s.change24hPct,
      ringkasan: s.tally,
      sinyal: s.items.map(({ group, label, reading, verdict, rule }) => ({ kelompok: group, sinyal: label, bacaan: reading, arah: verdict, aturan: rule })),
      tidakTersedia: s.missing,
      kalender: s.calendar ? { hariIni: s.calendar.today, berikutnya: s.calendar.upcoming.slice(0, 4), rilisTerakhir: s.calendar.recent ?? [] } : null,
    },
    null,
    1,
  );
}

/**
 * Free LLM providers, all through the OpenAI-style chat-completions endpoint
 * they share. Set LLM_BASE_URL + LLM_MODEL (+ LLM_API_KEY where needed):
 *   - Groq (free key):   https://api.groq.com/openai/v1
 *   - Gemini (free key): https://generativelanguage.googleapis.com/v1beta/openai
 *   - OpenRouter (free models end in ":free"): https://openrouter.ai/api/v1
 *   - Ollama (local, no key): http://localhost:11434/v1
 * Unset LLM_BASE_URL or LLM_MODEL turns the LLM off; the rules answer.
 */
function llmConfig() {
  const base = process.env.LLM_BASE_URL?.replace(/\/+$/, '');
  const model = process.env.LLM_MODEL;
  return base && model ? { base, model, key: process.env.LLM_API_KEY } : null;
}

/** Same question over the same facts within 10 minutes reuses the answer (free tiers have daily caps). */
const memo = new Map<string, { at: number; text: string }>();
const TTL_MS = 10 * 60_000;

async function llmAnswer(q: QuestionKey, s: StrategyState): Promise<string | null> {
  const cfg = llmConfig();
  if (!cfg) return null;
  const f = facts(s);
  const key = `${q}:${f}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.text;

  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.key ? { authorization: `Bearer ${cfg.key}` } : {}) },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.3,
        // Reasoning models (e.g. gpt-oss) spend part of this on thinking first.
        max_tokens: 4000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `FAKTA:\n${f}\n\n${PROMPT[q]}` },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn(`[assistant] LLM HTTP ${res.status}; using rules`);
      return null;
    }
    const j = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
    const choice = j.choices?.[0];
    // A cut-off answer reads worse than the template: fall back instead of showing half a sentence.
    if (choice?.finish_reason === 'length') {
      console.warn('[assistant] LLM answer hit the token limit; using rules');
      return null;
    }
    // Markdown is not rendered in the chat bubble; drop emphasis and heading marks.
    const text = choice?.message?.content
      ?.replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .trim();
    if (!text) return null;
    memo.set(key, { at: Date.now(), text });
    return text;
  } catch {
    console.warn('[assistant] LLM unreachable; using rules');
    return null;
  }
}

export async function answer(q: QuestionKey, s: StrategyState): Promise<Answer> {
  const text = await llmAnswer(q, s);
  return text ? { text, engine: 'llm' } : { text: ruleAnswer(q, s), engine: 'rules' };
}
