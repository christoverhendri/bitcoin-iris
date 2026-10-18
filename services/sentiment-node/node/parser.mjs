/* Bounded, evidence preserving port of runtime/news_pipeline/parser.py and
 * sentiment_scope(_v3).py. Offsets exposed by this module are Unicode code
 * point offsets (matching Python), while JavaScript internally uses UTF-16. */
export const PARSER_VERSION = 'iris-news-rules/1.3.0';
export const MAX_TEXT_CHARS = 16000;
const cpMap = (text) => { const m = [0]; let i = 0; for (const c of text) {
    i += c.length;
    m.push(i);
} return m; };
const cpIndex = (map, utf16) => { let lo = 0, hi = map.length - 1; while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid] < utf16)
        lo = mid + 1;
    else
        hi = mid;
} return lo; };
const span = (text, a, b, map = cpMap(text)) => ({ text: text.slice(map[a], map[b]), start: a, end: b });
const UNICODE_WORD = String.raw `[\p{L}\p{N}_]`;
const UNICODE_BOUNDARY = String.raw `(?:(?<!${UNICODE_WORD})(?=${UNICODE_WORD})|(?<=${UNICODE_WORD})(?!${UNICODE_WORD}))`;
const pythonPattern = (source) => source.replaceAll(String.raw `\w`, String.raw `(?:\p{L}|\p{N}|_)`).replaceAll(String.raw `\b`, UNICODE_BOUNDARY);
const rx = (source, flags = 'giud') => new RegExp(pythonPattern(source), flags);
const all = (re, text, map, from = 0, to = text.length) => {
    const out = [];
    re.lastIndex = from;
    for (const m of text.matchAll(re)) {
        if (m.index >= to)
            break;
        if (m.index + m[0].length <= to)
            out.push(span(text, cpIndex(map, m.index), cpIndex(map, m.index + m[0].length), map));
    }
    return out;
};
const full = (re, text) => { const f = new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')); return f.exec(text); };
const cpLen = (s) => [...s].length;
// One space per UTF-16 unit preserves the raw indices used by JavaScript regexes.
// Convert every exposed offset through cpMap to retain Python codepoint semantics.
const maskText = (text, ignored, map) => {
    const chars = text.split('');
    for (const item of ignored) {
        for (let index = map[item.start]; index < map[item.end]; index++) chars[index] = ' ';
    }
    return chars.join('');
};
const decimalTimes = (raw, multiplier) => { const clean = raw.replaceAll(',', ''); const [whole, fraction = ''] = clean.split('.'); const digits = BigInt(`${whole}${fraction}`) * BigInt(multiplier); const value = digits.toString(); if (!fraction.length)
    return value; const padded = value.padStart(fraction.length + 1, '0'); return `${padded.slice(0, -fraction.length)}.${padded.slice(-fraction.length)}`; };
const ENTITY_RULES = {
    bitcoin: ['asset', String.raw `\b(?:bitcoin|btc|xbt)\b`], ethereum: ['asset', String.raw `\b(?:ethereum|ether|eth)\b`],
    sec: ['regulator', String.raw `\b(?:SEC|Securities and Exchange Commission)\b`], federal_reserve: ['central_bank', String.raw `\b(?:Federal Reserve|Fed|FOMC)\b`],
    blackrock: ['organization', String.raw `\bBlackRock\b`], binance: ['exchange', String.raw `\bBinance\b`], coinbase: ['exchange', String.raw `\bCoinbase\b`],
    strategy: ['organization', String.raw `\b(?:MicroStrategy|Strategy)\b`], tether: ['organization', String.raw `\bTether\b`], usdt: ['asset', String.raw `\bUSDT\b`],
};
const EVENT_RULES = {
    approval: String.raw `\bapprov(?:e|es|ed|al|ing)\b`, rejection: String.raw `\breject(?:s|ed|ion|ing)?\b`, ban: String.raw `\bban(?:s|ned|ning)?\b`,
    security_incident: String.raw `\b(?:hack(?:s|ed|ing)?|exploit(?:s|ed)?|breach(?:ed|es)?)\b`, liquidation: String.raw `\bliquidat(?:e|es|ed|ion|ions|ing)\b`,
    purchase: String.raw `\b(?:buy|buys|buying|bought|purchas(?:e|es|ed|ing))\b`, sale: String.raw `\b(?:sell|sells|selling|sold)\b`, inflow: String.raw `\binflows?\b`, outflow: String.raw `\boutflows?\b`,
    upward_movement: String.raw `\b(?:rise|rises|rising|rose|rally|rallies|rallied|surge|surges|surged|gains?)\b`, downward_movement: String.raw `\b(?:fall|falls|falling|fell|drop|drops|dropped|plunge|plunges|plunged)\b`,
    legal_action: String.raw `\b(?:lawsuit|sues?|sued|charges?|charged|indicted)\b`, rate_change: String.raw `\b(?:cuts?|raises?|raised|hikes?|hiked|lower(?:s|ed)?)\b`,
};
const ATTRIBUTION = rx(String.raw `\b(?:says?|said|according to|reports?|reported|denies|denied|claims?|claimed)\b`);
const NEGATION = rx(String.raw `\b(?:not|never|no|without|cannot|can['’]t|isn['’]t|wasn['’]t|hasn['’]t|haven['’]t|didn['’]t|won['’]t|denies|denied|deny|false|untrue)\b`);
const MODALITY = rx(String.raw `\b(?:may|might|could|would|will|expect(?:s|ed)?|plans?|planned|propos(?:e|es|ed|al)|rumou?rs?|if|unless|should)\b`);
const QUANTITY = rx(String.raw `(?<![\p{L}\p{N}_.])(?:(?<currency>[$€£])\s*)?(?<number>\d+(?:,\d{3})*(?:\.\d+)?)\s*(?<scale>trillion|billion|million|thousand|[kmbt](?![\p{L}\p{N}_]))?\s*(?<unit>%|percent\b|basis points?\b|bps\b|BTC\b|ETH\b|USD\b|dollars?\b|EUR\b|GBP\b)?`);
const TIME = rx(String.raw `\b(?:\d{4}-\d{2}-\d{2}|today|yesterday|tomorrow|(?:past|last|next)\s+(?:\d+\s+)?(?:minutes?|hours?|days?|weeks?|months?|years?))\b`);
const URL = rx(String.raw `https?://\S+`);
function segments(text, masked, map) {
    const bounds = [0];
    const br = rx(String.raw `\n+|[!?]+\s+|\.\s+|;\s*|\b(?:but|whereas|while)\b`);
    for (const m of masked.matchAll(br)) {
        if (m[0].startsWith('.') && rx(String.raw `\b(?:Mr|Mrs|Ms|Dr|U\.S|U\.K|Inc|Corp|vs)\.$`).test(masked.slice(0, m.index + 1)))
            continue;
        bounds.push(m.index, m.index + m[0].length);
    }
    bounds.push(masked.length);
    const out = [];
    for (let i = 0; i + 1 < bounds.length; i += 2) {
        let a = bounds[i], b = bounds[i + 1];
        while (a < b && /\s/u.test(masked[a])) a++;
        while (b > a && /\s/u.test(masked[b - 1])) b--;
        if (a < b)
            out.push({ id: `s${out.length + 1}`, ...span(text, cpLen(text.slice(0, a)), cpLen(text.slice(0, b)), map) });
    }
    return out;
}
const ASSET = String.raw `(?:Bitcoin|BTC|XBT|Ethereum|ETH|crypto(?:currency)?)`;
const PERSON = String.raw `(?:[A-Za-z][A-Za-z’'-]*\s+){0,8}?[A-Za-z][A-Za-z’'-]*`;
const TREASURY = String.raw `(?:the\s+)?(?:company['’]s|its)\s+treasury`;
const PREFIX = String.raw `(?<context>${PERSON})\s+`;
const STANCE = String.raw `(?<cue>support(?:s|ed)?|oppos(?:e|es|ed)|endors(?:e|es|ed))`;
const DIRECT = String.raw `(?<target>(?:wider\s+)?(?<asset>${ASSET})(?:\s+adoption)?)`;
const PROPOSAL = String.raw `(?<target>a\s+proposal\s+to\s+(?:hold|add)\s+(?<asset>${ASSET})\s+(?:in|to)\s+${TREASURY})`;
const rule = (kind, source) => ({ kind, re: rx(String.raw `\s*${source}[.!]?\s*`) });
const RULES = [
    rule('utility_claim', String.raw `${PREFIX}(?<attribution>argues?|says?|said|states?|stated|claims?|claimed)\s+(?:that\s+)?(?<target>(?<asset>${ASSET})\s+(?<cue>can|cannot|can[’']t)\s+(?:protect|preserve)\s+(?:savings|wealth|purchasing\s+power)\s+(?:from|against)\s+inflation)`),
    rule('explicit_stance', String.raw `${PREFIX}(?:(?:says?|states?)\s+(?:that\s+)?(?:it|they)\s+)?(?:publicly\s+|explicitly\s+)?${STANCE}\s+${DIRECT}(?:\s+and\s+calls\s+it\s+(?<evaluation>beneficial|harmful))?`),
    rule('explicit_stance', String.raw `${PREFIX}(?:(?:says?|states?)\s+(?:that\s+)?(?:it|they)\s+)?${STANCE}\s+${PROPOSAL}`),
    rule('explicit_stance', String.raw `${PREFIX}attends\s+(?:a|the)\s+${ASSET}\s+conference\s+and\s+(?:explicitly\s+)?${STANCE}\s+${DIRECT}`),
    rule('proposal_stance', String.raw `Asked\s+about\s+(?:adding|holding)\s+(?<asset>${ASSET})\s+(?:to|in)\s+${TREASURY},\s*${PREFIX}expresses\s+(?<cue>support|opposition|no\s+position)\s+(?:for|on)\s+(?<target>(?:the|this)\s+proposal)`),
    rule('proposal_direction', String.raw `(?<proposal>(?:A|The)\s+(?:(?:proposed|draft)\s+)?(?:bill|law|regulation|proposal))\s+(?<modality>would|will|may|could)\s+(?<cue>permit|allow|enable|prohibit|ban|restrict)\s+(?<target>(?<asset>${ASSET})\s+(?:custody|trading|payment)\s+services)(?<status>[.;]\s*(?:it|the\s+(?:bill|law|proposal|regulation))\s+has\s+not\s+(?:yet\s+)?passed)?`),
];
const ev = (text, m, group, map) => { const ix = group === '0' ? m.indices?.[0] : m.indices?.groups?.[group]; if (ix?.[0] !== undefined)
    return span(text, cpIndex(map, ix[0]), cpIndex(map, ix[1]), map); return span(text, cpIndex(map, m.index), cpIndex(map, m.index), map); };
const targetKey = (value) => { const w = value.toLowerCase().split(/\s+/); const a = w.find(x => x !== 'wider'); return [a === 'bitcoin' || a === 'btc' || a === 'xbt' ? 'bitcoin' : a === 'ethereum' || a === 'eth' ? 'ethereum' : 'crypto', w.includes('adoption') ? 'adoption' : 'asset']; };
const directAttribution = (masked, match, holderGroup, cue, holder, map) => { const hs = match.indices.groups[holderGroup][1]; const ce = map[cue.start]; const m = masked.slice(hs, ce).match(/\b(?:says?|said|states?|stated|argues?|claims?|claimed)\b/i); if (!m)
    return []; const a = hs + m.index; return [{ reporter: holder, cue: span(masked, cpIndex(map, a), cpIndex(map, a + m[0].length), map), holder_binding: 'same_subject_supported_complement' }]; };
function extractV1(text, masked, entities, map) {
    const base = { rules_version: 'iris-sentiment-scope/0.1.0', basis: 'development_derived_explicit_scope_rules', eligible: false, candidate: null, abstention_reason: 'unsupported_scope' };
    const assets = new Set(entities.filter(e => e.kind === 'asset').map(e => e.canonical));
    if (assets.size > 1)
        return { ...base, abstention_reason: 'multiple_asset_targets' };
    if (rx(String.raw `\b(?:denies?|denied|rumou?rs?|false|untrue|if|unless|whether)\b`).test(masked))
        return { ...base, abstention_reason: 'denial_rumor_or_conditional_scope' };
    for (const { kind, re } of RULES) {
        const m = full(re, masked);
        if (!m)
            continue;
        const g = m.groups ?? {};
        if (rx(String.raw `\b(?:not|never|no|without|cannot)\b`).test(g.context ?? ''))
            return { ...base, abstention_reason: 'negated_or_complex_attribution' };
        if (rx(String.raw `\b(?:gains?|loss(?:es)?|falls?|rises?|drops?|surges?|reports?|reported|buy|buys|sold|sell|earns?|profits?|prices?|costs?|hacked|attacks?|rejects?|bans?|and|but|while|whereas|despite|because|as)\b`).test(g.context ?? ''))
            continue;
        const cue = g.cue.replace(/\s+/g, ' ').toLowerCase();
        const label = cue === 'no position' ? 'neutral' : /^(oppos|cannot|can't|can’t|prohibit|ban|restrict)/.test(cue) ? 'negative' : 'positive';
        if (g.evaluation && (g.evaluation.toLowerCase() === 'beneficial') !== (label === 'positive'))
            return { ...base, abstention_reason: 'contradictory_stance_evaluation' };
        const candidate = { kind, proposed_sentiment: label, cue: ev(text, m, 'cue', map), target: ev(text, m, 'target', map), asset: ev(text, m, 'asset', map), evidence: ev(text, m, '0', map), negation_scope: kind === 'utility_claim' && label === 'negative' ? 'utility_benefit' : null, modality: kind === 'proposal_direction' || /proposal/i.test(m[0]) ? 'proposed' : kind === 'utility_claim' ? 'attributed_ability_claim' : 'attributed_stance', verified_occurrence: false };
        if (g.status)
            candidate.enactment_status_evidence = ev(text, m, 'status', map);
        return { ...base, eligible: true, candidate, abstention_reason: null };
    }
    return base;
}
function refineV3(raw, semantic, map) {
    const parent = semantic.sentiment_scope;
    const scope = { rules_version: 'iris-sentiment-scope/0.3.0', parent_rules_version: 'iris-sentiment-scope/0.1.0', basis: 'bounded_proposition_relations_not_general_coreference', eligible: false, candidate: null, propositions: [], relations: [], guard_evidence: [], context_resolution: 'unresolved', abstention_reason: parent.abstention_reason || 'unsupported_context_frame' };
    if (parent.candidate)
        scope.rejected_candidate = structuredClone(parent.candidate);
    if (!parent.eligible && parent.abstention_reason !== 'unsupported_scope')
        return scope;
    const masked = maskText(raw, semantic.ignored_spans ?? [], map);
    const HOLDER = String.raw `(?<holder>(?:the|an?)\s+(?:(?:university|fund|senior|independent|local|national|research|central|insurance|coastal)\s+){0,2}(?:analyst|researcher|director|minister|senator|treasurer|association|council|foundation|board|committee|company|reviewer|economist|governor|mayor|bank|investor|regulator)|BlackRock|Strategy|Binance|Coinbase|Michael\s+Saylor|Jerome\s+Powell)`;
    const TOPIC = String.raw `(?:wider\s+)?${ASSET}(?:\s+adoption)?`;
    const relative = rx(String.raw `\s*${HOLDER}\s*,?\s*(?<relative>who|which|that)\s+(?<history>(?:(?:has|had)\s+(?:previously\s+)?|(?:previously|formerly|once)\s+))?(?<secondary_cue>supports?|supported|endorses?|endorsed|opposes?|opposed|criticizes?|criticized|condemns?|condemned)\s+(?<secondary_target>${TOPIC})\s*,?\s+(?:(?<current>now|currently)\s+)?(?<cue>supports?|endorses?|opposes?)\s+(?<target>(?:wider\s+)?(?<asset>${ASSET})(?:\s+adoption)?)[.!]?\s*`);
    const m = full(relative, masked);
    const proposition = (cue, target, time, binding) => ({ holder: ev(raw, m, 'holder', map), holder_resolution: binding, cue: ev(raw, m, cue, map), target: ev(raw, m, target, map), target_key: targetKey(m.groups[target]), orientation: /^(support|endor)/i.test(m.groups[cue]) ? 'positive' : 'negative', negation_scope: null, attribution_chain: [], time, verified_occurrence: false });
    if (m) {
        const secondary = proposition('secondary_cue', 'secondary_target', m.groups.history ? 'history' : 'unspecified', 'shared_subject_relative_frame');
        const main = proposition('cue', 'target', m.groups.current ? 'current' : 'unspecified', 'explicit_main_subject');
        const relation = { holder_relation: 'same_shared_subject', target_relation: JSON.stringify(secondary.target_key) === JSON.stringify(main.target_key) ? 'same' : 'different', evidence: [ev(raw, m, 'relative', map)], status: 'unresolved' };
        scope.propositions = [secondary, main];
        scope.guard_evidence = [ev(raw, m, 'relative', map)];
        scope.relations = [relation];
        if (relation.target_relation !== 'same') {
            scope.abstention_reason = 'relative_target_or_aspect_mismatch';
            return scope;
        }
        const historical = new Set(['supported', 'endorsed', 'opposed', 'criticized', 'condemned']).has(m.groups.secondary_cue.toLowerCase());
        if (m.groups.history && historical && m.groups.current) {
            relation.status = 'explicit_history_to_current';
            relation.evidence.push(ev(raw, m, 'history', map), ev(raw, m, 'current', map));
        }
        else if (!m.groups.history && !historical && secondary.orientation === main.orientation)
            relation.status = 'compatible_same_target';
        else {
            scope.abstention_reason = 'relative_stance_or_time_unresolved';
            return scope;
        }
        scope.candidate = { kind: 'explicit_stance', proposed_sentiment: main.orientation, cue: main.cue, target: main.target, asset: ev(raw, m, 'asset', map), evidence: ev(raw, m, '0', map), negation_scope: null, modality: 'attributed_stance', verified_occurrence: false };
        scope.eligible = true;
        scope.abstention_reason = null;
        scope.context_resolution = 'complete_bounded_relative_frame';
        delete scope.rejected_candidate;
        return scope;
    }
    if (parent.eligible) {
        for (const { kind, re } of RULES) {
            const d = new RegExp(re.source.replace(PREFIX, `${HOLDER}\\s+`), re.flags);
            const x = full(d, masked);
            if (!x || kind !== parent.candidate.kind)
                continue;
            const holderGroup = x.groups.holder ? 'holder' : 'proposal';
            const holder = ev(raw, x, holderGroup, map);
            const cue = parent.candidate.cue;
            const aspect = kind === 'utility_claim' ? 'inflation_hedge_claim' : kind === 'proposal_stance' || /proposal/i.test(parent.candidate.target.text) ? 'treasury_allocation' : kind === 'proposal_direction' ? `${parent.candidate.target.text.toLowerCase().split(/\s+/).at(-2)}_services` : /adoption/i.test(parent.candidate.target.text) ? 'adoption' : 'asset';
            scope.propositions = [{ holder, holder_resolution: 'explicit_supported_frame', cue: parent.candidate.cue, target: parent.candidate.target, asset: parent.candidate.asset, orientation: parent.candidate.proposed_sentiment, target_key: [targetKey(parent.candidate.asset.text)[0], aspect], target_resolution: 'explicit_supported_frame_or_proposal_antecedent', negation_scope: parent.candidate.negation_scope, attribution_chain: directAttribution(masked, x, holderGroup, cue, holder, map), time: parent.candidate.modality === 'proposed' ? 'proposed' : 'unspecified', verified_occurrence: false }];
            scope.candidate = structuredClone(parent.candidate);
            scope.eligible = true;
            scope.abstention_reason = null;
            scope.context_resolution = 'complete_supported_direct_frame';
            delete scope.rejected_candidate;
            return scope;
        }
    }
    scope.abstention_reason = 'unsupported_context_frame';
    return scope;
}
export function parseNews(text) {
    if (typeof text !== 'string')
        throw new TypeError('raw_text must be a string');
    const n = [...text].length;
    if (n > MAX_TEXT_CHARS)
        throw new RangeError('text_too_large');
    const map = cpMap(text);
    if (Object.values(EVENT_RULES).reduce((a, p) => a + [...text.matchAll(rx(p))].length, 0) > 128)
        throw new RangeError('too_many_event_triggers');
    if ([...text.matchAll(/[\p{L}\p{N}_]+/gu)].length > 2000)
        throw new RangeError('too_many_tokens');
    const ignored = [...all(URL, text, map), ...all(rx(String.raw `@\w+`), text, map), ...all(rx(String.raw `^\s*(?:JUST IN|BREAKING|JUST ANNOUNCED)\s*:`, 'giu'), text, map)];
    const masked = maskText(text, ignored, map);
    const parts = segments(text, masked, map);
    const entities = [];
    for (const [canonical, [kind, p]] of Object.entries(ENTITY_RULES))
        for (const x of all(rx(p), masked, map)) {
            if (canonical === 'sec' && x.text.toLowerCase() === 'sec' && x.text !== 'SEC')
                continue;
            if (canonical === 'strategy' && x.text === 'strategy')
                continue;
            entities.push({ ...x, canonical, kind, basis: 'alias_dictionary' });
        }
    for (const x of all(rx(String.raw `(?<!\w)\$[A-Za-z][A-Za-z0-9]{1,9}\b`), masked, map))
        entities.push({ ...x, canonical: null, kind: 'cashtag', basis: 'syntax_only' });
    const quantities = [];
    for (const m of masked.matchAll(QUANTITY)) {
        const g = m.groups;
        if (!(g.currency || g.unit || g.scale))
            continue;
        let a = m.index, b = m.index + m[0].length;
        while (/\s/u.test(text[a]))
            a++;
        while (b > a && /\s/u.test(text[b - 1]))
            b--;
        const scale = (g.scale || '').toLowerCase();
        const mult = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9, t: 1e12, trillion: 1e12 }[scale] || 1;
        quantities.push({ ...span(text, cpLen(text.slice(0, a)), cpLen(text.slice(0, b)), map), value: decimalTimes(g.number, mult), unit: g.unit || g.currency || 'unspecified', currency_symbol: g.currency || null, basis: 'explicit_text', event_role: null });
    }
    const events = [], unresolved = [];
    let prior = false, priorEnd = null;
    for (const part of parts) {
        const a = part.start, b = part.end;
        if (priorEnd !== null && /[.!?;]/u.test(text.slice(map[priorEnd], map[a])))
            prior = false;
        const neg = all(NEGATION, masked, map, map[a], map[b]), modal = all(MODALITY, masked, map, map[a], map[b]), attribution = all(ATTRIBUTION, masked, map, map[a], map[b]);
        part.negation_cues = neg;
        part.modality_cues = modal;
        part.attribution_cues = attribution;
        const triggers = [];
        for (const [kind, p] of Object.entries(EVENT_RULES))
            for (const m of masked.slice(map[a], map[b]).matchAll(rx(p))) {
                if (kind === 'rate_change' && !rx(String.raw `\b(?:rates?|bps|basis points?)\b`).test(masked.slice(map[a], map[b])))
                    continue;
                triggers.push({ start: cpIndex(map, map[a] + m.index), end: cpIndex(map, map[a] + m.index + m[0].length), kind });
            }
        triggers.sort((x, y) => x.start - y.start);
        for (const t of triggers) {
            const before = text.slice(map[a], map[t.start]);
            let ambiguous = triggers.length > 1 || rx(String.raw `\b(?:and|or)\b`).test(before);
            const relevant = neg.filter(x => x.start < t.end);
            for (const q of relevant) {
                const between = masked.slice(map[q.end], map[t.start]).trim();
                if (between && !new RegExp(String.raw `^(?:(?:it|that|was|were|is|are|be|been|being|has|have|had|yet|ever|to|the|a|an)\s*)$`, 'i').test(between))
                    ambiguous = true;
            }
            if (neg.some(x => x.start >= t.end) || modal.some(x => x.start >= t.end) || relevant.length > 1 || rx(String.raw `\bnot\s+only\b`).test(before))
                ambiguous = true;
            const status = ambiguous ? 'unresolved' : relevant.length ? 'negated' : 'affirmed';
            const rm = modal.filter(x => x.start < t.end);
            let mode = 'asserted';
            if (rm.length) {
                const c = rm.at(-1).text.toLowerCase();
                mode = ['if', 'unless'].includes(c) ? 'conditional' : c.startsWith('expect') ? 'expected' : c.startsWith('plan') || c.startsWith('propos') ? 'planned' : c.startsWith('rum') ? 'rumored' : 'possible';
            }
            if (ambiguous)
                mode = 'unresolved';
            let pol = status, mod = mode;
            if (prior && !attribution.length)
                pol = mod = 'unresolved';
            const e = { id: `e${events.length + 1}`, segment_id: part.id, event_type: t.kind, trigger: span(text, t.start, t.end, map), polarity: pol, modality: mod, attribution_cues: attribution, speaker: null, actor: null, target: null, entity_mentions: entities.filter(x => a <= x.start && x.start < b), evidence: span(text, a, b, map), needs_review: pol === 'unresolved' || relevant.length > 0 || rm.length > 0 || attribution.length > 0, basis: 'heuristic_rules', verified_occurrence: false };
            events.push(e);
        }
        if (!triggers.length)
            unresolved.push({ segment_id: part.id, reason: 'no_supported_event_trigger' });
        else if (events.some(e => e.segment_id === part.id && e.polarity === 'unresolved'))
            unresolved.push({ segment_id: part.id, reason: 'complex_scope' });
        prior = prior || Boolean(attribution.length || modal.length);
        priorEnd = b;
    }
    if (!parts.length)
        unresolved.push({ segment_id: null, reason: 'no_content' });
    const sentiment_scope = extractV1(text, masked, entities, map);
    return { parser_version: PARSER_VERSION, offset_basis: 'raw_text_unicode_codepoints', segments: parts, entities: entities.sort((x, y) => x.start - y.start), quantities, time_expressions: all(TIME, masked, map), ignored_spans: ignored, events, unresolved, sentiment_scope, btc_relevance: entities.some(e => e.canonical === 'bitcoin') ? 'explicit_mention' : 'undetermined', needs_review: Boolean(unresolved.length) || events.some(e => e.needs_review) };
}
export function applySentimentScope(prediction) {
    if (prediction.sentiment_policy && prediction.sentiment_policy !== 'model_only' || 'model_sentiment' in prediction)
        throw new Error('Apply v3 to an unadjusted model result, not another policy output.');
    const semantic = prediction.semantic_parse;
    const map = cpMap(prediction.raw_text);
    let scope = refineV3(prediction.raw_text, semantic, map);
    if (prediction.inference?.truncated) {
        if (scope.candidate)
            scope.rejected_candidate = scope.candidate;
        scope = { ...scope, eligible: false, candidate: null, abstention_reason: 'input_truncated' };
    }
    const candidate = scope.candidate, eligible = Boolean(scope.eligible && candidate);
    const model = prediction.sentiment;
    const result = { ...prediction, model_sentiment: model, sentiment: eligible ? candidate.proposed_sentiment : model, model_label_basis: prediction.label_basis, label_basis: eligible ? 'model_plus_development_scoped_rules' : prediction.label_basis, sentiment_policy: 'parser_scope_v3', probabilities_basis: 'unmodified_model_only', sentiment_source: eligible ? 'parser_scope' : 'model', sentiment_adjustment: { rules_version: 'iris-sentiment-scope/0.3.0', eligible, changed: (eligible ? candidate.proposed_sentiment : model) !== model, evidence: eligible ? candidate : null, abstention_reason: scope.abstention_reason, context_resolution: scope.context_resolution, relations: scope.relations }, review_reasons: [...(prediction.review_reasons || [])] };
    if (eligible)
        result.review_reasons.push('development_parser_scope_decision');
    if (!eligible) {
        result.review_reasons.push('v3_scope_requires_review');
        result.needs_review = true;
    }
    else
        result.needs_review = true;
    result.semantic_parse = { ...semantic, sentiment_scope_v3: scope };
    return result;
}
export { extractV1 as extractSentimentScope };
