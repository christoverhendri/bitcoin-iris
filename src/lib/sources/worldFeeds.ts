/**
 * Non-crypto feeds for the Global Events map: general world news, and the
 * primary institutional sources that actually move this market.
 *
 * ## Reuters is gone
 *
 * `reutersagency.com/feed/` now 404s and `feeds.reuters.com` no longer resolves —
 * Reuters retired public RSS. Routing it through a Google News search feed
 * returns a consent page with zero items. There is no keyless replacement, so it
 * was removed rather than left in place failing quietly, which is what it had
 * been doing.
 *
 * ## Why regulators are here
 *
 * `INSTITUTION_FEEDS` are **primary sources** — the SEC's own press release, not
 * a story about it. For a terminal whose classifier has REGULATION and MONETARY
 * buckets, that is a categorically better input than another outlet's coverage,
 * and it arrives first.
 *
 * They come with one problem the news feeds do not have: institutional headlines
 * rarely name a place. "SEC Proposes Rescission of Political Contribution Rule"
 * geocodes to nothing, so the gazetteer would drop it and the map would lose the
 * highest-signal item in the batch. `SOURCE_PIN` fixes that — each institution
 * has a fixed, known address, so its headlines fall back to it.
 *
 * Every feed below was verified returning parseable items from a datacentre IP.
 */
import type { FeedDef } from './rss';

/** General world news. Al Jazeera and AP were already here; the rest are new. */
export const WORLD_FEEDS: FeedDef[] = [
  { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'AP', url: 'https://feedx.net/rss/ap.xml' },
  { source: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'Guardian', url: 'https://www.theguardian.com/world/rss' },
  { source: 'France 24', url: 'https://www.france24.com/en/rss' },
  { source: 'UN News', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
];

/** Regulators and central banks, straight from the source. */
export const INSTITUTION_FEEDS: FeedDef[] = [
  { source: 'SEC', url: 'https://www.sec.gov/news/pressreleases.rss' },
  { source: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { source: 'CFTC', url: 'https://www.cftc.gov/RSS/RSSGP/rssgp.xml' },
  { source: 'ECB', url: 'https://www.ecb.europa.eu/rss/press.html' },
];

/**
 * Deliberately the same shape as `GeoHit` from `lib/geo/gazetteer`, so a pin can
 * stand in for a geocode result without a branch at the call site.
 */
export interface GeoPin {
  lat: number;
  lon: number;
  iso2: string;
  name: string;
}

/**
 * Fallback location for sources that publish from one fixed address.
 *
 * Only applied when the gazetteer finds no place in the headline itself — a
 * story the SEC publishes *about Japan* should still land on Japan.
 */
export const SOURCE_PIN: Record<string, GeoPin> = {
  SEC: { lat: 38.8951, lon: -77.0364, iso2: 'US', name: 'Washington' },
  'Federal Reserve': { lat: 38.8921, lon: -77.0455, iso2: 'US', name: 'Washington' },
  CFTC: { lat: 38.8977, lon: -77.0365, iso2: 'US', name: 'Washington' },
  ECB: { lat: 50.1094, lon: 8.6742, iso2: 'DE', name: 'Frankfurt' },
  'UN News': { lat: 40.7489, lon: -73.968, iso2: 'US', name: 'New York' },
};
