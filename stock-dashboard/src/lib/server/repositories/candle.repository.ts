import sql from '$lib/server/db';
import type { CandleRecord, UsStockCandleRaw } from '$lib/server/kis/types';

/**
 * 미국 주식 캔들 데이터를 DB에 저장합니다 (Upsert)
 */
export async function saveUsStockCandles(
  symbol: string,
  interval: '60m' | 'daily',
  candles: UsStockCandleRaw[],
  source: string = 'kis'
): Promise<number> {
  if (candles.length === 0) return 0;

  const records: CandleRecord[] = [];

  for (const item of candles) {
    try {
      const dateStr = item.xymd || '';
      const timeStr = item.xhms || '000000';
      if (!dateStr) continue;

      // YYYYMMDD HHMMSS -> Date
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const hour = timeStr.slice(0, 2) || '00';
      const min = timeStr.slice(2, 4) || '00';
      const sec = timeStr.slice(4, 6) || '00';

      const candle_time = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);

      records.push({
        symbol,
        interval,
        candle_time,
        open_price: parseFloat(item.open) || 0,
        high_price: parseFloat(item.high) || 0,
        low_price: parseFloat(item.low) || 0,
        close_price: parseFloat(item.clos) || 0,
        volume: parseInt(item.tvol) || 0,
        source
      });
    } catch (e) {
      console.warn(`[DB] 캔들 파싱 실패:`, e);
    }
  }

  if (records.length === 0) return 0;

  // Upsert 쿼리
  for (const r of records) {
    await sql`
      INSERT INTO us_stock_candles (symbol, interval, candle_time, open_price, high_price, low_price, close_price, volume, source)
      VALUES (${r.symbol}, ${r.interval}, ${r.candle_time}, ${r.open_price}, ${r.high_price}, ${r.low_price}, ${r.close_price}, ${r.volume}, ${r.source})
      ON CONFLICT ON CONSTRAINT uq_us_stock_candles DO UPDATE SET
        open_price = EXCLUDED.open_price,
        high_price = EXCLUDED.high_price,
        low_price = EXCLUDED.low_price,
        close_price = EXCLUDED.close_price,
        volume = EXCLUDED.volume
    `;
  }

  console.log(`[DB] ${symbol}: ${records.length}건 ${interval} 데이터 저장 (source=${source})`);
  return records.length;
}

/**
 * 최신 캔들 데이터를 조회합니다
 */
export async function getLatestCandles(
  symbol: string,
  interval: '60m' | 'daily',
  source: string = 'kis',
  limit: number = 30
) {
  return sql`
    SELECT * FROM us_stock_candles
    WHERE symbol = ${symbol}
      AND interval = ${interval}
      AND source = ${source}
    ORDER BY candle_time DESC
    LIMIT ${limit}
  `;
}

/**
 * 티커의 마지막 수집 시간을 업데이트합니다
 */
export async function updateTickerLastCollected(symbol: string): Promise<void> {
  await sql`
    UPDATE managed_tickers
    SET last_collected_at = NOW(), updated_at = NOW()
    WHERE symbol = ${symbol}
  `;
}
