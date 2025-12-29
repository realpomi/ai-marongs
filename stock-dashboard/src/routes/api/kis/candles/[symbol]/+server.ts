import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kisClient } from '$lib/server/kis';
import {
  saveUsStockCandles,
  updateTickerLastCollected
} from '$lib/server/repositories/candle.repository';
import type {
  Exchange,
  Market,
  CandleInterval,
  UsStockCandleRaw,
  KrStockCandleRaw
} from '$lib/server/kis/types';

export const GET: RequestHandler = async ({ params, url }) => {
  const { symbol } = params;
  const market = (url.searchParams.get('market') || 'us') as Market;
  const exchange = (url.searchParams.get('exchange') || 'NAS') as Exchange;
  const interval = (url.searchParams.get('interval') || '60m') as CandleInterval;
  const count = parseInt(url.searchParams.get('count') || '30');
  const save = url.searchParams.get('save') === 'true';
  const yearly = url.searchParams.get('yearly') === 'true';

  try {
    let usCandles: UsStockCandleRaw[] | null = null;
    let krCandles: KrStockCandleRaw[] | null = null;

    if (market === 'us') {
      if (yearly && interval === 'daily') {
        usCandles = await kisClient.fetchUsStockCandlesDailyYear(symbol, exchange, 365);
      } else if (interval === 'daily') {
        usCandles = await kisClient.fetchUsStockCandlesDaily(symbol, exchange, count);
      } else {
        usCandles = await kisClient.fetchUsStockCandles60m(symbol, exchange, count);
      }
    } else {
      krCandles = await kisClient.fetchKrStockCandlesHourly(symbol);
    }

    // DB 저장 옵션 (미국 주식만 지원)
    if (save && usCandles && usCandles.length > 0) {
      const saved = await saveUsStockCandles(symbol, interval, usCandles, 'kis');
      await updateTickerLastCollected(symbol);
      return json({ symbol, interval, count: usCandles.length, saved, candles: usCandles });
    }

    const candles = usCandles || krCandles || [];
    return json({ symbol, interval, count: candles.length, candles });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
