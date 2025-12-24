"""yfinance 기반 주식 데이터 조회 API."""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

import yfinance as yf

logger = logging.getLogger(__name__)


@dataclass
class CandleData:
    """캔들 데이터."""

    candle_time: datetime
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    volume: int
    is_extended_hours: bool = False  # 시간외 거래 여부


class YFinanceApi:
    """yfinance 기반 주식 데이터 API.

    한국투자증권 API와 달리 인증이 필요 없으며,
    프리마켓/애프터마켓 데이터도 조회할 수 있습니다.
    """

    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def fetch_candles_60m(
        self,
        symbol: str,
        period: str = "5d",
        include_extended_hours: bool = True,
    ) -> List[CandleData]:
        """60분봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            period: 조회 기간 (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
            include_extended_hours: 프리마켓/애프터마켓 포함 여부

        Returns:
            캔들 데이터 리스트

        Note:
            - 60분봉은 최대 730일(약 2년)까지 조회 가능
            - include_extended_hours=True 시 정규장 외 데이터 포함
        """
        self.logger.info("[yfinance] %s 60분봉 조회 (period=%s, extended=%s)", symbol, period, include_extended_hours)

        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(
                period=period,
                interval="60m",
                prepost=include_extended_hours,
            )

            if df.empty:
                self.logger.warning("[yfinance] %s: 데이터 없음", symbol)
                return []

            candles = self._dataframe_to_candles(df, include_extended_hours)
            self.logger.info("[yfinance] %s: %d건 조회 완료", symbol, len(candles))
            return candles

        except Exception as e:
            self.logger.error("[yfinance] %s 60분봉 조회 실패: %s", symbol, e)
            return []

    def fetch_candles_daily(
        self,
        symbol: str,
        period: str = "1mo",
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> List[CandleData]:
        """일봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            period: 조회 기간 (start/end 미지정 시 사용)
            start: 시작일 (YYYY-MM-DD 형식)
            end: 종료일 (YYYY-MM-DD 형식)

        Returns:
            캔들 데이터 리스트

        Note:
            - 일봉은 전체 기간 조회 가능
            - start/end 지정 시 period는 무시됨
        """
        self.logger.info("[yfinance] %s 일봉 조회 (period=%s, start=%s, end=%s)", symbol, period, start, end)

        try:
            ticker = yf.Ticker(symbol)

            if start and end:
                df = ticker.history(start=start, end=end, interval="1d")
            else:
                df = ticker.history(period=period, interval="1d")

            if df.empty:
                self.logger.warning("[yfinance] %s: 데이터 없음", symbol)
                return []

            candles = self._dataframe_to_candles(df, extended_hours=False)
            self.logger.info("[yfinance] %s: %d건 조회 완료", symbol, len(candles))
            return candles

        except Exception as e:
            self.logger.error("[yfinance] %s 일봉 조회 실패: %s", symbol, e)
            return []

    def fetch_current_price(self, symbol: str) -> Optional[dict]:
        """현재가를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)

        Returns:
            현재가 정보 딕셔너리 또는 None
        """
        self.logger.info("[yfinance] %s 현재가 조회", symbol)

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            return {
                "symbol": symbol,
                "price": info.get("regularMarketPrice") or info.get("currentPrice"),
                "previous_close": info.get("previousClose"),
                "open": info.get("regularMarketOpen"),
                "high": info.get("regularMarketDayHigh"),
                "low": info.get("regularMarketDayLow"),
                "volume": info.get("regularMarketVolume"),
                "market_cap": info.get("marketCap"),
                "pre_market_price": info.get("preMarketPrice"),
                "post_market_price": info.get("postMarketPrice"),
            }

        except Exception as e:
            self.logger.error("[yfinance] %s 현재가 조회 실패: %s", symbol, e)
            return None

    def _dataframe_to_candles(self, df, extended_hours: bool = False) -> List[CandleData]:
        """pandas DataFrame을 CandleData 리스트로 변환합니다."""
        candles = []

        for timestamp, row in df.iterrows():
            # timestamp가 timezone-aware일 수 있으므로 처리
            if hasattr(timestamp, "tz") and timestamp.tz is not None:
                candle_time = timestamp.to_pydatetime()
            else:
                candle_time = timestamp.to_pydatetime()

            # 시간외 거래 여부 판단 (미국 정규장: 9:30 ~ 16:00 EST)
            is_extended = False
            if extended_hours:
                hour = candle_time.hour
                # 대략적인 판단: 9시 이전 또는 16시 이후면 시간외
                is_extended = hour < 9 or hour >= 16

            candles.append(
                CandleData(
                    candle_time=candle_time,
                    open_price=float(row["Open"]),
                    high_price=float(row["High"]),
                    low_price=float(row["Low"]),
                    close_price=float(row["Close"]),
                    volume=int(row["Volume"]),
                    is_extended_hours=is_extended,
                )
            )

        return candles


def main():
    """테스트용 메인 함수."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    api = YFinanceApi()

    # 60분봉 테스트 (시간외 포함)
    print("\n=== AAPL 60분봉 (시간외 포함) ===")
    candles_60m = api.fetch_candles_60m("AAPL", period="1d", include_extended_hours=True)
    for c in candles_60m[:5]:
        ext = " [EXT]" if c.is_extended_hours else ""
        print(f"  {c.candle_time}: O={c.open_price:.2f} H={c.high_price:.2f} L={c.low_price:.2f} C={c.close_price:.2f} V={c.volume}{ext}")

    # 일봉 테스트
    print("\n=== AAPL 일봉 ===")
    candles_daily = api.fetch_candles_daily("AAPL", period="5d")
    for c in candles_daily:
        print(f"  {c.candle_time.date()}: O={c.open_price:.2f} H={c.high_price:.2f} L={c.low_price:.2f} C={c.close_price:.2f} V={c.volume}")

    # 현재가 테스트
    print("\n=== AAPL 현재가 ===")
    price = api.fetch_current_price("AAPL")
    if price:
        print(f"  현재가: ${price['price']}")
        print(f"  프리마켓: ${price['pre_market_price']}")
        print(f"  애프터마켓: ${price['post_market_price']}")


if __name__ == "__main__":
    main()
