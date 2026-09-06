export interface RatioPoint {
  ts: number;
  /** Longs divided by shorts. 1.0 is balanced. */
  ratio: number;
  /** Long side as a fraction of the cohort, 0-1. */
  longShare: number;
}

export interface TakerPoint {
  ts: number;
  buyVol: number;
  sellVol: number;
  ratio: number;
  /** `buyVol - sellVol`, in the venue's contract units. Signed. */
  netVol: number;
}

/** One venue's spot price, for the cross-exchange spread table. */
export interface VenuePrice {
  venue: string;
  price: number;
  /** Percent difference against the reference venue (Binance). Signed. */
  spreadPct: number;
}

export interface PositioningData {
  /** All Binance futures accounts, one vote each — the retail cohort. Oldest first. */
  retail: RatioPoint[];
  /** Top accounts by margin balance, weighted by position — the large book. */
  topTrader: RatioPoint[];
  /** Aggressive flow that crossed the spread. Oldest first. */
  taker: TakerPoint[];

  /** Latest readings, hoisted so panels do not re-derive them. */
  retailRatio: number;
  topTraderRatio: number;
  takerBuySellRatio: number;

  /**
   * OPINION, not a published index: `topTraderRatio - retailRatio`. Positive
   * means the large book is more long than the crowd.
   */
  divergence: number;
  /** OPINION. Bucketed from `divergence` and retail crowding — see DECISIONS.md. */
  bias: 'bullish' | 'bearish' | 'neutral';
  /** One plain sentence explaining the bucket the bias fell into. */
  biasReason: string;

  /** Coinbase vs Binance spot, percent. Positive = the US bid is paying up. */
  coinbasePremiumPct: number;
  /** Reference price every spread is measured against. */
  referencePrice: number;
  venues: VenuePrice[];
  /** Widest absolute venue spread, percent. */
  maxSpreadPct: number;

  /** Which inputs answered. Drives per-panel "—" instead of blanking the page. */
  available: {
    retail: boolean;
    topTrader: boolean;
    taker: boolean;
    premium: boolean;
  };
}

export interface PositioningArgs {
  symbol?: string;
  /** Hours of hourly history to request. Default 48. */
  hours?: number;
}
