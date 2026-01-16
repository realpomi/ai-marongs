import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tickerInitQueue } from '$lib/server/ticker-init-queue';
import type { Exchange } from '$lib/server/kis/types';

/**
 * POST /api/tickers/queue/add - 큐에 티커 추가 (수동)
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { symbol, exchange = 'NAS' } = await request.json();

    if (!symbol || typeof symbol !== 'string') {
      return json({ error: 'Symbol is required' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase().trim();
    const upperExchange = (exchange || 'NAS').toUpperCase().trim() as Exchange;

    // 큐에 추가
    await tickerInitQueue.add(upperSymbol, upperExchange);

    const status = tickerInitQueue.getStatus();

    return json({
      success: true,
      message: `${upperSymbol} 큐에 추가됨`,
      queueLength: status.queueLength,
      isProcessing: status.isProcessing,
      currentSymbol: status.currentSymbol
    });
  } catch (error) {
    console.error('Failed to add to queue:', error);
    return json({ error: 'Failed to add to queue' }, { status: 500 });
  }
};
