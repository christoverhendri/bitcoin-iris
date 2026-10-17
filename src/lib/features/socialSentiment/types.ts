/** One day's share of BTC social posts per sentiment label. The three sum to 1. */
export interface SocialSentimentDay {
  /** YYYY-MM-DD (UTC day the posts were made). */
  date: string;
  positive: number;
  neutral: number;
  negative: number;
}

export interface SocialSentimentData {
  /** Newest day available. */
  latest: SocialSentimentDay;
  /** Oldest first, newest last (`latest` is the final element). */
  history: SocialSentimentDay[];
  /** Platforms behind Santiment's "total". */
  sources: string[];
  /**
   * Whole days between `latest.date` and the day it was fetched. Santiment's free
   * plan withholds the latest 30 days, so this is normally ~30.
   */
  lagDays: number;
}

export interface SocialSentimentArgs {
  days?: number;
}
