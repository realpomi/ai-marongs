import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sql from '$lib/server/db';
import { tickerInitQueue } from '$lib/server/ticker-init-queue';
import type { Exchange } from '$lib/server/kis/types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { symbol, exchange = 'NAS', name } = await request.json();

    if (!symbol || typeof symbol !== 'string') {
      return json({ error: 'Symbol is required' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase().trim();
    const upperExchange = (exchange || 'NAS').toUpperCase().trim() as Exchange;

    // 기존 티커인지 확인
    const existing = await sql`
      SELECT id, symbol FROM managed_tickers
      WHERE symbol = ${upperSymbol}
    `;

    const isNewTicker = existing.length === 0;

    // 티커 추가 (이미 있으면 업데이트)
    const result = await sql`
      INSERT INTO managed_tickers (symbol, name, exchange)
      VALUES (${upperSymbol}, ${name || null}, ${upperExchange})
      ON CONFLICT (symbol) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, managed_tickers.name),
        exchange = EXCLUDED.exchange,
        is_active = TRUE,
        updated_at = NOW()
      RETURNING id, symbol, name, exchange, is_active
    `;

    const ticker = result[0];

    // 새로운 티커인 경우 1년치 데이터 수집 큐에 추가
    if (isNewTicker) {
      await tickerInitQueue.add(ticker.symbol, upperExchange);
      console.log(`[API] 새 티커 ${ticker.symbol} - 1년치 데이터 수집 큐에 추가됨`);
    }

    return json({
      success: true,
      ticker,
      message: `티커 ${ticker.symbol} 등록 완료${isNewTicker ? ' (1년치 데이터 수집 중...)' : ''}`,
      queuedForInit: isNewTicker
    });
  } catch (error) {
    console.error('Failed to add ticker:', error);
    return json({ error: 'Failed to add ticker' }, { status: 500 });
  }
};

export const GET: RequestHandler = async () => {
  try {
    const tickers = await sql`
      SELECT id, symbol, name, exchange, is_active, created_at, updated_at, last_collected_at
      FROM managed_tickers
      WHERE is_active = true
      ORDER BY symbol ASC
    `;

    return json({ tickers });
  } catch (error) {
    console.error('Failed to fetch tickers:', error);
    return json({ error: 'Failed to fetch tickers' }, { status: 500 });
  }
};
