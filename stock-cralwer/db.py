"""PostgreSQL에 가격 정보를 저장합니다."""
from __future__ import annotations

import logging
from typing import Iterable

import psycopg2
from psycopg2.extensions import connection

from models import StockPriceRecord

logger = logging.getLogger(__name__)


class StockRepository:
    """주가 정보를 PostgreSQL에 기록하는 레포지토리."""

    def __init__(self, dsn: str):
        self.dsn = dsn
        self._connection: connection | None = None

    def connect(self) -> connection:
        """연결이 없다면 생성 후 반환합니다."""

        if self._connection is None or self._connection.closed:
            self._connection = psycopg2.connect(self.dsn)
            self._connection.autocommit = True
            logger.info("PostgreSQL 연결을 생성했습니다.")
        return self._connection

    def ensure_schema(self) -> None:
        """필요한 테이블이 없다면 생성합니다."""

        conn = self.connect()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS stock_prices (
                    id SERIAL PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    price NUMERIC(18, 4) NOT NULL,
                    price_time TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_stock_prices UNIQUE(symbol, price_time)
                );
                CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol_time
                    ON stock_prices(symbol, price_time DESC);
                """
            )
        logger.info("stock_prices 테이블을 확인했습니다.")

    def save_prices(self, prices: Iterable[StockPriceRecord]) -> None:
        """여러 건의 주가 정보를 저장합니다."""

        records = list(prices)
        if not records:
            return

        conn = self.connect()
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO stock_prices (symbol, price, price_time)
                VALUES (%s, %s, %s)
                ON CONFLICT ON CONSTRAINT uq_stock_prices DO NOTHING;
                """,
                [(record.symbol, record.price, record.price_time) for record in records],
            )
        logger.info("%s건의 주가 정보를 저장했습니다.", len(records))
