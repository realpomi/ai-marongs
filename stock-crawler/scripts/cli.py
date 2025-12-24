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
    """티커를 등록하고 1년치 일봉을 수집합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from common import add_ticker, get_ticker, KisApi, save_us_stock_candles, update_last_collected

    # 1. 티커 등록
    ticker_id = add_ticker(args.symbol, args.exchange, args.name)
    ticker = get_ticker(args.symbol)
    print(f"티커 등록 완료: {ticker.symbol} ({ticker.exchange}) - ID: {ticker.id}")

    # 2. 1년치 일봉 수집
    print(f"\n{ticker.symbol} 1년치 일봉 수집 시작...")
    kis_api = KisApi.from_env()
    candles = kis_api.fetch_us_stock_candles_daily_year(
        symbol=ticker.symbol,
        exchange=ticker.exchange,
        max_days=365,
    )

    if candles:
        saved_count = save_us_stock_candles(
            symbol=ticker.symbol,
            interval="daily",
            candles=candles,
        )
        update_last_collected(ticker.id)
        print(f"일봉 수집 완료: {saved_count}건 저장")
    else:
        print("일봉 데이터가 없습니다.")


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


def cmd_update_daily(args):
    """티커의 1년치 일봉을 업데이트합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from common import get_ticker, KisApi, save_us_stock_candles, update_last_collected

    ticker = get_ticker(args.symbol)
    if not ticker:
        print(f"티커를 찾을 수 없습니다: {args.symbol}")
        sys.exit(1)

    print(f"{ticker.symbol} ({ticker.exchange}) 1년치 일봉 업데이트 시작...")
    kis_api = KisApi.from_env()
    candles = kis_api.fetch_us_stock_candles_daily_year(
        symbol=ticker.symbol,
        exchange=ticker.exchange,
        max_days=365,
    )

    if candles:
        saved_count = save_us_stock_candles(
            symbol=ticker.symbol,
            interval="daily",
            candles=candles,
        )
        update_last_collected(ticker.id)
        print(f"일봉 업데이트 완료: {saved_count}건 저장")
    else:
        print("일봉 데이터가 없습니다.")


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


def cmd_yf_collect_60m(args):
    """yfinance로 60분봉을 수집합니다 (프리마켓/애프터마켓 포함)."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from yfinance_collector import YFinanceCollector

    collector = YFinanceCollector(request_delay=1.0)
    results = collector.collect_60m_candles(
        period=args.period,
        include_extended_hours=args.extended,
    )

    print("\n=== yfinance 60분봉 수집 결과 ===")
    for r in results:
        status = "성공" if r.success else f"실패: {r.error_message}"
        print(f"  {r.symbol}: {status} ({r.records_saved}건)")


def cmd_yf_collect_daily(args):
    """yfinance로 일봉을 수집합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from yfinance_collector import YFinanceCollector

    collector = YFinanceCollector(request_delay=1.0)
    results = collector.collect_daily_candles(period=args.period)

    print("\n=== yfinance 일봉 수집 결과 ===")
    for r in results:
        status = "성공" if r.success else f"실패: {r.error_message}"
        print(f"  {r.symbol}: {status} ({r.records_saved}건)")


def cmd_yf_collect_single(args):
    """yfinance로 단일 종목을 수집합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from yfinance_collector import YFinanceCollector

    collector = YFinanceCollector(request_delay=1.0)

    if args.interval == "60m":
        result = collector.collect_single_ticker_60m(
            symbol=args.symbol,
            period=args.period,
            include_extended_hours=args.extended,
        )
    else:
        result = collector.collect_single_ticker_daily(
            symbol=args.symbol,
            period=args.period,
        )

    status = "성공" if result.success else f"실패: {result.error_message}"
    print(f"\n{args.symbol} ({args.interval}): {status} ({result.records_saved}건)")


def cmd_tiingo_collect_60m(args):
    """Tiingo로 60분봉을 수집합니다 (프리마켓/애프터마켓 포함)."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from tiingo_collector import TiingoCollector

    # 무료 티어: 시간당 50 requests = 75초 간격 (기본값)
    collector = TiingoCollector()
    results = collector.collect_60m_candles(
        days=args.days,
        include_after_hours=args.extended,
    )

    print("\n=== Tiingo 60분봉 수집 결과 ===")
    for r in results:
        status = "성공" if r.success else f"실패: {r.error_message}"
        print(f"  {r.symbol}: {status} ({r.records_saved}건)")


