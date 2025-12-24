"""Tiingo API 클라이언트.

Tiingo IEX(Investors Exchange) 데이터를 활용하여
미국 주식의 프리마켓/애프터마켓 포함 분봉 데이터를 조회합니다.

무료 티어 제한:
- 시간당 50 requests
- 일일 500 unique symbols
- IEX 데이터만 사용 가능 (약 10,000+ 종목)
- IEX resample 데이터(분봉/시간봉)에서는 거래량(volume) 미제공
- 일봉(Daily)에서는 거래량 제공
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional

import requests

logger = logging.getLogger(__name__)


@dataclass
class TiingoCandleData:
    """Tiingo 캔들 데이터."""

    candle_time: datetime
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    volume: int


class TiingoApi:
    """Tiingo IEX API 클라이언트.

    IEX 데이터를 활용하여 프리마켓/애프터마켓 포함 분봉 데이터를 조회합니다.
    """

    def __init__(self, api_key: str, base_url: str = "https://api.tiingo.com"):
        """
        Args:
            api_key: Tiingo API 키
            base_url: Tiingo API 기본 URL
        """
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.logger = logging.getLogger(__name__)

    @classmethod
    def from_env(cls) -> "TiingoApi":
        """환경변수에서 설정을 읽어 인스턴스를 생성합니다."""
        from dotenv import load_dotenv

        load_dotenv()

        api_key = os.getenv("Tiingo_API_KEY", "")
        base_url = os.getenv("Tiingo_BASE_URL", "https://api.tiingo.com")

        if not api_key:
            raise ValueError("Tiingo_API_KEY 환경 변수를 설정하세요.")

        return cls(api_key=api_key, base_url=base_url)

    def _get_headers(self) -> dict:
        """API 요청에 필요한 헤더를 반환합니다."""
        return {
            "Content-Type": "application/json",
            "Authorization": f"Token {self.api_key}",
        }

    def fetch_iex_candles(
        self,
        symbol: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        resample_freq: str = "1hour",
        after_hours: bool = True,
    ) -> List[TiingoCandleData]:
        """IEX 분봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            start_date: 시작일 (YYYY-MM-DD 형식, 미지정 시 오늘)
            end_date: 종료일 (YYYY-MM-DD 형식, 미지정 시 오늘)
            resample_freq: 리샘플링 주기
                - 1min, 5min, 15min, 30min
                - 1hour (60분봉)
            after_hours: 프리마켓/애프터마켓 데이터 포함 여부

        Returns:
            캔들 데이터 리스트

        Note:
            - IEX 데이터는 과거 최대 5영업일까지만 분봉 조회 가능
            - after_hours=True 시 4:00 AM ~ 8:00 PM ET 데이터 포함
        """
        self.logger.info(
            "[tiingo] %s IEX 캔들 조회 (freq=%s, after_hours=%s)",
            symbol,
            resample_freq,
            after_hours,
        )

        url = f"{self.base_url}/iex/{symbol.upper()}/prices"

        params = {
            "resampleFreq": resample_freq,
            "afterHours": str(after_hours).lower(),
        }

        if start_date:
            params["startDate"] = start_date
        if end_date:
            params["endDate"] = end_date

        try:
            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=30,
            )

            if response.status_code == 404:
                self.logger.warning("[tiingo] %s: 종목을 찾을 수 없습니다.", symbol)
                return []

            if not response.ok:
                self.logger.error(
                    "[tiingo] API 호출 실패 - status=%s, body=%s",
                    response.status_code,
                    response.text,
                )
                return []

            data = response.json()

            if not data:
                self.logger.warning("[tiingo] %s: 데이터 없음", symbol)
                return []

            candles = self._parse_iex_response(data)
            self.logger.info("[tiingo] %s: %d건 조회 완료", symbol, len(candles))
            return candles

        except requests.RequestException as e:
            self.logger.error("[tiingo] %s 조회 실패: %s", symbol, e)
            return []

    def fetch_candles_60m(
        self,
        symbol: str,
        days: int = 5,
        include_after_hours: bool = True,
    ) -> List[TiingoCandleData]:
        """60분봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            days: 조회할 기간 (일, 최대 5일)
            include_after_hours: 프리마켓/애프터마켓 포함 여부

        Returns:
            캔들 데이터 리스트

        Note:
            - IEX 데이터는 과거 최대 5영업일까지만 분봉 조회 가능
            - include_after_hours=True 시 4:00 AM ~ 8:00 PM ET 데이터 포함
            - IEX resample 데이터에서는 거래량(volume)이 제공되지 않음 (항상 0)
        """
        # 최대 5일로 제한 (Tiingo IEX 무료 티어 제한)
        days = min(days, 5)

        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        return self.fetch_iex_candles(
            symbol=symbol,
            start_date=start_date,
            end_date=end_date,
            resample_freq="1hour",
            after_hours=include_after_hours,
        )

    def fetch_candles_daily(
        self,
        symbol: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[TiingoCandleData]:
        """일봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            start_date: 시작일 (YYYY-MM-DD 형식)
            end_date: 종료일 (YYYY-MM-DD 형식)

        Returns:
            캔들 데이터 리스트

        Note:
            - 일봉 데이터는 End-of-Day API 사용
            - 무료 티어로도 장기간 데이터 조회 가능
        """
        self.logger.info(
            "[tiingo] %s 일봉 조회 (start=%s, end=%s)",
            symbol,
            start_date,
            end_date,
        )

        url = f"{self.base_url}/tiingo/daily/{symbol.upper()}/prices"

        params = {}
        if start_date:
            params["startDate"] = start_date
        if end_date:
            params["endDate"] = end_date

        try:
            response = requests.get(
                url,
                headers=self._get_headers(),
                params=params,
                timeout=30,
            )

            if response.status_code == 404:
                self.logger.warning("[tiingo] %s: 종목을 찾을 수 없습니다.", symbol)
                return []

            if not response.ok:
                self.logger.error(
                    "[tiingo] API 호출 실패 - status=%s, body=%s",
                    response.status_code,
                    response.text,
                )
                return []

            data = response.json()

            if not data:
                self.logger.warning("[tiingo] %s: 데이터 없음", symbol)
                return []

            candles = self._parse_daily_response(data)
            self.logger.info("[tiingo] %s: %d건 조회 완료", symbol, len(candles))
            return candles

        except requests.RequestException as e:
            self.logger.error("[tiingo] %s 일봉 조회 실패: %s", symbol, e)
            return []

    def _parse_iex_response(self, data: list) -> List[TiingoCandleData]:
        """IEX API 응답을 캔들 데이터로 변환합니다."""
        candles = []

        for item in data:
            try:
                # Tiingo IEX 응답 형식
                # date: "2024-01-15T09:30:00+00:00"
                date_str = item.get("date", "")
                if not date_str:
                    continue

                # ISO 형식 파싱
                candle_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))

                candles.append(
                    TiingoCandleData(
                        candle_time=candle_time,
                        open_price=float(item.get("open", 0)),
                        high_price=float(item.get("high", 0)),
                        low_price=float(item.get("low", 0)),
                        close_price=float(item.get("close", 0)),
                        volume=int(item.get("volume", 0)),
                    )
                )
            except (ValueError, KeyError) as e:
                self.logger.warning("IEX 캔들 파싱 실패: %s", e)
                continue

        return candles

    def _parse_daily_response(self, data: list) -> List[TiingoCandleData]:
        """End-of-Day API 응답을 캔들 데이터로 변환합니다."""
        candles = []

        for item in data:
            try:
                # Tiingo Daily 응답 형식
                # date: "2024-01-15T00:00:00+00:00"
                date_str = item.get("date", "")
                if not date_str:
                    continue

                candle_time = datetime.fromisoformat(date_str.replace("Z", "+00:00"))

                # 일봉은 adjOpen, adjHigh, adjLow, adjClose 사용 (분할 조정가)
                candles.append(
                    TiingoCandleData(
                        candle_time=candle_time,
                        open_price=float(item.get("adjOpen", item.get("open", 0))),
                        high_price=float(item.get("adjHigh", item.get("high", 0))),
                        low_price=float(item.get("adjLow", item.get("low", 0))),
                        close_price=float(item.get("adjClose", item.get("close", 0))),
                        volume=int(item.get("adjVolume", item.get("volume", 0))),
                    )
                )
            except (ValueError, KeyError) as e:
                self.logger.warning("일봉 캔들 파싱 실패: %s", e)
                continue

        return candles

    def get_supported_tickers(self) -> List[dict]:
        """지원되는 종목 목록을 조회합니다.

        Returns:
            종목 정보 리스트 (ticker, exchange, name 등)
        """
        url = f"{self.base_url}/iex"

        try:
            response = requests.get(
                url,
                headers=self._get_headers(),
                timeout=30,
            )

            if not response.ok:
                self.logger.error(
                    "[tiingo] 종목 목록 조회 실패 - status=%s",
                    response.status_code,
                )
                return []

            return response.json()

        except requests.RequestException as e:
            self.logger.error("[tiingo] 종목 목록 조회 실패: %s", e)
            return []


def main():
    """테스트용 메인 함수."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    api = TiingoApi.from_env()

    # 60분봉 테스트 (시간외 포함)
    print("\n=== AAPL 60분봉 (시간외 포함) ===")
    candles_60m = api.fetch_candles_60m("AAPL", days=2, include_after_hours=True)
    for c in candles_60m[:10]:
        print(
            f"  {c.candle_time}: O={c.open_price:.2f} H={c.high_price:.2f} "
            f"L={c.low_price:.2f} C={c.close_price:.2f} V={c.volume}"
        )

    # 일봉 테스트
    print("\n=== AAPL 일봉 (최근 5일) ===")
    from datetime import datetime, timedelta

    end = datetime.now().strftime("%Y-%m-%d")
    start = (datetime.now() - timedelta(days=5)).strftime("%Y-%m-%d")
    candles_daily = api.fetch_candles_daily("AAPL", start_date=start, end_date=end)
    for c in candles_daily:
        print(
            f"  {c.candle_time.date()}: O={c.open_price:.2f} H={c.high_price:.2f} "
            f"L={c.low_price:.2f} C={c.close_price:.2f} V={c.volume}"
        )


if __name__ == "__main__":
    main()
