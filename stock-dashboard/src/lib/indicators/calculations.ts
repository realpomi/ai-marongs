import type { IndicatorResults, IndicatorPoint, MACDPoint, BollingerBandPoint } from './types';

interface Candle {
  candle_time: any;
  close_price: any;
  [key: string]: any;
}

export function calculateSMA(candles: Candle[], period: number): IndicatorPoint[] {
  const results: IndicatorPoint[] = [];
  const prices = candles.map(c => Number(c.close_price));

  for (let i = 0; i < prices.length; i++) {
    const time = new Date(candles[i].candle_time).toISOString().split('T')[0];
    
    if (i < period - 1) {
      results.push({ time, value: null });
      continue;
    }

    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    results.push({ time, value: sum / period });
  }

  return results;
}

export function calculateEMA(candles: Candle[], period: number): IndicatorPoint[] {
  const results: IndicatorPoint[] = [];
  const prices = candles.map(c => Number(c.close_price));
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < prices.length; i++) {
    const time = new Date(candles[i].candle_time).toISOString().split('T')[0];

    if (i === 0) {
      ema = prices[i];
    } else {
      ema = (prices[i] - (ema as number)) * k + (ema as number);
    }

    if (i < period - 1) {
      results.push({ time, value: null });
    } else {
      results.push({ time, value: ema });
    }
  }

  return results;
}

export function calculateMACD(
  candles: Candle[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9
): MACDPoint[] {
  const fastEMA = calculateEMA(candles, fast);
  const slowEMA = calculateEMA(candles, slow);
  
  const macdLines: IndicatorPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const time = new Date(candles[i].candle_time).toISOString().split('T')[0];
    const fValue = fastEMA[i].value;
    const sValue = slowEMA[i].value;
    
    if (fValue !== null && sValue !== null) {
      macdLines.push({ time, value: fValue - sValue });
    } else {
      macdLines.push({ time, value: null });
    }
  }

  // Signal line is EMA of MACD line
  // We need to handle nulls in EMA calculation for MACD Line
  const macdLineValues = macdLines.map(m => m.value);
  const k = 2 / (signal + 1);
  let signalEma: number | null = null;
  const signalLines: (number | null)[] = [];

  // Find first non-null macd value
  const firstValidIndex = macdLineValues.findIndex(v => v !== null);

  for (let i = 0; i < macdLineValues.length; i++) {
    const val = macdLineValues[i];
    
    if (i < firstValidIndex || val === null) {
      signalLines.push(null);
      continue;
    }

    if (signalEma === null) {
      signalEma = val;
    } else {
      signalEma = (val - signalEma) * k + signalEma;
    }

    if (i < firstValidIndex + signal - 1) {
      signalLines.push(null);
    } else {
      signalLines.push(signalEma);
    }
  }

  return macdLines.map((m, i) => {
    const signalVal = signalLines[i];
    return {
      time: m.time,
      macd: m.value,
      signal: signalVal,
      histogram: (m.value !== null && signalVal !== null) ? m.value - signalVal : null
    };
  });
}

export function calculateBollingerBands(
  candles: Candle[],
  period: number = 20,
  stdDev: number = 2
): BollingerBandPoint[] {
  const results: BollingerBandPoint[] = [];
  const prices = candles.map(c => Number(c.close_price));

  for (let i = 0; i < prices.length; i++) {
    const time = new Date(candles[i].candle_time).toISOString().split('T')[0];

    if (i < period - 1) {
      results.push({ time, upper: null, middle: null, lower: null });
      continue;
    }

    const slice = prices.slice(i - period + 1, i + 1);
    const middle = slice.reduce((a, b) => a + b, 0) / period;
    
    const variance = slice.reduce((a, b) => a + Math.pow(b - middle, 2), 0) / period;
    const sd = Math.sqrt(variance);

    results.push({
      time,
      upper: middle + stdDev * sd,
      middle,
      lower: middle - stdDev * sd
    });
  }

  return results;
}

export function calculateAllIndicators(candles: Candle[]): IndicatorResults {
  // Ensure candles are sorted chronologically
  const sortedCandles = [...candles].sort((a, b) => 
    new Date(a.candle_time).getTime() - new Date(b.candle_time).getTime()
  );

  return {
    sma20: calculateSMA(sortedCandles, 20),
    sma60: calculateSMA(sortedCandles, 60),
    macd: calculateMACD(sortedCandles),
    bollingerBands: calculateBollingerBands(sortedCandles)
  };
}
