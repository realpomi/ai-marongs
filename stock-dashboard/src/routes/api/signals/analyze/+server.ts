import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dailyCollectScheduler } from '$lib/server/scheduler';

/**
 * POST /api/signals/analyze
 * 시그널 분석만 수동 실행 (데이터 수집 없이)
 */
export const POST: RequestHandler = async () => {
  try {
    const result = await dailyCollectScheduler.runAnalyzeOnly();

    if (result.skipped) {
      return json({
        success: false,
        message: '이미 분석이 진행 중입니다. 잠시 후 다시 시도해주세요.',
        skipped: true
      }, { status: 409 });
    }

    return json({
      success: result.success,
      analyzed: result.analyzed,
      failed: result.failed,
      strongBuySignals: result.strongBuySignals
    });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: errorMsg }, { status: 500 });
  }
};
