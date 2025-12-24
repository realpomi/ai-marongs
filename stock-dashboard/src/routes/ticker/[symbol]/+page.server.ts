import sql from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const { symbol } = params;
  const source = url.searchParams.get('source') || 'kis'; // 기본값: kis

  // Fetch Ticker Info
  const [ticker] = await sql`
    SELECT * FROM managed_tickers WHERE symbol = ${symbol}
  `;

  // Fetch Daily Candles (Latest 31 to calculate change for top 30)
  const rawDailyCandles = await sql`
    SELECT * FROM us_stock_candles 
    WHERE symbol = ${symbol} 
      AND interval = 'daily' 
      AND source = ${source}
    ORDER BY candle_time DESC 
    LIMIT 31
  `;

  const dailyCandles = rawDailyCandles.slice(0, 30).map((candle, index) => {
    const prevCandle = rawDailyCandles[index + 1];
    let changePercent = null;

    if (prevCandle) {
      const currentClose = Number(candle.close_price);
      const prevClose = Number(prevCandle.close_price);
      if (prevClose !== 0) {
        changePercent = ((currentClose - prevClose) / prevClose) * 100;
      }
    }

    return {
      ...(candle as any),
      change_percent: changePercent
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
    currentSource: source
  };
};