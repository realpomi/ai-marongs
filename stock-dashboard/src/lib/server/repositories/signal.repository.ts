import sql from '$lib/server/db';
import type { SignalAnalysis } from '$lib/server/analysis';

export interface TickerSignalRecord {
  id?: number;
  symbol: string;
  signal_date: Date;
  signal_level: number;
  signal_keyword: string;
  signal_message: string;
  trend: string;
  trend_status: string;
  rsi: number;
  rsi_status: string;
  pullback_rate: number;
  pullback_status: string;
  volume_ratio: number;
  volume_status: string;
  consolidation_rate: number;
  consolidation_status: string;
  score: number;
  current_price: number;
  ma20: number | null;
  ma60: number | null;
  high_2w: number;
  high_52w: number;
  created_at?: Date;
}

/**
 * ticker_signals 테이블 생성 (최초 1회 실행용)
 */
export async function createTickerSignalsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS ticker_signals (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      signal_date DATE NOT NULL,
      signal_level INTEGER NOT NULL,
      signal_keyword VARCHAR(50) NOT NULL,
      signal_message TEXT,
      trend VARCHAR(10) NOT NULL,
      trend_status VARCHAR(10) NOT NULL,
      rsi NUMERIC(6,2) NOT NULL,
      rsi_status VARCHAR(20) NOT NULL,
      pullback_rate NUMERIC(6,2) NOT NULL,
      pullback_status VARCHAR(10) NOT NULL,
      volume_ratio NUMERIC(8,4) NOT NULL,
      volume_status VARCHAR(10) NOT NULL,
      consolidation_rate NUMERIC(6,2) NOT NULL,
      consolidation_status VARCHAR(10) NOT NULL,
      score INTEGER NOT NULL,
      current_price NUMERIC(18,4) NOT NULL,
      ma20 NUMERIC(18,4),
      ma60 NUMERIC(18,4),
      high_2w NUMERIC(18,4) NOT NULL,
      high_52w NUMERIC(18,4) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_ticker_signals UNIQUE(symbol, signal_date)
    )
  `;

  // 인덱스 생성
  await sql`
    CREATE INDEX IF NOT EXISTS idx_ticker_signals_symbol
    ON ticker_signals(symbol)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_ticker_signals_date
    ON ticker_signals(signal_date DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_ticker_signals_level
    ON ticker_signals(signal_level)
  `;

  console.log('[DB] ticker_signals 테이블 생성/확인 완료');
}

/**
 * 시그널 분석 결과를 저장합니다 (Upsert)
 */
export async function saveTickerSignal(
  symbol: string,
  signalDate: Date,
  analysis: SignalAnalysis
): Promise<void> {
  await sql`
    INSERT INTO ticker_signals (
      symbol, signal_date, signal_level, signal_keyword, signal_message,
      trend, trend_status, rsi, rsi_status,
      pullback_rate, pullback_status, volume_ratio, volume_status,
      consolidation_rate, consolidation_status, score,
      current_price, ma20, ma60, high_2w, high_52w
    ) VALUES (
      ${symbol}, ${signalDate}, ${analysis.signalLevel}, ${analysis.signalKeyword}, ${analysis.signalMessage},
      ${analysis.trend}, ${analysis.trendStatus}, ${analysis.rsi}, ${analysis.rsiStatus},
      ${analysis.pullbackRate}, ${analysis.pullbackStatus}, ${analysis.volumeRatio}, ${analysis.volumeStatus},
      ${analysis.consolidationRate}, ${analysis.consolidationStatus}, ${analysis.score},
      ${analysis.currentPrice}, ${analysis.ma20}, ${analysis.ma60}, ${analysis.high2w}, ${analysis.high52w}
    )
    ON CONFLICT ON CONSTRAINT uq_ticker_signals DO UPDATE SET
      signal_level = EXCLUDED.signal_level,
      signal_keyword = EXCLUDED.signal_keyword,
      signal_message = EXCLUDED.signal_message,
      trend = EXCLUDED.trend,
      trend_status = EXCLUDED.trend_status,
      rsi = EXCLUDED.rsi,
      rsi_status = EXCLUDED.rsi_status,
      pullback_rate = EXCLUDED.pullback_rate,
      pullback_status = EXCLUDED.pullback_status,
      volume_ratio = EXCLUDED.volume_ratio,
      volume_status = EXCLUDED.volume_status,
      consolidation_rate = EXCLUDED.consolidation_rate,
      consolidation_status = EXCLUDED.consolidation_status,
      score = EXCLUDED.score,
      current_price = EXCLUDED.current_price,
      ma20 = EXCLUDED.ma20,
      ma60 = EXCLUDED.ma60,
      high_2w = EXCLUDED.high_2w,
      high_52w = EXCLUDED.high_52w
  `;
}

/**
 * 특정 종목의 최신 시그널을 조회합니다
 */
export async function getLatestSignal(symbol: string): Promise<TickerSignalRecord | null> {
  const results = await sql<TickerSignalRecord[]>`
    SELECT * FROM ticker_signals
    WHERE symbol = ${symbol}
    ORDER BY signal_date DESC
    LIMIT 1
  `;
  return results[0] || null;
}

/**
 * 특정 시그널 레벨 이상인 종목들을 조회합니다
 */
export async function getSignalsByLevel(
  minLevel: number,
  signalDate?: Date
): Promise<TickerSignalRecord[]> {
  if (signalDate) {
    return sql<TickerSignalRecord[]>`
      SELECT * FROM ticker_signals
      WHERE signal_level >= ${minLevel}
        AND signal_date = ${signalDate}
      ORDER BY signal_level DESC, symbol
    `;
  }

  // signalDate가 없으면 각 종목의 최신 시그널 중에서 조회
  return sql<TickerSignalRecord[]>`
    SELECT DISTINCT ON (symbol) *
    FROM ticker_signals
    WHERE signal_level >= ${minLevel}
    ORDER BY symbol, signal_date DESC
  `;
}

/**
 * 특정 날짜의 모든 시그널을 조회합니다
 */
export async function getSignalsByDate(signalDate: Date): Promise<TickerSignalRecord[]> {
  return sql<TickerSignalRecord[]>`
    SELECT * FROM ticker_signals
    WHERE signal_date = ${signalDate}
    ORDER BY signal_level DESC, symbol
  `;
}

/**
 * 종목의 시그널 히스토리를 조회합니다
 */
export async function getSignalHistory(
  symbol: string,
  limit: number = 30
): Promise<TickerSignalRecord[]> {
  return sql<TickerSignalRecord[]>`
    SELECT * FROM ticker_signals
    WHERE symbol = ${symbol}
    ORDER BY signal_date DESC
    LIMIT ${limit}
  `;
}

/**
 * 최신 날짜의 매수 추천 종목(Level 4 이상)을 조회합니다.
 */
export async function getRecommendedSignals(): Promise<TickerSignalRecord[]> {
  return sql<TickerSignalRecord[]>`
    SELECT * FROM ticker_signals
    WHERE signal_date = (SELECT MAX(signal_date) FROM ticker_signals)
      AND signal_level >= 4
    ORDER BY score DESC, signal_level DESC, symbol ASC
  `;
}

/**
 * 최신 날짜의 관심 종목(Level 3 + Score 3이상)을 조회합니다.
 */
export async function getWatchlistSignals(): Promise<TickerSignalRecord[]> {
  return sql<TickerSignalRecord[]>`
    SELECT * FROM ticker_signals
    WHERE signal_date = (SELECT MAX(signal_date) FROM ticker_signals)
      AND signal_level = 3
      AND score >= 3
    ORDER BY score DESC, symbol ASC
  `;
}
