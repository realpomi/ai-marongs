"""yfinance 기반 미국 주식 캔들 수집 모듈.

한국투자증권 API와 별개로 yfinance를 사용하여
프리마켓/애프터마켓 포함 데이터를 수집합니다.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import List, Optional

import schedule

from common import (
    ManagedTicker,
    ensure_managed_tickers_table,
    ensure_us_stock_candles_table,
    get_active_tickers,
    update_last_collected,
)
from common.yfinance_api import YFinanceApi, CandleData
from common.db import get_connection

logger = logging.getLogger(__name__)


@dataclass
class CollectionResult:
    """수집 결과."""

    symbol: str
    success: bool
    records_saved: int = 0
    error_message: Optional[str] = None


def save_yfinance_candles(symbol: str, interval: str, candles: List[CandleData]) -> int:
    """yfinance에서 가져온 캔들 데이터를 DB에 저장합니다.

    Args:
        symbol: 종목 코드 (예: AAPL)
        interval: 주기 (예: '60m', 'daily')
        candles: CandleData 리스트

    Returns:
        저장된 레코드 수
    """
    if not candles:
        return 0

    records = []
    for candle in candles:
        records.append((
            symbol,
            interval,
            candle.candle_time,
            candle.open_price,
            candle.high_price,
            candle.low_price,
            candle.close_price,
            candle.volume,
            "yf",  # yfinance 소스 표시
        ))

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

    logger.info("[yfinance] %s: %d건의 %s 데이터를 저장했습니다. (source=yf)", symbol, len(records), interval)
    return len(records)


class YFinanceCollector:
    """yfinance 기반 캔들 수집기.

    한국투자증권 API 대비 장점:
    - 인증 불필요
    - 프리마켓/애프터마켓 데이터 포함

    주의: Yahoo Finance도 rate limit이 있으므로 요청 간격 유지 필요
    """

    def __init__(self, request_delay: float = 2.0):
        """
        Args:
            request_delay: 종목 간 요청 대기 시간 (초)
        """
        self.api = YFinanceApi()
        self.request_delay = request_delay
        self.logger = logging.getLogger(__name__)

    def collect_60m_candles(
        self,
        period: str = "5d",
        include_extended_hours: bool = True,
    ) -> List[CollectionResult]:
        """모든 활성 티커의 60분봉을 수집합니다.

        Args:
            period: 조회 기간 (1d, 5d, 1mo 등)
            include_extended_hours: 프리마켓/애프터마켓 포함 여부

        Returns:
            각 티커별 수집 결과 리스트
        """
        tickers = get_active_tickers()
        self.logger.info(
            "[yfinance] 60분봉 수집 시작 (티커: %d개, extended_hours=%s)",
            len(tickers),
            include_extended_hours,
        )

        results = []
        for ticker in tickers:
            result = self._collect_ticker_60m(ticker, period, include_extended_hours)
            results.append(result)
            if ticker != tickers[-1]:
                time.sleep(self.request_delay)

        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        self.logger.info("[yfinance] 60분봉 수집 완료 (성공: %d, 실패: %d)", success_count, fail_count)

        return results

    def collect_daily_candles(self, period: str = "1mo") -> List[CollectionResult]:
        """모든 활성 티커의 일봉을 수집합니다.

        Args:
            period: 조회 기간 (1mo, 3mo, 1y 등)

        Returns:
            각 티커별 수집 결과 리스트
        """
        tickers = get_active_tickers()
        self.logger.info("[yfinance] 일봉 수집 시작 (티커: %d개)", len(tickers))

        results = []
        for ticker in tickers:
            result = self._collect_ticker_daily(ticker, period)
            results.append(result)
            if ticker != tickers[-1]:
                time.sleep(self.request_delay)

        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        self.logger.info("[yfinance] 일봉 수집 완료 (성공: %d, 실패: %d)", success_count, fail_count)

        return results

    def collect_single_ticker_60m(
        self,
        symbol: str,
        period: str = "5d",
        include_extended_hours: bool = True,
    ) -> CollectionResult:
        """단일 종목의 60분봉을 수집합니다.

        Args:
            symbol: 종목 코드 (예: AAPL)
            period: 조회 기간
            include_extended_hours: 시간외 데이터 포함 여부

        Returns:
            수집 결과
        """
        try:
            candles = self.api.fetch_candles_60m(
                symbol=symbol,
                period=period,
                include_extended_hours=include_extended_hours,
            )

            if not candles:
                return CollectionResult(symbol=symbol, success=True, records_saved=0)

            saved_count = save_yfinance_candles(symbol, "60m", candles)

            self.logger.info("[yfinance] %s: %d건 저장 완료", symbol, saved_count)
            return CollectionResult(symbol=symbol, success=True, records_saved=saved_count)

        except Exception as e:
            self.logger.error("[yfinance] %s: 수집 실패 - %s", symbol, e)
            return CollectionResult(symbol=symbol, success=False, error_message=str(e))

    def collect_single_ticker_daily(
        self,
        symbol: str,
        period: str = "1mo",
    ) -> CollectionResult:
        """단일 종목의 일봉을 수집합니다.

        Args:
            symbol: 종목 코드 (예: AAPL)
            period: 조회 기간

        Returns:
            수집 결과
        """
        try:
            candles = self.api.fetch_candles_daily(symbol=symbol, period=period)

            if not candles:
                return CollectionResult(symbol=symbol, success=True, records_saved=0)

            saved_count = save_yfinance_candles(symbol, "daily", candles)

            self.logger.info("[yfinance] %s: %d건 저장 완료", symbol, saved_count)
            return CollectionResult(symbol=symbol, success=True, records_saved=saved_count)

        except Exception as e:
            self.logger.error("[yfinance] %s: 수집 실패 - %s", symbol, e)
            return CollectionResult(symbol=symbol, success=False, error_message=str(e))

    def _collect_ticker_60m(
        self,
        ticker: ManagedTicker,
        period: str,
        include_extended_hours: bool,
    ) -> CollectionResult:
        """단일 티커의 60분봉을 수집합니다."""
        result = self.collect_single_ticker_60m(
            symbol=ticker.symbol,
            period=period,
            include_extended_hours=include_extended_hours,
        )
        if result.success:
            update_last_collected(ticker.id)
        return result

    def _collect_ticker_daily(self, ticker: ManagedTicker, period: str) -> CollectionResult:
        """단일 티커의 일봉을 수집합니다."""
        result = self.collect_single_ticker_daily(symbol=ticker.symbol, period=period)
        if result.success:
            update_last_collected(ticker.id)
        return result

    def start(
        self,
        interval_60m: int = 60,
        daily_time: str = "07:00",
        include_extended_hours: bool = True,
    ) -> None:
        """스케줄러를 시작합니다.

        Args:
            interval_60m: 60분봉 수집 간격 (분)
            daily_time: 일봉 수집 시간 (HH:MM 형식)
            include_extended_hours: 시간외 데이터 포함 여부
        """
        self.logger.info(
            "[yfinance] 캔들 수집 스케줄러 시작 (60분봉: %d분 간격, 일봉: %s, extended_hours=%s)",
            interval_60m,
            daily_time,
            include_extended_hours,
        )

        # 60분봉 수집 스케줄
        def collect_60m():
            self.collect_60m_candles(include_extended_hours=include_extended_hours)

        schedule.every(interval_60m).minutes.do(collect_60m)

        # 일봉 수집 스케줄
        schedule.every().day.at(daily_time).do(self.collect_daily_candles)

        # 시작 시 즉시 한 번 수집
        self.logger.info("[yfinance] 초기 수집 실행...")
        self.collect_60m_candles(include_extended_hours=include_extended_hours)
        self.collect_daily_candles()

        # 스케줄러 실행
        while True:
            schedule.run_pending()
            time.sleep(1)


def main() -> None:
    """메인 함수."""
    import os
    from dotenv import load_dotenv
    from common import init_pool
    from config import Settings

    load_dotenv()

    # 로깅 설정
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # 설정 로드
    settings = Settings.from_env()

    # DB 초기화
    init_pool(settings.db_dsn)
    ensure_managed_tickers_table()
    ensure_us_stock_candles_table()

    # yfinance 수집기 시작
    collector = YFinanceCollector(request_delay=1.0)
    collector.start(
        interval_60m=settings.candle_60m_interval_minutes,
        daily_time=settings.daily_candle_collect_time,
        include_extended_hours=True,  # 프리마켓/애프터마켓 포함
    )


if __name__ == "__main__":
    main()
