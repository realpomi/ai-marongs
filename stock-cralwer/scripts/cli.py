#!/usr/bin/env python
"""캔들 수집기 CLI 도구."""
from __future__ import annotations

import argparse
import logging
import os
import sys

# 상위 디렉토리를 모듈 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv


def setup():
    """공통 설정을 초기화합니다."""
    load_dotenv()
    from config import Settings
    from common import init_pool, ensure_managed_tickers_table, ensure_us_stock_candles_table

    settings = Settings.from_env()
    init_pool(settings.db_dsn)
    ensure_managed_tickers_table()
    ensure_us_stock_candles_table()
    return settings


def cmd_add_ticker(args):
    """티커를 등록합니다."""
    setup()
    from common import add_ticker, get_ticker

    ticker_id = add_ticker(args.symbol, args.exchange, args.name)
    ticker = get_ticker(args.symbol)
    print(f"티커 등록 완료: {ticker.symbol} ({ticker.exchange}) - ID: {ticker.id}")


def cmd_update_ticker(args):
    """티커 정보를 수정합니다."""
    setup()
    from common import get_ticker, update_ticker

    ticker = get_ticker(args.symbol)
    if not ticker:
        print(f"티커를 찾을 수 없습니다: {args.symbol}")
        sys.exit(1)

    updated = update_ticker(
        args.symbol,
        exchange=args.exchange,
        name=args.name,
    )
    if updated:
        ticker = get_ticker(args.symbol)
        name = ticker.name or "N/A"
        print(f"티커 수정 완료: {ticker.symbol} ({ticker.exchange}) - {name}")
    else:
        print(f"티커 수정 실패: {args.symbol}")


def cmd_deactivate_ticker(args):
    """티커를 비활성화합니다."""
    setup()
    from common import deactivate_ticker, get_ticker

    ticker = get_ticker(args.symbol)
    if not ticker:
        print(f"티커를 찾을 수 없습니다: {args.symbol}")
        sys.exit(1)

    if deactivate_ticker(args.symbol):
        print(f"티커 비활성화 완료: {args.symbol}")
    else:
        print(f"티커 비활성화 실패: {args.symbol}")


def cmd_list_tickers(args):
    """활성 티커 목록을 조회합니다."""
    setup()
    from common import get_active_tickers

    tickers = get_active_tickers()
    print(f"활성 티커 목록 ({len(tickers)}개):")
    print("-" * 70)
    print(f"  {'심볼':10} | {'거래소':5} | {'종목명':20} | 마지막 수집")
    print("-" * 70)
    for t in tickers:
        collected = t.last_collected_at.strftime("%Y-%m-%d %H:%M:%S") if t.last_collected_at else "N/A"
        name = t.name or "N/A"
        print(f"  {t.symbol:10} | {t.exchange:5} | {name:20} | {collected}")


def cmd_collect_60m(args):
    """60분봉을 수집합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    settings = setup()
    from common import KisApi
    from candle_collector import CandleCollector

    kis_api = KisApi.from_env()
    collector = CandleCollector(kis_api, settings.api_request_delay)
    results = collector.collect_60m_candles()

    print("\n=== 수집 결과 ===")
    for r in results:
        status = "성공" if r.success else f"실패: {r.error_message}"
        print(f"  {r.symbol}: {status} ({r.records_saved}건)")


def cmd_collect_daily(args):
    """일봉을 수집합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    settings = setup()
    from common import KisApi
    from candle_collector import CandleCollector

    kis_api = KisApi.from_env()
    collector = CandleCollector(kis_api, settings.api_request_delay)
    results = collector.collect_daily_candles()

    print("\n=== 수집 결과 ===")
    for r in results:
        status = "성공" if r.success else f"실패: {r.error_message}"
        print(f"  {r.symbol}: {status} ({r.records_saved}건)")


def main():
    parser = argparse.ArgumentParser(description="캔들 수집기 CLI")
    subparsers = parser.add_subparsers(dest="command", help="명령어")

    # add-ticker
    p_add = subparsers.add_parser("add-ticker", help="티커 등록")
    p_add.add_argument("symbol", help="종목 코드 (예: AAPL)")
    p_add.add_argument("--exchange", "-e", default="NAS", help="거래소 코드 (기본: NAS)")
    p_add.add_argument("--name", "-n", default=None, help="종목명 (선택)")
    p_add.set_defaults(func=cmd_add_ticker)

    # update-ticker
    p_update = subparsers.add_parser("update-ticker", help="티커 정보 수정")
    p_update.add_argument("symbol", help="종목 코드 (예: AAPL)")
    p_update.add_argument("--exchange", "-e", default=None, help="거래소 코드")
    p_update.add_argument("--name", "-n", default=None, help="종목명")
    p_update.set_defaults(func=cmd_update_ticker)

    # deactivate-ticker
    p_deactivate = subparsers.add_parser("deactivate-ticker", help="티커 비활성화")
    p_deactivate.add_argument("symbol", help="종목 코드 (예: AAPL)")
    p_deactivate.set_defaults(func=cmd_deactivate_ticker)

    # list-tickers
    p_list = subparsers.add_parser("list-tickers", help="활성 티커 조회")
    p_list.set_defaults(func=cmd_list_tickers)

    # collect-60m
    p_60m = subparsers.add_parser("collect-60m", help="60분봉 수집")
    p_60m.set_defaults(func=cmd_collect_60m)

    # collect-daily
    p_daily = subparsers.add_parser("collect-daily", help="일봉 수집")
    p_daily.set_defaults(func=cmd_collect_daily)

    args = parser.parse_args()
    if args.command is None:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
