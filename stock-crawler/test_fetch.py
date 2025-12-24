"""한투 API 연결 테스트 - 국내/해외 주식 시세 조회."""
from __future__ import annotations

import logging
import sys

from config import Settings
from common import KisApi, init_pool, close_pool, ensure_us_stock_candles_table, save_us_stock_candles

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


def is_us_stock(symbol: str) -> bool:
    """미국 주식 티커인지 판단합니다 (알파벳으로만 구성되면 미국 주식)."""
    return symbol.isalpha()


def print_us_candles(symbol: str, candles: list) -> None:
    """미국주식 60분봉 데이터를 출력합니다."""
    logger.info("=== %s 60분봉 데이터 (최근 %d개) ===", symbol, len(candles))
    for i, item in enumerate(candles[:10], 1):
        logger.info(
            "[%2d] %s %s | 종가: %s | 시가: %s | 고가: %s | 저가: %s | 거래량: %s",
            i,
            item.get("xymd", ""),
            item.get("xhms", ""),
            item.get("last", "-"),
            item.get("open", "-"),
            item.get("high", "-"),
            item.get("low", "-"),
            item.get("evol", "-"),
        )


def print_kr_candles(symbol: str, candles: list) -> None:
    """국내주식 1시간봉 데이터를 출력합니다."""
    from datetime import datetime
    from decimal import Decimal

    recent = candles[-10:] if len(candles) >= 10 else candles
    logger.info("=== %s 1시간봉 데이터 (최근 %d개) ===", symbol, len(recent))

    for i, item in enumerate(reversed(recent), 1):
        try:
            price = Decimal(item.get("stck_prpr", "0"))
            date_str = item.get("stck_bsop_date", "")
            time_str = item.get("stck_cntg_hour", "")
            timestamp = datetime.strptime(f"{date_str} {time_str}", "%Y%m%d %H%M%S")

            logger.info(
                "[%2d] %s | 현재가: %s | 시가: %s | 고가: %s | 저가: %s | 거래량: %s",
                i,
                timestamp.strftime("%Y-%m-%d %H:%M"),
                price,
                item.get("stck_oprc", "-"),
                item.get("stck_hgpr", "-"),
                item.get("stck_lwpr", "-"),
                item.get("cntg_vol", "-"),
            )
        except (KeyError, ValueError) as exc:
            logger.error("파싱 실패: %s", exc)


def fetch_prices(symbol: str, save_to_db: bool = False) -> None:
    """종목 코드에 따라 국내/해외 주식 시세를 조회합니다."""
    api = KisApi.from_env()

    if is_us_stock(symbol):
        candles = api.fetch_us_stock_candles_60m(symbol.upper())
        print_us_candles(symbol.upper(), candles)

        if save_to_db and candles:
            settings = Settings.from_env()
            init_pool(settings.db_dsn)
            ensure_us_stock_candles_table()
            saved = save_us_stock_candles(symbol.upper(), "60m", candles)
            logger.info("DB에 %d건 저장 완료", saved)
            close_pool()
    else:
        candles = api.fetch_kr_stock_candles_hourly(symbol)
        print_kr_candles(symbol, candles)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python test_fetch.py <종목코드> [--save]")
        print("")
        print("옵션:")
        print("  --save    DB에 데이터 저장")
        print("")
        print("예시:")
        print("  python test_fetch.py 005930         # 삼성전자 (국내)")
        print("  python test_fetch.py AAPL           # 애플 (미국)")
        print("  python test_fetch.py TSLA --save    # 테슬라 (미국) + DB 저장")
        sys.exit(1)

    ticker = sys.argv[1]
    save_to_db = "--save" in sys.argv
    fetch_prices(ticker, save_to_db=save_to_db)
