"""관리 대상 티커 CRUD 모듈."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from .db import get_connection

logger = logging.getLogger(__name__)


@dataclass
class ManagedTicker:
    """관리 대상 티커 정보."""

    id: int
    symbol: str
    name: Optional[str]
    exchange: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_collected_at: Optional[datetime]


def ensure_managed_tickers_table() -> None:
    """managed_tickers 테이블이 없으면 생성합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS managed_tickers (
                    id SERIAL PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    name VARCHAR(100),
                    exchange VARCHAR(10) NOT NULL DEFAULT 'NAS',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_collected_at TIMESTAMPTZ,
                    CONSTRAINT uq_managed_tickers_symbol UNIQUE(symbol)
                );

                CREATE INDEX IF NOT EXISTS idx_managed_tickers_active
                    ON managed_tickers(is_active) WHERE is_active = TRUE;
                """
            )
            conn.commit()
    logger.info("managed_tickers 테이블을 확인했습니다.")


def get_active_tickers() -> List[ManagedTicker]:
    """활성화된 모든 티커 목록을 조회합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, symbol, name, exchange, is_active,
                       created_at, updated_at, last_collected_at
                FROM managed_tickers
                WHERE is_active = TRUE
                ORDER BY symbol
                """
            )
            rows = cursor.fetchall()

    return [
        ManagedTicker(
            id=row[0],
            symbol=row[1],
            name=row[2],
            exchange=row[3],
            is_active=row[4],
            created_at=row[5],
            updated_at=row[6],
            last_collected_at=row[7],
        )
        for row in rows
    ]


def add_ticker(symbol: str, exchange: str = "NAS", name: Optional[str] = None) -> int:
    """새 티커를 추가하고 생성된 ID를 반환합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO managed_tickers (symbol, name, exchange)
                VALUES (%s, %s, %s)
                ON CONFLICT (symbol) DO UPDATE SET
                    name = COALESCE(EXCLUDED.name, managed_tickers.name),
                    exchange = EXCLUDED.exchange,
                    is_active = TRUE,
                    updated_at = NOW()
                RETURNING id
                """,
                (symbol.upper(), name, exchange.upper()),
            )
            result = cursor.fetchone()
            conn.commit()
    logger.info("티커 추가/업데이트: %s (%s)", symbol, exchange)
    return result[0]


def deactivate_ticker(symbol: str) -> bool:
    """티커를 비활성화합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE managed_tickers
                SET is_active = FALSE, updated_at = NOW()
                WHERE symbol = %s
                """,
                (symbol.upper(),),
            )
            conn.commit()
            updated = cursor.rowcount > 0
    if updated:
        logger.info("티커 비활성화: %s", symbol)
    return updated


def activate_ticker(symbol: str) -> bool:
    """티커를 활성화합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE managed_tickers
                SET is_active = TRUE, updated_at = NOW()
                WHERE symbol = %s
                """,
                (symbol.upper(),),
            )
            conn.commit()
            updated = cursor.rowcount > 0
    if updated:
        logger.info("티커 활성화: %s", symbol)
    return updated


def update_last_collected(ticker_id: int) -> None:
    """마지막 수집 시간을 업데이트합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE managed_tickers
                SET last_collected_at = NOW(), updated_at = NOW()
                WHERE id = %s
                """,
                (ticker_id,),
            )
            conn.commit()


def get_ticker(symbol: str) -> Optional[ManagedTicker]:
    """심볼로 티커를 조회합니다."""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT id, symbol, name, exchange, is_active,
                       created_at, updated_at, last_collected_at
                FROM managed_tickers
                WHERE symbol = %s
                """,
                (symbol.upper(),),
            )
            row = cursor.fetchone()

    if row is None:
        return None

    return ManagedTicker(
        id=row[0],
        symbol=row[1],
        name=row[2],
        exchange=row[3],
        is_active=row[4],
        created_at=row[5],
        updated_at=row[6],
        last_collected_at=row[7],
    )


def update_ticker(
    symbol: str,
    exchange: Optional[str] = None,
    name: Optional[str] = None,
) -> bool:
    """티커 정보를 수정합니다."""
    updates = []
    params = []

    if exchange is not None:
        updates.append("exchange = %s")
        params.append(exchange.upper())

    if name is not None:
        updates.append("name = %s")
        params.append(name)

    if not updates:
        return False

    updates.append("updated_at = NOW()")
    params.append(symbol.upper())

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                UPDATE managed_tickers
                SET {', '.join(updates)}
                WHERE symbol = %s
                """,
                tuple(params),
            )
            conn.commit()
            updated = cursor.rowcount > 0

    if updated:
        logger.info("티커 수정: %s", symbol)
    return updated
