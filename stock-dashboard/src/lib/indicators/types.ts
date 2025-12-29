export interface IndicatorPoint {
  time: string;  // YYYY-MM-DD
  value: number | null;
}

export interface MACDPoint {
  time: string;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface BollingerBandPoint {
  time: string;
  upper: number | null;
  middle: number | null;
  lower: number | null;
}

export interface IndicatorResults {
  sma20: IndicatorPoint[];
  sma60: IndicatorPoint[];
  macd: MACDPoint[];
  bollingerBands: BollingerBandPoint[];
}
