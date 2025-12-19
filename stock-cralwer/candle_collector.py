"""미국 주식 캔들 자동 수집 모듈."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import List, Optional

import schedule

from common import (
    KisApi,
    ManagedTicker,
    ensure_managed_tickers_table,
    ensure_us_stock_candles_table,
    get_active_tickers,
    save_us_stock_candles,
    update_last_collected,
)

logger = logging.getLogger(__name__)


@dataclass
class CollectionResult:
    """수집 결과."""

    symbol: str
    success: bool
    records_saved: int = 0
    error_message: Optional[str] = None


class CandleCollector:
    """미국 주식 캔들 수집기."""

    def __init__(self, kis_api: KisApi, api_request_delay: float = 0.5):
        """
        Args:
            kis_api: KIS API 클라이언트
            api_request_delay: API 호출 간 대기 시간 (초)
        """
        self.kis_api = kis_api
        self.api_request_delay = api_request_delay
        self.logger = logging.getLogger(__name__)

    def collect_60m_candles(self) -> List[CollectionResult]:
        """모든 활성 티커의 60분봉을 수집합니다.

        Returns:
            각 티커별 수집 결과 리스트
        """
        tickers = get_active_tickers()
        self.logger.info("60분봉 수집 시작 (활성 티커: %d개)", len(tickers))

        results = []
        for ticker in tickers:
            result = self._collect_ticker_60m(ticker)
            results.append(result)
            if ticker != tickers[-1]:
                time.sleep(self.api_request_delay)

        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        self.logger.info("60분봉 수집 완료 (성공: %d, 실패: %d)", success_count, fail_count)

        return results

    def collect_daily_candles(self) -> List[CollectionResult]:
        """모든 활성 티커의 일봉을 수집합니다.

        Returns:
            각 티커별 수집 결과 리스트
        """
        tickers = get_active_tickers()
        self.logger.info("일봉 수집 시작 (활성 티커: %d개)", len(tickers))

        results = []
        for ticker in tickers:
            result = self._collect_ticker_daily(ticker)
            results.append(result)
            if ticker != tickers[-1]:
                time.sleep(self.api_request_delay)

        success_count = sum(1 for r in results if r.success)
        fail_count = len(results) - success_count
        self.logger.info("일봉 수집 완료 (성공: %d, 실패: %d)", success_count, fail_count)

        return results

    def _collect_ticker_60m(self, ticker: ManagedTicker) -> CollectionResult:
        """단일 티커의 60분봉을 수집합니다."""
        try:
            candles = self.kis_api.fetch_us_stock_candles_60m(
                symbol=ticker.symbol,
                exchange=ticker.exchange,
            )

            if not candles:
                return CollectionResult(
                    symbol=ticker.symbol,
                    success=True,
                    records_saved=0,
                )

            saved_count = save_us_stock_candles(
                symbol=ticker.symbol,
                interval="60m",
                candles=candles,
            )
            update_last_collected(ticker.id)

            self.logger.info("%s: %d건 저장 완료", ticker.symbol, saved_count)
            return CollectionResult(
                symbol=ticker.symbol,
                success=True,
                records_saved=saved_count,
            )

        except Exception as e:
            self.logger.error("%s: 수집 실패 - %s", ticker.symbol, e)
            return CollectionResult(
                symbol=ticker.symbol,
                success=False,
                error_message=str(e),
            )

    def _collect_ticker_daily(self, ticker: ManagedTicker) -> CollectionResult:
        """단일 티커의 일봉을 수집합니다."""
        try:
            candles = self.kis_api.fetch_us_stock_candles_daily(
                symbol=ticker.symbol,
                exchange=ticker.exchange,
            )

            if not candles:
                return CollectionResult(
                    symbol=ticker.symbol,
                    success=True,
                    records_saved=0,
                )

            saved_count = save_us_stock_candles(
                symbol=ticker.symbol,
                interval="daily",
                candles=candles,
            )
            update_last_collected(ticker.id)

            self.logger.info("%s: %d건 저장 완료", ticker.symbol, saved_count)
            return CollectionResult(
                symbol=ticker.symbol,
                success=True,
                records_saved=saved_count,
            )

        except Exception as e:
            self.logger.error("%s: 수집 실패 - %s", ticker.symbol, e)
            return CollectionResult(
                symbol=ticker.symbol,
                success=False,
                error_message=str(e),
            )

    def start(self, interval_60m: int = 60, daily_time: str = "07:00") -> None:
        """스케줄러를 시작합니다.

        Args:
            interval_60m: 60분봉 수집 간격 (분)
            daily_time: 일봉 수집 시간 (HH:MM 형식)
        """
        self.logger.info(
            "캔들 수집 스케줄러 시작 (60분봉: %d분 간격, 일봉: %s)",
            interval_60m,
            daily_time,
        )

        # 60분봉 수집 스케줄
        schedule.every(interval_60m).minutes.do(self.collect_60m_candles)

        # 일봉 수집 스케줄
        schedule.every().day.at(daily_time).do(self.collect_daily_candles)

        # 시작 시 즉시 한 번 수집
        self.logger.info("초기 수집 실행...")
        self.collect_60m_candles()
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

    # KIS API 클라이언트 생성
    kis_api = KisApi.from_env()

    # 수집기 시작
    collector = CandleCollector(
        kis_api=kis_api,
        api_request_delay=settings.api_request_delay,
    )
    collector.start(
        interval_60m=settings.candle_60m_interval_minutes,
        daily_time=settings.daily_candle_collect_time,
    )


if __name__ == "__main__":
    main()
