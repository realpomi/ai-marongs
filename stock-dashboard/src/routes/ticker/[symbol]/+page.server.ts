import sql from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const { symbol } = params;
  const source = url.searchParams.get('source') || 'kis'; // 기본값: kis

  // Fetch Ticker Info
  const [ticker] = await sql`
    SELECT * FROM managed_tickers WHERE symbol = ${symbol}
  `;

  // Fetch Daily Candles (Fetch 1 year data for analysis)
  const rawDailyCandles = await sql`
    SELECT * FROM us_stock_candles 
    WHERE symbol = ${symbol} 
      AND interval = 'daily' 
      AND source = ${source}
    ORDER BY candle_time DESC 
    LIMIT 365
  `;

  // Calculate Technical Indicators
  let analysis = null;
  if (rawDailyCandles.length > 0) {
    const currentPrice = Number(rawDailyCandles[0].close_price);
    
    // MA20
    const candles20 = rawDailyCandles.slice(0, 20);
    const ma20 = candles20.length === 20 
      ? candles20.reduce((sum, c) => sum + Number(c.close_price), 0) / 20 
      : null;

    // MA60
    const candles60 = rawDailyCandles.slice(0, 60);
    const ma60 = candles60.length === 60
      ? candles60.reduce((sum, c) => sum + Number(c.close_price), 0) / 60
      : null;

    // 52-Week High (using all fetched data up to 365 days)
    let high52w = 0;
    
    rawDailyCandles.forEach(c => {
      const high = Number(c.high_price);
      if (high > high52w) {
        high52w = high;
      }
    });

    // 2-Week High (for short-term pullback)
    let high2w = 0;
    let high2wDate = '';
    const candles14 = rawDailyCandles.slice(0, 14);

    candles14.forEach(c => {
      const high = Number(c.high_price);
      if (high > high2w) {
        high2w = high;
        high2wDate = c.candle_time;
      }
    });

    // Volume Analysis
    const candles5 = rawDailyCandles.slice(0, 5);
    const avgVol5 = candles5.length > 0
      ? candles5.reduce((sum, c) => sum + Number(c.volume), 0) / candles5.length
      : 0;

    const avgVol20 = candles20.length > 0
      ? candles20.reduce((sum, c) => sum + Number(c.volume), 0) / candles20.length
      : 0;

    const volumeRatio = avgVol20 > 0 ? avgVol5 / avgVol20 : 0;
    
    // Calculate Pullback based on 2-Week High
    const pullbackRate = high2w > 0 ? ((high2w - currentPrice) / high2w) * 100 : 0;
    
    const highDateObj = new Date(high2wDate);
    const latestDateObj = new Date(rawDailyCandles[0].candle_time);
    const daysSinceHigh = Math.floor((latestDateObj.getTime() - highDateObj.getTime()) / (1000 * 3600 * 24));

    // Evaluate Status for Pullback Strategy
    const trendStatus = (ma20 && ma60 && ma20 > ma60) ? 'pass' : 'fail';
    
    let pullbackStatus = 'fail';
    if (pullbackRate >= 5 && pullbackRate <= 15) { // Adjusted range for short-term (5-15%)
      pullbackStatus = 'pass';
    } else if (pullbackRate < 5) {
      pullbackStatus = 'warning'; // Too shallow
    } else {
      pullbackStatus = 'fail'; // Too deep (> 15%)
    }

    const volumeStatus = volumeRatio < 1 ? 'pass' : 'fail';
    
    // Allow 2 to 10 days for short-term pullback
    const durationStatus = (daysSinceHigh >= 2 && daysSinceHigh <= 10) ? 'pass' : 'fail';

    // Consolidation Analysis (Last 5 days range)
    let consolidationStatus = 'fail';
    let consolidationRate = 0;
    
    if (candles5.length > 0) {
      const maxHigh = Math.max(...candles5.map(c => Number(c.high_price)));
      const minLow = Math.min(...candles5.map(c => Number(c.low_price)));
      if (minLow > 0) {
        consolidationRate = ((maxHigh - minLow) / minLow) * 100;
        if (consolidationRate <= 4) { // Within 4% range
           consolidationStatus = 'pass';
        }
      }
    }

    const score = [trendStatus, pullbackStatus, volumeStatus, durationStatus, consolidationStatus].filter(s => s === 'pass').length;

    analysis = {
      ma20,
      ma60,
      trend: (ma20 && ma60 && ma20 > ma60) ? 'UP' : 'DOWN',
      trendStatus,
      high52w,
      high2w,
      currentPrice,
      pullbackRate,
      pullbackStatus,
      volumeRatio,
      volumeStatus,
      daysSinceHigh,
      durationStatus,
      consolidationRate,
      consolidationStatus,
      score
    };
  }

  const dailyCandles = rawDailyCandles.slice(0, 30).map((candle, index) => {
    const prevCandle = rawDailyCandles[index + 1];
    let changePercent = null;
    let volumeChangePercent = null;

    if (prevCandle) {
      const currentClose = Number(candle.close_price);
      const prevClose = Number(prevCandle.close_price);
      if (prevClose !== 0) {
        changePercent = ((currentClose - prevClose) / prevClose) * 100;
      }

      const currentVolume = Number(candle.volume);
      const prevVolume = Number(prevCandle.volume);
      if (prevVolume !== 0) {
        volumeChangePercent = ((currentVolume - prevVolume) / prevVolume) * 100;
      }
    }

    return {
      ...(candle as any),
      change_percent: changePercent,
      volume_change_percent: volumeChangePercent
    };
  });

  // Fetch 60m Candles (Latest 30)
  const hourlyCandles = await sql`
    SELECT * FROM us_stock_candles 
    WHERE symbol = ${symbol} 
      AND interval = '60m' 
      AND source = ${source}
    ORDER BY candle_time DESC 
    LIMIT 30
  `;

  return {
    ticker,
    dailyCandles,
    hourlyCandles,
    currentSource: source,
    analysis
  };
};