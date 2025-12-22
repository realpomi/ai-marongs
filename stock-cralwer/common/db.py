"""PostgreSQL에 가격 정보를 저장합니다."""
from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import Iterable, List, Optional

import psycopg2
from psycopg2 import pool
from psycopg2.extensions import connection

logger = logging.getLogger(__name__)

# 전역 커넥션 풀
_pool: Optional[pool.ThreadedConnectionPool] = None


def init_pool(dsn: str, minconn: int = 1, maxconn: int = 10) -> pool.ThreadedConnectionPool:
    """커넥션 풀을 초기화합니다."""
    global _pool
    if _pool is None:
        _pool = pool.ThreadedConnectionPool(minconn, maxconn, dsn)
        logger.info("커넥션 풀 생성 완료 (min=%d, max=%d)", minconn, maxconn)
    return _pool


def get_pool() -> pool.ThreadedConnectionPool:
    """현재 커넥션 풀을 반환합니다."""
    if _pool is None:
        raise RuntimeError("커넥션 풀이 초기화되지 않았습니다. init_pool()을 먼저 호출하세요.")
    return _pool


def close_pool() -> None:
    """커넥션 풀을 종료합니다."""
    global _pool
    if _pool is not None:
        _pool.closeall()
        _pool = None
        logger.info("커넥션 풀 종료 완료")


@contextmanager
def get_connection():
    """풀에서 커넥션을 가져오는 컨텍스트 매니저."""
    conn = get_pool().getconn()
    try:
        yield conn
    finally:
        get_pool().putconn(conn)


def execute_query(query: str, params: tuple = ()) -> List[tuple]:
    """SELECT 쿼리를 실행하고 결과를 반환합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchall()


def execute_one(query: str, params: tuple = ()) -> Optional[tuple]:
    """SELECT 쿼리를 실행하고 첫 번째 결과를 반환합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            return cursor.fetchone()


def execute_command(query: str, params: tuple = ()) -> int:
    """INSERT/UPDATE/DELETE 쿼리를 실행하고 영향받은 행 수를 반환합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            conn.commit()
            return cursor.rowcount


def ensure_us_stock_candles_table() -> None:
    """미국주식 캔들 테이블이 없으면 생성합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS us_stock_candles (
                    id SERIAL PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    interval TEXT NOT NULL,
                    candle_time TIMESTAMPTZ NOT NULL,
                    open_price NUMERIC(18, 4) NOT NULL,
                    high_price NUMERIC(18, 4) NOT NULL,
                    low_price NUMERIC(18, 4) NOT NULL,
                    close_price NUMERIC(18, 4) NOT NULL,
                    volume BIGINT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'kis',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_us_stock_candles UNIQUE(symbol, interval, candle_time, source)
                );
                CREATE INDEX IF NOT EXISTS idx_us_stock_candles_lookup
                    ON us_stock_candles(symbol, interval, candle_time DESC);
                CREATE INDEX IF NOT EXISTS idx_us_stock_candles_source
                    ON us_stock_candles(source);
                """
            )
            # source 컬럼이 없으면 추가 (기존 테이블 마이그레이션)
            cursor.execute(
                """
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'us_stock_candles' AND column_name = 'source'
                    ) THEN
                        ALTER TABLE us_stock_candles ADD COLUMN source TEXT NOT NULL DEFAULT 'kis';
                        DROP INDEX IF EXISTS uq_us_stock_candles;
                        ALTER TABLE us_stock_candles DROP CONSTRAINT IF EXISTS uq_us_stock_candles;
                        ALTER TABLE us_stock_candles ADD CONSTRAINT uq_us_stock_candles UNIQUE(symbol, interval, candle_time, source);
                        CREATE INDEX IF NOT EXISTS idx_us_stock_candles_source ON us_stock_candles(source);
                    END IF;
                END $$;
                """
            )
            conn.commit()
    logger.info("us_stock_candles 테이블을 확인했습니다.")


def save_us_stock_candles(symbol: str, interval: str, candles: List[dict], source: str = "kis") -> int:
    """미국주식 캔들 데이터를 저장합니다.

    Args:
        symbol: 종목 코드 (예: AAPL)
        interval: 주기 (예: '60m', '1d')
        candles: API 응답 데이터 리스트
        source: 데이터 소스 ('kis': 한국투자증권, 'yf': yfinance)
    """
    if not candles:
        return 0

    from datetime import datetime

    records = []
    for item in candles:
        try:
            date_str = item.get("xymd", "")
            time_str = item.get("xhms", "000000")
            if not date_str:
                continue

            candle_time = datetime.strptime(f"{date_str} {time_str}", "%Y%m%d %H%M%S")
            records.append((
                symbol,
                interval,
                candle_time,
                float(item.get("open", 0)),
                float(item.get("high", 0)),
                float(item.get("low", 0)),
                float(item.get("clos", item.get("last", 0))),
                int(item.get("tvol", item.get("evol", 0))),
                source,
            ))
        except (ValueError, KeyError) as e:
            logger.warning("캔들 데이터 파싱 실패: %s", e)
            continue

    if not records:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO us_stock_candles (symbol, interval, candle_time, open_price, high_price, low_price, close_price, volume, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ON CONSTRAINT uq_us_stock_candles DO UPDATE SET
                    open_price = EXCLUDED.open_price,
                    high_price = EXCLUDED.high_price,
                    low_price = EXCLUDED.low_price,
                    close_price = EXCLUDED.close_price,
                    volume = EXCLUDED.volume;
                """,
                records,
            )
            conn.commit()

    logger.info("%s: %d건의 %s 데이터를 저장했습니다. (source=%s)", symbol, len(records), interval, source)
    return len(records)