def cmd_tiingo_collect_daily(args):
    """Tiingo로 일봉을 수집합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from tiingo_collector import TiingoCollector

    # 무료 티어: 시간당 50 requests = 75초 간격 (기본값)
    collector = TiingoCollector()
    results = collector.collect_daily_candles(days=args.days)

    print("\n=== Tiingo 일봉 수집 결과 ===")
    for r in results:
        status = "성공" if r.success else f"실패: {r.error_message}"
        print(f"  {r.symbol}: {status} ({r.records_saved}건)")


def cmd_tiingo_collect_single(args):
    """Tiingo로 단일 종목을 수집합니다."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    setup()
    from tiingo_collector import TiingoCollector
    from datetime import datetime, timedelta

    # 단일 종목은 대기 시간 불필요
    collector = TiingoCollector(request_delay=0)

    if args.interval == "60m":
        result = collector.collect_single_ticker_60m(
            symbol=args.symbol,
            days=args.days,
            include_after_hours=args.extended,
        )
    else:
        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
        result = collector.collect_single_ticker_daily(
            symbol=args.symbol,
            start_date=start_date,
            end_date=end_date,
        )

    status = "성공" if result.success else f"실패: {result.error_message}"
    print(f"\n{args.symbol} ({args.interval}): {status} ({result.records_saved}건)")


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

    # update (1년치 일봉 업데이트)
    p_update_daily = subparsers.add_parser("update", help="1년치 일봉 업데이트")
    p_update_daily.add_argument("symbol", help="종목 코드 (예: AAPL)")
    p_update_daily.set_defaults(func=cmd_update_daily)

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

    # yf-collect-60m (yfinance 60분봉)
    p_yf_60m = subparsers.add_parser("yf-collect-60m", help="yfinance 60분봉 수집 (시간외 포함)")
    p_yf_60m.add_argument("--period", "-p", default="5d", help="조회 기간 (기본: 5d)")
    p_yf_60m.add_argument("--extended", "-x", action="store_true", default=True, help="시간외 데이터 포함 (기본: True)")
    p_yf_60m.add_argument("--no-extended", dest="extended", action="store_false", help="시간외 데이터 제외")
    p_yf_60m.set_defaults(func=cmd_yf_collect_60m)

    # yf-collect-daily (yfinance 일봉)
    p_yf_daily = subparsers.add_parser("yf-collect-daily", help="yfinance 일봉 수집")
    p_yf_daily.add_argument("--period", "-p", default="1mo", help="조회 기간 (기본: 1mo)")
    p_yf_daily.set_defaults(func=cmd_yf_collect_daily)

    # yf-collect (yfinance 단일 종목)
    p_yf_single = subparsers.add_parser("yf-collect", help="yfinance 단일 종목 수집")
    p_yf_single.add_argument("symbol", help="종목 코드 (예: AAPL)")
    p_yf_single.add_argument("--interval", "-i", default="60m", choices=["60m", "daily"], help="주기 (기본: 60m)")
    p_yf_single.add_argument("--period", "-p", default="5d", help="조회 기간 (기본: 5d)")
    p_yf_single.add_argument("--extended", "-x", action="store_true", default=True, help="시간외 데이터 포함")
    p_yf_single.add_argument("--no-extended", dest="extended", action="store_false", help="시간외 데이터 제외")
    p_yf_single.set_defaults(func=cmd_yf_collect_single)

    # tiingo-collect-60m (Tiingo 60분봉)
    p_tiingo_60m = subparsers.add_parser("tiingo-collect-60m", help="Tiingo 60분봉 수집 (시간외 포함)")
    p_tiingo_60m.add_argument("--days", "-d", type=int, default=5, help="조회 기간 (일, 기본: 5, 최대: 5)")
    p_tiingo_60m.add_argument("--extended", "-x", action="store_true", default=True, help="시간외 데이터 포함 (기본: True)")
    p_tiingo_60m.add_argument("--no-extended", dest="extended", action="store_false", help="시간외 데이터 제외")
    p_tiingo_60m.set_defaults(func=cmd_tiingo_collect_60m)

    # tiingo-collect-daily (Tiingo 일봉)
    p_tiingo_daily = subparsers.add_parser("tiingo-collect-daily", help="Tiingo 일봉 수집")
    p_tiingo_daily.add_argument("--days", "-d", type=int, default=30, help="조회 기간 (일, 기본: 30)")
    p_tiingo_daily.set_defaults(func=cmd_tiingo_collect_daily)

    # tiingo-collect (Tiingo 단일 종목)
    p_tiingo_single = subparsers.add_parser("tiingo-collect", help="Tiingo 단일 종목 수집")
    p_tiingo_single.add_argument("symbol", help="종목 코드 (예: AAPL)")
    p_tiingo_single.add_argument("--interval", "-i", default="60m", choices=["60m", "daily"], help="주기 (기본: 60m)")
    p_tiingo_single.add_argument("--days", "-d", type=int, default=5, help="조회 기간 (일, 기본: 5)")
    p_tiingo_single.add_argument("--extended", "-x", action="store_true", default=True, help="시간외 데이터 포함")
    p_tiingo_single.add_argument("--no-extended", dest="extended", action="store_false", help="시간외 데이터 제외")
    p_tiingo_single.set_defaults(func=cmd_tiingo_collect_single)

    args = parser.parse_args()
    if args.command is None:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
