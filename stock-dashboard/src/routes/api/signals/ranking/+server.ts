import { json } from '@sveltejs/kit';
import { getRecommendedSignals, getWatchlistSignals } from '$lib/server/repositories/signal.repository';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  try {
    const [recommendations, watchlist] = await Promise.all([
      getRecommendedSignals(),
      getWatchlistSignals()
    ]);

    return json({
      success: true,
      data: {
        recommendations,
        watchlist
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[API] Failed to fetch signals:', error);
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
