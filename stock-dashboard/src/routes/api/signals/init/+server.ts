import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTickerSignalsTable } from '$lib/server/repositories/signal.repository';

/**
 * POST /api/signals/init
 * ticker_signals 테이블 생성
 */
export const POST: RequestHandler = async () => {
  try {
    await createTickerSignalsTable();
    return json({ success: true, message: 'ticker_signals 테이블 생성/확인 완료' });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: errorMsg }, { status: 500 });
  }
};
