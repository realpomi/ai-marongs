import cron, { type ScheduledTask } from 'node-cron';
import sql from '$lib/server/db';
import { kisClient } from '$lib/server/kis';
import { saveUsStockCandles, updateTickerLastCollected } from '$lib/server/repositories/candle.repository';
import { analyzeSignal } from '$lib/server/analysis';
import { createTickerSignalsTable, saveTickerSignal } from '$lib/server/repositories/signal.repository';
import type { Exchange } from '$lib/server/kis/types';

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1455121065524330675/C-MYiWr8WAOymA1dCbstYnnd0N5kO8YY8hTDzwSWYsOTg5OfSN_JWl0cRsfByBlu0Hqs';

async function sendDiscordNotification(message: string) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (error) {
    console.error('[Scheduler] Failed to send Discord notification:', error);
  }
}

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
  private isAnalyzing = false; // 분석 중복 실행 방지
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
    sendDiscordNotification('🚀 [Scheduler] 일봉 데이터 수집 시작...');

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

      const message = `[Scheduler] 수집 완료: ${tickers.length}개 티커, ${totalSaved}건 저장, ${errors}개 오류, ${duration}ms 소요`;
      console.log(message);
      sendDiscordNotification(`✅ ${message}`);

      // 수집 완료 후 시그널 분석 실행
      await this.analyzeAllTickers(tickers.map(t => t.symbol));

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
      sendDiscordNotification(`❌ [Scheduler] 수집 중 오류 발생: ${errorMsg}`);

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
   * 수동 실행 (API에서 호출용) - 수집 + 분석
   */
  async runNow() {
    return this.collectAllTickers();
  }

  /**
   * 시그널 분석만 수동 실행 (수집 없이)
   */
  async runAnalyzeOnly(): Promise<{
    success: boolean;
    analyzed: number;
    failed: number;
    strongBuySignals: string[];
    skipped?: boolean;
  }> {
    // 이미 분석 중이면 스킵
    if (this.isAnalyzing) {
      console.log('[Scheduler] 이미 분석 중입니다. 스킵합니다.');
      return {
        success: false,
        analyzed: 0,
        failed: 0,
        strongBuySignals: [],
        skipped: true
      };
    }

    // 활성 티커 조회
    const tickers = await sql<{ symbol: string }[]>`
      SELECT symbol FROM managed_tickers
      WHERE is_active = true
      ORDER BY symbol
    `;

    const symbols = tickers.map(t => t.symbol);

    // 분석 실행
    const result = await this.analyzeAllTickersWithResult(symbols);
    return result;
  }

  /**
   * 전체 티커의 시그널 분석 및 저장 (결과 반환 버전)
   */
  private async analyzeAllTickersWithResult(symbols: string[]): Promise<{
    success: boolean;
    analyzed: number;
    failed: number;
    strongBuySignals: string[];
  }> {
    this.isAnalyzing = true;

    try {
      console.log('[Scheduler] 시그널 분석 시작...');
      sendDiscordNotification('📊 [Scheduler] 시그널 분석 시작...');

      // 테이블 존재 확인/생성
      await createTickerSignalsTable();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let analyzed = 0;
      let failed = 0;
      const strongBuySignals: string[] = [];

      for (const symbol of symbols) {
        try {
          const candles = await sql<{
            candle_time: Date;
            open_price: string;
            high_price: string;
            low_price: string;
            close_price: string;
            volume: string;
          }[]>`
            SELECT candle_time, open_price, high_price, low_price, close_price, volume
            FROM us_stock_candles
            WHERE symbol = ${symbol}
              AND interval = 'daily'
              AND source = 'kis'
            ORDER BY candle_time DESC
            LIMIT 365
          `;

          if (candles.length < 60) {
            console.log(`[Scheduler] ${symbol}: 분석 데이터 부족 (${candles.length}일)`);
            continue;
          }

          const analysis = analyzeSignal(candles);
          if (!analysis) {
            console.log(`[Scheduler] ${symbol}: 분석 실패`);
            failed++;
            continue;
          }

          await saveTickerSignal(symbol, today, analysis);
          analyzed++;

          if (analysis.signalLevel >= 4) {
            strongBuySignals.push(`${symbol}(Lv${analysis.signalLevel})`);
          }

          console.log(`[Scheduler] ${symbol}: 시그널 Lv${analysis.signalLevel} (${analysis.signalKeyword})`);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error(`[Scheduler] ${symbol} 분석 오류:`, errorMsg);
          failed++;
        }
      }

      const summaryMsg = `[Scheduler] 시그널 분석 완료: ${analyzed}개 분석, ${failed}개 실패`;
      console.log(summaryMsg);

      let discordMsg = `📊 ${summaryMsg}`;
      if (strongBuySignals.length > 0) {
        discordMsg += `\n🔥 매수 시그널: ${strongBuySignals.join(', ')}`;
      }
      sendDiscordNotification(discordMsg);

      return {
        success: failed === 0,
        analyzed,
        failed,
        strongBuySignals
      };
    } finally {
      this.isAnalyzing = false;
    }
  }

  /**
   * 전체 티커의 시그널 분석 및 저장 (기존 호환용)
   */
  async analyzeAllTickers(symbols: string[]): Promise<void> {
    await this.analyzeAllTickersWithResult(symbols);
  }
}

// 싱글톤 인스턴스
export const dailyCollectScheduler = new DailyCollectScheduler();
