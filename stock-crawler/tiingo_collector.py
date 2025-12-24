"""Tiingo 기반 미국 주식 캔들 수집 모듈.

Tiingo IEX API를 사용하여 프리마켓/애프터마켓 포함
60분봉 및 일봉 데이터를 수집합니다.

무료 티어 제한:
- 시간당 50 requests
- 일일 500 unique symbols
- IEX 데이터: 과거 최대 5영업일 분봉 조회 가능
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
from common.tiingo_api import TiingoApi, TiingoCandleData
from common.db import get_connection

logger = logging.getLogger(__name__)


@dataclass
class CollectionResult:
    """수집 결과."""

    symbol: str
    success: bool
    records_saved: int = 0
    error_message: Optional[str] = None


def save_tiingo_candles(symbol: str, interval: str, candles: List[TiingoCandleData]) -> int:
    """Tiingo에서 가져온 캔들 데이터를 DB에 저장합니다.

    Args:
        symbol: 종목 코드 (예: AAPL)
        interval: 주기 (예: '60m', 'daily')
        candles: TiingoCandleData 리스트

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
            "tiingo",  # Tiingo 소스 표시
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

    logger.info("[tiingo] %s: %d건의 %s 데이터를 저장했습니다. (source=tiingo)", symbol, len(records), interval)
    return len(records)


