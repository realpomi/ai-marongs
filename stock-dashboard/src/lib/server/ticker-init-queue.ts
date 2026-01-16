import sql from '$lib/server/db';
import { kisClient } from '$lib/server/kis';
import { saveUsStockCandles, updateTickerLastCollected } from '$lib/server/repositories/candle.repository';
import type { Exchange } from '$lib/server/kis/types';

interface QueueItem {
  symbol: string;
  exchange: Exchange;
  addedAt: Date;
}

interface QueueStatus {
  queueLength: number;
  isProcessing: boolean;
  currentSymbol: string | null;
  processed: number;
  failed: number;
}

/**
 * 새로운 티커 등록 시 1년치 데이터를 수집하는 큐 시스템
 * 동시에 여러 티커가 등록되어도 순차적으로 처리됩니다.
 */
class TickerInitQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private currentSymbol: string | null = null;
  private stats = {
    processed: 0,
    failed: 0
  };

  /**
   * 큐에 티커 추가
   */
  async add(symbol: string, exchange: Exchange = 'NAS'): Promise<void> {
    // 중복 체크
    const exists = this.queue.some(item => item.symbol === symbol);
    if (exists) {
      console.log(`[TickerInitQueue] ${symbol}은(는) 이미 큐에 있습니다.`);
      return;
    }

    this.queue.push({
      symbol,
      exchange,
      addedAt: new Date()
    });

    console.log(`[TickerInitQueue] ${symbol} 큐에 추가됨 (큐 길이: ${this.queue.length})`);

    // 처리 중이 아니면 즉시 시작
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 큐 처리 (순차 실행)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (!item) break;

        this.currentSymbol = item.symbol;
        console.log(`[TickerInitQueue] ${item.symbol} 처리 시작 (남은 큐: ${this.queue.length})`);

        try {
          await this.processTickerInit(item.symbol, item.exchange);
          this.stats.processed++;
          console.log(`[TickerInitQueue] ${item.symbol} 처리 완료`);
        } catch (e) {
          this.stats.failed++;
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error(`[TickerInitQueue] ${item.symbol} 처리 실패:`, errorMsg);
        }

        this.currentSymbol = null;
      }
    } finally {
      this.isProcessing = false;
      console.log(`[TickerInitQueue] 큐 처리 완료 (성공: ${this.stats.processed}, 실패: ${this.stats.failed})`);
    }
  }

  /**
   * 개별 티커의 1년치 데이터 수집
   */
  private async processTickerInit(symbol: string, exchange: Exchange): Promise<void> {
    console.log(`[TickerInitQueue] ${symbol} 1년치 데이터 수집 시작...`);

    // 1년치 일봉 조회 (최대 365일)
    const candles = await kisClient.fetchUsStockCandlesDailyYear(symbol, exchange, 365);

    if (candles.length === 0) {
      throw new Error(`${symbol}: 캔들 데이터가 없습니다`);
    }

    // DB 저장
    const saved = await saveUsStockCandles(symbol, 'daily', candles, 'kis');

    // 마지막 수집 시간 업데이트
    await updateTickerLastCollected(symbol);

    console.log(`[TickerInitQueue] ${symbol}: ${saved}건 저장 완료 (1년치 데이터)`);
  }

  /**
   * 현재 큐 상태 조회
   */
  getStatus(): QueueStatus {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      currentSymbol: this.currentSymbol,
      processed: this.stats.processed,
      failed: this.stats.failed
    };
  }

  /**
   * 큐 초기화 (개발/디버깅용)
   */
  clear(): void {
    this.queue = [];
    console.log('[TickerInitQueue] 큐가 초기화되었습니다.');
  }

  /**
   * 통계 초기화
   */
  resetStats(): void {
    this.stats.processed = 0;
    this.stats.failed = 0;
    console.log('[TickerInitQueue] 통계가 초기화되었습니다.');
  }
}

// 싱글톤 인스턴스
export const tickerInitQueue = new TickerInitQueue();
