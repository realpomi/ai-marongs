import sql from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
  const { symbol } = params;
  const source = url.searchParams.get('source') || 'kis'; // 기본값: kis

  // Fetch Ticker Info
  const [ticker] = await sql`
    SELECT * FROM managed_tickers WHERE symbol = ${symbol}
  `;

  // Fetch Daily Candles (Latest 30)
  const dailyCandles = await sql`
    SELECT * FROM us_stock_candles 
    WHERE symbol = ${symbol} 
      AND interval = 'daily' 
      AND source = ${source}
    ORDER BY candle_time DESC 
    LIMIT 30
  `;

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