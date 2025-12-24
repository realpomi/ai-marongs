"""주기적으로 시세를 조회하는 크롤러."""
from __future__ import annotations

import logging
import time
from typing import Iterable, List

import schedule

from client import KoreaInvestmentClient
from db import StockRepository
from models import StockPriceRecord

logger = logging.getLogger(__name__)


class StockCrawler:
    """지정된 종목을 주기적으로 조회하여 저장합니다."""

    def __init__(self, client: KoreaInvestmentClient, repository: StockRepository, symbols: Iterable[str]):
        self.client = client
        self.repository = repository
        self.symbols: List[str] = list(symbols)

    def fetch_once(self) -> None:
        """모든 종목을 조회 후 저장합니다."""

        if not self.symbols:
            logger.warning("조회할 종목이 비어 있습니다. SYMBOLS 환경 변수를 확인하세요.")
            return

        prices: List[StockPriceRecord] = []
        for symbol in self.symbols:
            price = self.client.fetch_hourly_price(symbol)
            if price:
                prices.append(price)

        if prices:
            self.repository.save_prices(prices)
        else:
            logger.info("저장할 시세 데이터가 없습니다.")

    def start(self, interval_minutes: int) -> None:
        """스케줄러를 설정하고 실행 루프를 시작합니다."""

        logger.info("%s분 간격으로 %s개 종목을 조회합니다.", interval_minutes, len(self.symbols))
        schedule.every(interval_minutes).minutes.do(self.fetch_once)
        self.fetch_once()

        while True:
            schedule.run_pending()
            idle = schedule.idle_seconds()
            sleep_for = 60 if idle is None else max(1, idle)
            time.sleep(sleep_for)
