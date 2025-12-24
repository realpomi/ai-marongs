"""한국투자증권 시세 크롤러 진입점."""
from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv

from client import KoreaInvestmentClient
from config import Settings
from crawler import StockCrawler
from db import StockRepository

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
    stream=sys.stdout,
)

logger = logging.getLogger(__name__)


def main() -> None:
    """크롤러 서비스를 시작합니다."""

    load_dotenv()
    settings = Settings.from_env()

    if not settings.symbols:
        logger.warning("SYMBOLS 환경 변수가 비어 있어 크롤링을 시작하지 않습니다.")

    repository = StockRepository(settings.db_dsn)
    repository.ensure_schema()

    client = KoreaInvestmentClient(
        base_url=settings.base_url,
        app_key=settings.app_key,
        app_secret=settings.app_secret,
        access_token=settings.access_token,
        account_id=settings.account_id,
        account_product_code=settings.account_product_code,
    )

    crawler = StockCrawler(client=client, repository=repository, symbols=settings.symbols)
    crawler.start(settings.fetch_interval_minutes)


if __name__ == "__main__":
    main()
