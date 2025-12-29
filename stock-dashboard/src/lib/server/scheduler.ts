import cron, { type ScheduledTask } from 'node-cron';
import sql from '$lib/server/db';
import { kisClient } from '$lib/server/kis';
import { saveUsStockCandles, updateTickerLastCollected } from '$lib/server/repositories/candle.repository';
import type { Exchange } from '$lib/server/kis/types';

interface CollectResult {
  symbol: string;
  saved: number;
  error?: string;
}

interface SchedulerStatus {
  isRunning: boolean;
  lastRun: Date | null;
  lastResult: {
    success: boolean;
    totalTickers: number;
    totalSaved: number;
    errors: number;
    duration: number;
  } | null;
  nextRun: Date | null;
}

class DailyCollectScheduler {
  private task: ScheduledTask | null = null;
  private isCollecting = false;
  private status: SchedulerStatus = {
    isRunning: false,
    lastRun: null,
    lastResult: null,
    nextRun: null
  };

  /**
   * 스케줄러 시작 (매일 08:00 KST = 23:00 UTC)
   * KST는 UTC+9이므로 08:00 KST = 23:00 UTC (전날)
   */
  start() {
    if (this.task) {
      console.log('[Scheduler] 이미 실행 중입니다.');
      return;
    }

    // 매일 23:00 UTC = 08:00 KST
    this.task = cron.schedule('0 23 * * *', async () => {
      await this.collectAllTickers();
    }, {
      timezone: 'UTC'
    });

    this.status.isRunning = true;
    this.updateNextRun();
    console.log('[Scheduler] 일봉 수집 스케줄러 시작 (매일 08:00 KST)');
  }

  /**
   * 스케줄러 중지
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.status.isRunning = false;
      this.status.nextRun = null;
      console.log('[Scheduler] 스케줄러 중지됨');
    }
  }

  /**
   * 다음 실행 시간 계산
   */
  private updateNextRun() {
    const now = new Date();
    const next = new Date(now);

    // 다음 21:00 UTC 계산
    next.setUTCHours(21, 0, 0, 0);
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    this.status.nextRun = next;
  }

  /**
   * 전체 활성 티커의 일봉 데이터 수집
   * Rate limit을 준수하며 순차적으로 수집
   */
  async collectAllTickers(): Promise<{
    success: boolean;
    totalTickers: number;
    totalSaved: number;
    errors: number;
    results: CollectResult[];
  }> {
    if (this.isCollecting) {
      console.log('[Scheduler] 이미 수집 중입니다. 스킵합니다.');
      return {
        success: false,
        totalTickers: 0,
        totalSaved: 0,
        errors: 1,
        results: [{ symbol: '', saved: 0, error: '이미 수집 중' }]
      };
    }

    this.isCollecting = true;
    const startTime = Date.now();
    console.log('[Scheduler] 일봉 데이터 수집 시작...');

    const results: CollectResult[] = [];

    try {
      // 활성 티커 조회
      const tickers = await sql<{ symbol: string; exchange: string }[]>`
        SELECT symbol, exchange FROM managed_tickers
        WHERE is_active = true
        ORDER BY symbol
      `;

      console.log(`[Scheduler] 총 ${tickers.length}개 티커 수집 예정`);

      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        const exchange = (ticker.exchange || 'NAS') as Exchange;

        try {
          console.log(`[Scheduler] [${i + 1}/${tickers.length}] ${ticker.symbol} 수집 중...`);

          // 일봉 30개 조회 (최근 데이터 업데이트용)
          const candles = await kisClient.fetchUsStockCandlesDaily(ticker.symbol, exchange, 30);
          const saved = await saveUsStockCandles(ticker.symbol, 'daily', candles, 'kis');
          await updateTickerLastCollected(ticker.symbol);

          results.push({ symbol: ticker.symbol, saved });
          console.log(`[Scheduler] ${ticker.symbol}: ${saved}건 저장 완료`);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          results.push({ symbol: ticker.symbol, saved: 0, error: errorMsg });
          console.error(`[Scheduler] ${ticker.symbol} 수집 실패:`, errorMsg);
        }

        // Rate limit 대기는 kisClient 내부에서 처리됨 (500ms)
      }

      const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
      const errors = results.filter((r) => r.error).length;
      const duration = Date.now() - startTime;

      this.status.lastRun = new Date();
      this.status.lastResult = {
        success: errors === 0,
        totalTickers: tickers.length,
        totalSaved,
        errors,
        duration
      };
      this.updateNextRun();

      console.log(`[Scheduler] 수집 완료: ${tickers.length}개 티커, ${totalSaved}건 저장, ${errors}개 오류, ${duration}ms 소요`);

      return {
        success: errors === 0,
        totalTickers: tickers.length,
        totalSaved,
        errors,
        results
      };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error('[Scheduler] 수집 중 오류 발생:', errorMsg);

      this.status.lastRun = new Date();
      this.status.lastResult = {
        success: false,
        totalTickers: 0,
        totalSaved: 0,
        errors: 1,
        duration: Date.now() - startTime
      };

      return {
        success: false,
        totalTickers: 0,
        totalSaved: 0,
        errors: 1,
        results: [{ symbol: '', saved: 0, error: errorMsg }]
      };
    } finally {
      this.isCollecting = false;
    }
  }

  /**
   * 현재 상태 조회
   */
  getStatus(): SchedulerStatus & { isCollecting: boolean } {
    return {
      ...this.status,
      isCollecting: this.isCollecting
    };
  }

  /**
   * 수동 실행 (API에서 호출용)
   */
  async runNow() {
    return this.collectAllTickers();
  }
}

// 싱글톤 인스턴스
export const dailyCollectScheduler = new DailyCollectScheduler();
