import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sql from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { symbol, exchange = 'NAS', name } = await request.json();

    if (!symbol || typeof symbol !== 'string') {
      return json({ error: 'Symbol is required' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase().trim();
    const upperExchange = (exchange || 'NAS').toUpperCase().trim();

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

    return json({
      success: true,
      ticker,
      message: `티커 ${ticker.symbol} 등록 완료`
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
