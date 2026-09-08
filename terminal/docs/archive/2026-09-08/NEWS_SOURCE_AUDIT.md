> Archived on 2026-09-08. Historical upstream/import observations and decisions; not current operational status. See [current integration contract](../../../../docs/integration.md).

# News source audit - 2026-09-06

The current feed snapshot contains 101 unique headlines. Successful HTTP checks
mean the publisher returned a valid RSS document, not that a new article exists.
The newest feed publication timestamps observed through the actual server were:

| Publisher | Newest RSS publication (UTC) | Comparison |
| --- | --- | --- |
| CoinDesk | 2026-09-05 18:05:11 | Top/latest homepage story matched RSS |
| Decrypt | 2026-09-05 17:01:04 | Top News story matched RSS |
| CoinTelegraph | 2026-09-05 11:16:19 | First Live News entry matched RSS |
| NewsBTC | 2026-09-04 07:48:19 | Homepage featured older promotional material; it did not establish a fresher editorial item |

Primary pages inspected: https://www.coindesk.com/ , https://decrypt.co/ ,
https://cointelegraph.com/ , https://www.newsbtc.com/ . Their observed pages are
snapshots, not proof that no newer article exists anywhere on each publisher.
NewsBTC homepage placement does not provide a reliable freshness benchmark.

A direct CoinDesk RSS read returned HTTP 200 and 25 items, with the same newest
publication timestamp. The pipeline's raw feed parsing and newest-first ordering
therefore agree for that source. No evidence found in this check establishes a
12-hour parser/transport delay; the inspected publisher pages also feature older
stories. Do not relabel fetch time as publication time or manufacture newer dates.

RSS URLs audited via the server:
- https://www.coindesk.com/arc/outboundfeeds/rss
- https://decrypt.co/feed
- https://cointelegraph.com/rss
- https://www.newsbtc.com/feed/

The response exposes newestPublishedAt independently from fetchedAt and
nextCheckAt. Archives now preserve future observed history but cannot reconstruct
unobserved stories removed before installation. If broader or faster editorial
coverage is required, evaluate an additional licensed/source-approved provider;
raising request frequency alone does not address publication cadence.
