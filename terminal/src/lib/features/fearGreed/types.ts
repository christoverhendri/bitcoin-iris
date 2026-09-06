export interface FearGreedData {
  value: number;
  classification: 'Extreme Fear' | 'Fear' | 'Neutral' | 'Greed' | 'Extreme Greed';
  changePct: number;
}

export interface FearGreedArgs {
  limit?: number;
}
