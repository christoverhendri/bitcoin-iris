"""Evidence-preserving English news rules. No model downloads or inferred truth."""

import re
from decimal import Decimal

VERSION = 'iris-news-rules/1.1.0'
MAX_TEXT_CHARS = 16000

ENTITY_RULES = {
    'bitcoin': ('asset', r'\b(?:bitcoin|btc|xbt)\b'),
    'ethereum': ('asset', r'\b(?:ethereum|ether|eth)\b'),
    'sec': ('regulator', r'\b(?:SEC|Securities and Exchange Commission)\b'),
    'federal_reserve': ('central_bank', r'\b(?:Federal Reserve|Fed|FOMC)\b'),
    'blackrock': ('organization', r'\bBlackRock\b'),
    'binance': ('exchange', r'\bBinance\b'),
    'coinbase': ('exchange', r'\bCoinbase\b'),
    'strategy': ('organization', r'\b(?:MicroStrategy|Strategy)\b'),
    'tether': ('organization', r'\bTether\b'),
    'usdt': ('asset', r'\bUSDT\b'),
}
EVENT_RULES = {
    'approval': r'\bapprov(?:e|es|ed|al|ing)\b',
    'rejection': r'\breject(?:s|ed|ion|ing)?\b',
    'ban': r'\bban(?:s|ned|ning)?\b',
    'security_incident': r'\b(?:hack(?:s|ed|ing)?|exploit(?:s|ed)?|breach(?:ed|es)?)\b',
    'liquidation': r'\bliquidat(?:e|es|ed|ion|ions|ing)\b',
    'purchase': r'\b(?:buy|buys|buying|bought|purchas(?:e|es|ed|ing))\b',
    'sale': r'\b(?:sell|sells|selling|sold)\b',
    'inflow': r'\binflows?\b',
    'outflow': r'\boutflows?\b',
    'upward_movement': r'\b(?:rise|rises|rising|rose|rally|rallies|rallied|surge|surges|surged|gains?)\b',
    'downward_movement': r'\b(?:fall|falls|falling|fell|drop|drops|dropped|plunge|plunges|plunged)\b',
    'legal_action': r'\b(?:lawsuit|sues?|sued|charges?|charged|indicted)\b',
    'rate_change': r'\b(?:cuts?|raises?|raised|hikes?|hiked|lower(?:s|ed)?)\b',
}
ATTRIBUTION = re.compile(r'\b(?:says?|said|according to|reports?|reported|denies|denied|claims?|claimed)\b', re.I)
NEGATION = re.compile(r"\b(?:not|never|no|without|cannot|can['’]t|isn['’]t|wasn['’]t|hasn['’]t|haven['’]t|didn['’]t|won['’]t|denies|denied|deny|false|untrue)\b", re.I)
MODALITY = re.compile(r'\b(?:may|might|could|would|will|expect(?:s|ed)?|plans?|planned|propos(?:e|es|ed|al)|rumou?rs?|if|unless|should)\b', re.I)
QUANTITY = re.compile(
    r'(?<![\w.])(?:(?P<currency>[$€£])\s*)?(?P<number>\d+(?:,\d{3})*(?:\.\d+)?)'
    r'\s*(?P<scale>trillion|billion|million|thousand|[kmbt](?!\w))?'
    r'\s*(?P<unit>%|percent\b|basis points?\b|bps\b|BTC\b|ETH\b|USD\b|dollars?\b|EUR\b|GBP\b)?', re.I)
TIME = re.compile(r'\b(?:\d{4}-\d{2}-\d{2}|today|yesterday|tomorrow|'
                  r'(?:past|last|next)\s+(?:\d+\s+)?(?:minutes?|hours?|days?|weeks?|months?|years?))\b', re.I)
URL = re.compile(r'https?://\S+', re.I)


def span(text, start, end):
    return {'text': text[start:end], 'start': start, 'end': end}


def matches(pattern, text, start=0, end=None):
    return [span(text, m.start(), m.end()) for m in pattern.finditer(text, start, len(text) if end is None else end)]


def segments(text, masked):
    # Split line/sentence/contrast boundaries; decimals and common abbreviations survive.
    boundaries = [0]
    for match in re.finditer(r'\n+|[!?]+\s+|\.\s+|;\s*|\b(?:but|whereas|while)\b', masked, re.I):
        if match.group().startswith('.'):
            prefix = masked[:match.start() + 1]
            if re.search(r'\b(?:Mr|Mrs|Ms|Dr|U\.S|U\.K|Inc|Corp|vs)\.$', prefix, re.I):
                continue
        boundaries.extend([match.start(), match.end()])
    boundaries.append(len(text))
    result = []
    for a, b in zip(boundaries[::2], boundaries[1::2]):
        while a < b and masked[a].isspace():
            a += 1
        while b > a and masked[b - 1].isspace():
            b -= 1
        if a < b:
            result.append({'id': f's{len(result) + 1}', **span(text, a, b)})
    return result


