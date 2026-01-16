import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tickerInitQueue } from '$lib/server/ticker-init-queue';
import type { Exchange } from '$lib/server/kis/types';

/**
 * GET /api/tickers/queue - 큐 상태 조회
 */
export const GET: RequestHandler = async () => {
  const status = tickerInitQueue.getStatus();

  return json({
    success: true,
    ...status
  });
};

/**
 * POST /api/tickers/queue - 큐 관리
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { action } = body;

  if (action === 'clear') {
    tickerInitQueue.clear();
    return json({ success: true, message: '큐가 초기화되었습니다.' });
  }

  if (action === 'resetStats') {
    tickerInitQueue.resetStats();
    return json({ success: true, message: '통계가 초기화되었습니다.' });
  }

  return json({ error: 'Invalid action' }, { status: 400 });
};
