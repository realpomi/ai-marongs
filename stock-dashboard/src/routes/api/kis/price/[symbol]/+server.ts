import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kisClient } from '$lib/server/kis';
import type { Exchange, Market } from '$lib/server/kis/types';

export const GET: RequestHandler = async ({ params, url }) => {
  const { symbol } = params;
  const market = (url.searchParams.get('market') || 'us') as Market;
  const exchange = (url.searchParams.get('exchange') || 'NAS') as Exchange;

  try {
    let price;

    if (market === 'us') {
      price = await kisClient.fetchUsStockPrice(symbol, exchange);
    } else {
      price = await kisClient.fetchKrStockPrice(symbol);
    }

    if (!price) {
      return json({ error: '현재가 조회 실패' }, { status: 404 });
    }

    return json({ symbol, market, price });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