class TiingoCollector:
    """Tiingo 기반 캔들 수집기.

    무료 티어 제한을 고려하여:
    - 요청 간 적절한 대기 시간 유지
    - 시간당 50 requests 제한 준수
    - 일일 500 unique symbols 제한 준수
    """

    # 무료 티어: 시간당 50 requests
    FREE_TIER_REQUESTS_PER_HOUR = 50
    FREE_TIER_SECONDS_PER_HOUR = 3600

    def __init__(self, request_delay: float = None):
        """
        Args:
            request_delay: 종목 간 요청 대기 시간 (초)
                          None이면 티커 개수에 따라 동적 계산
                          무료 티어 제한: 시간당 50 requests
        """
        self.api = TiingoApi.from_env()
        self._fixed_delay = request_delay  # None이면 동적 계산
        self.logger = logging.getLogger(__name__)

    def _calculate_delay(self, ticker_count: int) -> float:
        """티커 개수에 따라 최적의 대기 시간을 계산합니다.

        시간당 50 requests 제한을 준수하면서 가능한 빨리 완료되도록 계산합니다.

        Args:
            ticker_count: 수집할 티커 개수

        Returns:
            요청 간 대기 시간 (초)
        """
        if self._fixed_delay is not None:
            return self._fixed_delay

        # 시간당 50개 제한
        # 티커가 50개 이하면 1시간 내에 모두 처리 가능 -> 대기 불필요
        # 티커가 50개 초과시에만 대기 필요

        if ticker_count <= self.FREE_TIER_REQUESTS_PER_HOUR:
            return 0

        # 50개 초과 시 최소 간격 적용 (3600 / 50 = 72초)
        delay = self.FREE_TIER_SECONDS_PER_HOUR / self.FREE_TIER_REQUESTS_PER_HOUR
        # 안전 마진 5% 추가
        return delay * 1.05

    def collect_60m_candles(
        self,
        days: int = 5,
        include_after_hours: bool = True,
    ) -> List[CollectionResult]:
        """모든 활성 티커의 60분봉을 수집합니다.

        Args:
            days: 조회할 기간 (일, 최대 5일)
            include_after_hours: 프리마켓/애프터마켓 포함 여부

        Returns:
            각 티커별 수집 결과 리스트
        """
        tickers = get_active_tickers()
        delay = self._calculate_delay(len(tickers))
        estimated_time = delay * (len(tickers) - 1) if len(tickers) > 1 else 0

        self.logger.info(
            "[tiingo] 60분봉 수집 시작 (티커: %d개, days=%d, after_hours=%s, 대기시간=%.1f초, 예상소요=%.1f분)",
            len(tickers),
            days,
            include_after_hours,
            delay,
            estimated_time / 60,
        )

        results = []
        for i, ticker in enumerate(tickers):
            result = self._collect_ticker_60m(ticker, days, include_after_hours)
            results.append(result)
            if ticker != tickers[-1]:
                remaining = len(tickers) - i - 1
                self.logger.info(
                    "[tiingo] 다음 요청까지 %.1f초 대기 (남은 티커: %d개)",
                    delay,
                    remaining,
                )
                time.sleep(delay)

        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        self.logger.info("[tiingo] 60분봉 수집 완료 (성공: %d, 실패: %d)", success_count, fail_count)

        return results

    def collect_daily_candles(self, days: int = 30) -> List[CollectionResult]:
        """모든 활성 티커의 일봉을 수집합니다.

        Args:
            days: 조회할 기간 (일)

        Returns:
            각 티커별 수집 결과 리스트
        """
        from datetime import datetime, timedelta

        tickers = get_active_tickers()
        delay = self._calculate_delay(len(tickers))
        estimated_time = delay * (len(tickers) - 1) if len(tickers) > 1 else 0

        self.logger.info(
            "[tiingo] 일봉 수집 시작 (티커: %d개, days=%d, 대기시간=%.1f초, 예상소요=%.1f분)",
            len(tickers),
            days,
            delay,
            estimated_time / 60,
        )

        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        results = []
        for i, ticker in enumerate(tickers):
            result = self._collect_ticker_daily(ticker, start_date, end_date)
            results.append(result)
            if ticker != tickers[-1]:
                remaining = len(tickers) - i - 1
                self.logger.info(
                    "[tiingo] 다음 요청까지 %.1f초 대기 (남은 티커: %d개)",
                    delay,
                    remaining,
                )
                time.sleep(delay)

        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        self.logger.info("[tiingo] 일봉 수집 완료 (성공: %d, 실패: %d)", success_count, fail_count)

        return results

    def collect_single_ticker_60m(
        self,
        symbol: str,
        days: int = 5,
        include_after_hours: bool = True,
    ) -> CollectionResult:
        """단일 종목의 60분봉을 수집합니다.

        Args:
            symbol: 종목 코드 (예: AAPL)
            days: 조회할 기간 (일, 최대 5일)
            include_after_hours: 시간외 데이터 포함 여부

        Returns:
            수집 결과
        """
        try:
            candles = self.api.fetch_candles_60m(
                symbol=symbol,
                days=days,
                include_after_hours=include_after_hours,
            )

            if not candles:
                return CollectionResult(symbol=symbol, success=True, records_saved=0)

            saved_count = save_tiingo_candles(symbol, "60m", candles)

            self.logger.info("[tiingo] %s: %d건 저장 완료", symbol, saved_count)
            return CollectionResult(symbol=symbol, success=True, records_saved=saved_count)

        except Exception as e:
            self.logger.error("[tiingo] %s: 수집 실패 - %s", symbol, e)
            return CollectionResult(symbol=symbol, success=False, error_message=str(e))

    def collect_single_ticker_daily(
        self,
        symbol: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> CollectionResult:
        """단일 종목의 일봉을 수집합니다.

        Args:
            symbol: 종목 코드 (예: AAPL)
            start_date: 시작일 (YYYY-MM-DD)
            end_date: 종료일 (YYYY-MM-DD)

        Returns:
            수집 결과
        """
        try:
            candles = self.api.fetch_candles_daily(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
            )

            if not candles:
                return CollectionResult(symbol=symbol, success=True, records_saved=0)

            saved_count = save_tiingo_candles(symbol, "daily", candles)

            self.logger.info("[tiingo] %s: %d건 저장 완료", symbol, saved_count)
            return CollectionResult(symbol=symbol, success=True, records_saved=saved_count)

        except Exception as e:
            self.logger.error("[tiingo] %s: 수집 실패 - %s", symbol, e)
            return CollectionResult(symbol=symbol, success=False, error_message=str(e))

    def _collect_ticker_60m(
        self,
        ticker: ManagedTicker,
        days: int,
        include_after_hours: bool,
    ) -> CollectionResult:
        """단일 티커의 60분봉을 수집합니다."""
        result = self.collect_single_ticker_60m(
            symbol=ticker.symbol,
            days=days,
            include_after_hours=include_after_hours,
        )
        if result.success:
            update_last_collected(ticker.id)
        return result

    def _collect_ticker_daily(
        self,
        ticker: ManagedTicker,
        start_date: str,
        end_date: str,
    ) -> CollectionResult:
        """단일 티커의 일봉을 수집합니다."""
        result = self.collect_single_ticker_daily(
            symbol=ticker.symbol,
            start_date=start_date,
            end_date=end_date,
        )
        if result.success:
            update_last_collected(ticker.id)
        return result

    def start(
        self,
        daily_collect_time: str = "07:00",
        days_60m: int = 5,
        days_daily: int = 30,
        include_after_hours: bool = True,
    ) -> None:
        """스케줄러를 시작합니다.

        하루에 한 번 지정된 시간에 60분봉과 일봉을 수집합니다.

        Args:
            daily_collect_time: 수집 시간 (HH:MM 형식, 기본 07:00)
            days_60m: 60분봉 조회 기간 (최대 5일)
            days_daily: 일봉 조회 기간
            include_after_hours: 시간외 데이터 포함 여부
        """
        self.logger.info(
            "[tiingo] 캔들 수집 스케줄러 시작 (수집시간: %s, 60m_days=%d, daily_days=%d, after_hours=%s)",
            daily_collect_time,
            days_60m,
            days_daily,
            include_after_hours,
        )

        def daily_job():
            self.logger.info("[tiingo] 일일 수집 작업 시작...")
            self.collect_60m_candles(days=days_60m, include_after_hours=include_after_hours)
            self.collect_daily_candles(days=days_daily)
            self.logger.info("[tiingo] 일일 수집 작업 완료")

        # 매일 지정된 시간에 수집
        schedule.every().day.at(daily_collect_time).do(daily_job)

        # 시작 시 즉시 한 번 수집
        self.logger.info("[tiingo] 초기 수집 실행...")
        daily_job()

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

    # Tiingo 수집기 시작
    collector = TiingoCollector(request_delay=3.0)  # 무료 티어 제한 고려
    collector.start(
        daily_collect_time=settings.daily_candle_collect_time,
        days_60m=5,  # IEX 무료 티어 최대 5일
        days_daily=30,
        include_after_hours=True,  # 프리마켓/애프터마켓 포함
    )


if __name__ == "__main__":
    main()
