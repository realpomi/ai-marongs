import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sql from '$lib/server/db';
import { kisClient } from '$lib/server/kis';
import {
  saveUsStockCandles,
  updateTickerLastCollected
} from '$lib/server/repositories/candle.repository';
import type { CandleInterval, Exchange } from '$lib/server/kis/types';

interface CollectResult {
  symbol: string;
  interval: string;
  saved: number;
  error?: string;
}

export const POST: RequestHandler = async ({ request, url }) => {
  // URL 쿼리 파라미터 또는 body에서 옵션 가져오기
  const intervalParam = url.searchParams.get('interval');
  let symbols: string[] | undefined;
  let interval: CandleInterval | 'all' = 'all';

  // body가 있으면 파싱
  try {
    const body = await request.json();
    symbols = body.symbols;
    interval = body.interval || intervalParam || 'all';
  } catch {
    interval = (intervalParam as CandleInterval | 'all') || 'all';
  }

  try {
    // 심볼이 지정되지 않으면 활성 티커 전체 조회
    let tickers: { symbol: string; exchange: string }[];

    if (symbols && symbols.length > 0) {
      tickers = await sql`
        SELECT symbol, exchange FROM managed_tickers
        WHERE symbol = ANY(${symbols}) AND is_active = true
      `;
    } else {
      tickers = await sql`
        SELECT symbol, exchange FROM managed_tickers
        WHERE is_active = true
      `;
    }

    const results: CollectResult[] = [];

    for (const ticker of tickers) {
      const exchange = (ticker.exchange || 'NAS') as Exchange;

      try {
        // 60분봉 수집
        if (interval === 'all' || interval === '60m') {
          const candles60m = await kisClient.fetchUsStockCandles60m(ticker.symbol, exchange, 30);
          const saved60m = await saveUsStockCandles(ticker.symbol, '60m', candles60m, 'kis');
          results.push({ symbol: ticker.symbol, interval: '60m', saved: saved60m });
        }

        // 일봉 수집
        if (interval === 'all' || interval === 'daily') {
          const candlesDaily = await kisClient.fetchUsStockCandlesDaily(ticker.symbol, exchange, 30);
          const savedDaily = await saveUsStockCandles(ticker.symbol, 'daily', candlesDaily, 'kis');
          results.push({ symbol: ticker.symbol, interval: 'daily', saved: savedDaily });
        }

        await updateTickerLastCollected(ticker.symbol);
      } catch (e) {
        results.push({ symbol: ticker.symbol, interval, saved: 0, error: String(e) });
      }
    }

    const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
    const errors = results.filter((r) => r.error);

    return json({
      success: true,
      totalTickers: tickers.length,
      totalSaved,
      errors: errors.length,
      results
    });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