def parse_news(text):
    if not isinstance(text, str):
        raise TypeError('raw_text must be a string')
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError('text_too_large')
    if sum(1 for pattern in EVENT_RULES.values() for _ in re.finditer(pattern, text, re.I)) > 128:
        raise ValueError('too_many_event_triggers')
    if len(re.findall(r'\w+', text)) > 2000:
        raise ValueError('too_many_tokens')
    # Mask instead of deleting so every returned offset addresses original raw_text.
    ignored = matches(URL, text)
    ignored += matches(re.compile(r'@\w+'), text)
    ignored += matches(re.compile(r'^\s*(?:JUST IN|BREAKING|JUST ANNOUNCED)\s*:', re.I), text)
    chars = list(text)
    for item in ignored:
        chars[item['start']:item['end']] = ' ' * (item['end'] - item['start'])
    masked = ''.join(chars)
    parts = segments(text, masked)
    entities = []
    for canonical, (kind, pattern) in ENTITY_RULES.items():
        for item in matches(re.compile(pattern, re.I), masked):
            # "strategy" is too ambiguous unless capitalized or explicitly the company.
            if canonical == 'strategy' and item['text'] == 'strategy':
                continue
            entities.append({**item, 'canonical': canonical, 'kind': kind, 'basis': 'alias_dictionary'})
    for item in matches(re.compile(r'(?<!\w)\$[A-Za-z][A-Za-z0-9]{1,9}\b'), masked):
        entities.append({**item, 'canonical': None, 'kind': 'cashtag', 'basis': 'syntax_only'})
    quantities = []
    for m in QUANTITY.finditer(masked):
        if not (m['currency'] or m['unit'] or m['scale']):
            continue
        start, end = m.start(), m.end()
        while start < end and text[start].isspace():
            start += 1
        while end > start and text[end - 1].isspace():
            end -= 1
        scale = (m['scale'] or '').lower()
        multiplier = {'k': 1000, 'thousand': 1000, 'm': 10**6, 'million': 10**6,
                      'b': 10**9, 'billion': 10**9, 't': 10**12, 'trillion': 10**12}.get(scale, 1)
        value = Decimal(m['number'].replace(',', '')) * multiplier
        unit = m['unit'] or m['currency'] or 'unspecified'
        quantities.append({**span(text, start, end), 'value': format(value, 'f'),
                           'unit': unit, 'currency_symbol': m['currency'],
                           'basis': 'explicit_text', 'event_role': None})
    events, unresolved = [], []
    prior_uncertain_context = False
    for part in parts:
        a, b = part['start'], part['end']
        neg = matches(NEGATION, masked, a, b)
        modal = matches(MODALITY, masked, a, b)
        attribution = matches(ATTRIBUTION, masked, a, b)
        local_entities = [e for e in entities if a <= e['start'] < b]
        part.update({'negation_cues': neg, 'modality_cues': modal, 'attribution_cues': attribution})
        triggers = []
        for kind, pattern in EVENT_RULES.items():
            for m in re.finditer(pattern, masked[a:b], re.I):
                if kind == 'rate_change' and not re.search(r'\b(?:rates?|bps|basis points?)\b', masked[a:b], re.I):
                    continue
                triggers.append((a + m.start(), a + m.end(), kind))
        triggers.sort()
        for start, end, kind in triggers:
            before = masked[a:start]
            # A conjunction, nested denial, or multiple triggers makes rule scope uncertain.
            ambiguous = len(triggers) > 1 or bool(re.search(r'\b(?:and|or)\b', before, re.I))
            relevant_neg = [n for n in neg if n['start'] < end]
            for n in relevant_neg:
                between = masked[n['end']:start].strip()
                if not re.fullmatch(r"(?:(?:it|that|was|were|is|are|be|been|being|has|have|had|yet|ever|to|the|a|an)\s*)*", between, re.I):
                    ambiguous = True
            if any(n['start'] >= end for n in neg):
                ambiguous = True
            if any(m['start'] >= end for m in modal):
                ambiguous = True
            if len(relevant_neg) > 1 or re.search(r'\bnot\s+only\b', before, re.I):
                ambiguous = True
            status = 'unresolved' if ambiguous else 'negated' if relevant_neg else 'affirmed'
            relevant_modal = [m for m in modal if m['start'] < end]
            mode = 'asserted'
            if relevant_modal:
                cue = relevant_modal[-1]['text'].lower()
                mode = ('conditional' if cue in {'if', 'unless'} else
                        'expected' if cue.startswith('expect') else
                        'planned' if cue.startswith(('plan', 'propos')) else
                        'rumored' if cue.startswith('rum') else 'possible')
            if ambiguous:
                mode = 'unresolved'
            # Attribution can continue across a contrast/newline; leave that scope open.
            if prior_uncertain_context and not attribution:
                status, mode = 'unresolved', 'unresolved'
            review = status == 'unresolved' or bool(relevant_neg or relevant_modal or attribution)
            events.append({'id': f'e{len(events) + 1}', 'segment_id': part['id'],
                           'event_type': kind, 'trigger': span(text, start, end),
                           'polarity': status, 'modality': mode,
                           'attribution_cues': attribution, 'speaker': None,
                           'actor': None, 'target': None, 'entity_mentions': local_entities,
                           'evidence': span(text, a, b), 'needs_review': review,
                           'basis': 'heuristic_rules', 'verified_occurrence': False})
        if not triggers:
            unresolved.append({'segment_id': part['id'], 'reason': 'no_supported_event_trigger'})
        elif any(e['segment_id'] == part['id'] and e['polarity'] == 'unresolved' for e in events):
            unresolved.append({'segment_id': part['id'], 'reason': 'complex_scope'})
        prior_uncertain_context = prior_uncertain_context or bool(attribution or modal)
    if not parts:
        unresolved.append({'segment_id': None, 'reason': 'no_content'})
    return {'parser_version': VERSION, 'offset_basis': 'raw_text_unicode_codepoints',
            'segments': parts, 'entities': sorted(entities, key=lambda x: x['start']),
            'quantities': quantities, 'time_expressions': matches(TIME, masked),
            'ignored_spans': ignored, 'events': events, 'unresolved': unresolved,
            'btc_relevance': 'explicit_mention' if any(e['canonical'] == 'bitcoin' for e in entities) else 'undetermined',
            'needs_review': bool(unresolved) or any(e['needs_review'] for e in events)}
