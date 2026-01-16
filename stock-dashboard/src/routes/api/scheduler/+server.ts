import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dailyCollectScheduler } from '$lib/server/scheduler';

/**
 * GET /api/scheduler - 스케줄러 상태 조회
 */
export const GET: RequestHandler = async () => {
  console.log('[API] GET /api/scheduler 호출됨');

  const status = dailyCollectScheduler.getStatus();
  console.log('[API] 스케줄러 상태:', status);

  return json({
    ...status,
    lastRun: status.lastRun?.toISOString() || null,
    nextRun: status.nextRun?.toISOString() || null
  });
};

/**
 * POST /api/scheduler - 수동 실행
 */
export const POST: RequestHandler = async () => {
  console.log('[API] POST /api/scheduler 호출됨');

  try {
    const result = await dailyCollectScheduler.runNow();
    console.log('[API] 스케줄러 실행 완료:', { success: result.success, totalTickers: result.totalTickers });
    return json(result);
  } catch (e) {
    console.error('[API] 스케줄러 실행 중 오류:', e);
    return json({ success: false, error: String(e) }, { status: 500 });
  }
};