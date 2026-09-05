"""Bounded Telegram preview collection with durable page and catch-up checkpoints."""
import json
import re
import time

import requests
import truststore
from bs4 import BeautifulSoup

from .storage import connect, date, ensure_capacity, exclusive_writer, save_record, utcnow

MAX_PAGE_BYTES = 2 * 1024 * 1024


def fetch_page(before=None):
    if before is not None and (type(before) is not int or not 0 < before < 10**18):
        raise ValueError('invalid pagination cursor')
    truststore.inject_into_ssl()
    # No arbitrary URL or redirects: a post cannot select a network destination.
    with requests.get('https://t.me/s/WatcherGuru', params={'before': before} if before else None,
                      timeout=(10, 15), stream=True, allow_redirects=False) as response:
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError('unexpected HTTP status or redirect')
        if 'text/html' not in response.headers.get('Content-Type', '').lower():
            raise ValueError('unexpected content type')
        chunks, size, start = [], 0, time.monotonic()
        for chunk in response.iter_content(8192):
            size += len(chunk)
            if size > MAX_PAGE_BYTES or time.monotonic() - start > 30:
                raise ValueError('response size/time budget exceeded')
            chunks.append(chunk)
        return b''.join(chunks).decode('utf-8', errors='strict')


def page_records(html, observed):
    soup = BeautifulSoup(html, 'html.parser')
    records, ids, media = [], [], 0
    nodes = soup.select('.tgme_widget_message[data-post]')
    if len(nodes) > 100:
        raise ValueError('too_many_page_posts')
    for node in nodes:
        post = node.get('data-post', '')
        if not re.fullmatch(r'WatcherGuru/[1-9][0-9]{0,17}', post, re.I):
            raise ValueError('unexpected source post id')
        source_id = post.split('/')[-1]
        ids.append(int(source_id))
        body = node.select_one('.tgme_widget_message_text')
        if body is None:
            media += 1
            continue
        for br in body.find_all('br'):
            br.replace_with('\n')
        stamp = node.select_one('time[datetime]')
        records.append({'source': 'watcher_guru', 'source_id': source_id,
                        'raw_text': body.get_text('', strip=False).strip(),
                        'published_at': stamp.get('datetime') if stamp else None})
    if not ids:
        raise ValueError('no_source_posts_layout_or_access_failure')
    return records, ids, media


@exclusive_writer
def collect(database, max_pages=5, fetcher=fetch_page):
    if not 1 <= max_pages <= 100:
        raise ValueError('max_pages must be 1..100')
    counts = dict(pages=0, inserted=0, duplicate=0, quarantined=0, media_skipped=0)
    with connect(database) as db:
        saved = db.execute("SELECT payload FROM checkpoints WHERE name='telegram'").fetchone()
        state = json.loads(saved[0]) if saved else {'anchor': None, 'before': None, 'head': None,
                                                  'coverage': 'initial_latest_page_only'}
        for _ in range(max_pages):
            page = db.execute("SELECT * FROM fetch_pages WHERE state='pending' ORDER BY id LIMIT 1").fetchone()
            if page is None:
                html = fetcher(state['before'])
                if len(html.encode('utf-8')) > MAX_PAGE_BYTES:
                    raise ValueError('page_too_large')
                with db:
                    ensure_capacity(db)
                    cur = db.execute('INSERT INTO fetch_pages(before_id,observed_at,html) VALUES (?,?,?)',
                                     (state['before'], utcnow().isoformat(), html))
                page = db.execute('SELECT * FROM fetch_pages WHERE id=?', (cur.lastrowid,)).fetchone()
            try:
                records, ids, media = page_records(page['html'], date(page['observed_at']))
                if state['before'] is not None and min(ids) >= state['before']:
                    raise ValueError('pagination_did_not_advance')
                head = state['head'] if state['head'] is not None else max(ids)
                reached = state['anchor'] is None or min(ids) <= state['anchor']
                new_state = {'anchor': head if reached else state['anchor'],
                             'before': None if reached else min(ids),
                             'head': None if reached else head,
                             'coverage': ('initial_latest_page_only' if state['anchor'] is None else
                                          'caught_up_to_previous_anchor' if reached else 'catchup_incomplete'),
                             'updated_at': utcnow().isoformat()}
                with db:
                    for record in records:
                        counts[save_record(db, record, date(page['observed_at']), 'live_poll')] += 1
                    db.execute("UPDATE fetch_pages SET state='done',error=NULL WHERE id=?", (page['id'],))
                    db.execute('INSERT OR REPLACE INTO checkpoints VALUES (?,?)', ('telegram', json.dumps(new_state)))
                state = new_state
                counts['pages'] += 1
                counts['media_skipped'] += media
                if reached:
                    break
            except Exception as exc:
                # Preserve the fetched body for audit. Next run retries HTTP at the same cursor.
                with db:
                    db.execute("UPDATE fetch_pages SET state='failed',error=? WHERE id=?",
                               (f'{type(exc).__name__}: {str(exc)[:200]}', page['id']))
                raise
        counts['checkpoint'] = state
    return counts
