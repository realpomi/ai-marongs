import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dailyCollectScheduler } from '$lib/server/scheduler';

/**
 * GET /api/scheduler - 스케줄러 상태 조회
 */
export const GET: RequestHandler = async () => {
  const status = dailyCollectScheduler.getStatus();

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
  const result = await dailyCollectScheduler.runNow();

  return json(result);
};