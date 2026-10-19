export type ConfluenceLayer = 'MACRO' | 'SENTIMENT' | 'TECHNICAL' | 'NEWS';

export interface ConfluenceData {
  layers: Record<ConfluenceLayer, number>;
  scores: {
    overall: number;
    bullish: number;
    bearish: number;
  };
}

export interface ConfluenceArgs {
  symbol?: string;
}
