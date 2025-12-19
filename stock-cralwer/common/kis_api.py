"""한국투자증권 API 클라이언트."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

TOKEN_FILE = ".access_token.json"


class KisApi:
    """한국투자증권 API 클라이언트."""

    def __init__(self, base_url: str, app_key: str, app_secret: str):
        self.base_url = base_url
        self.app_key = app_key
        self.app_secret = app_secret
        self._access_token: Optional[str] = None

    @classmethod
    def from_env(cls) -> "KisApi":
        """환경변수에서 설정을 읽어 인스턴스를 생성합니다."""
        from dotenv import load_dotenv
        load_dotenv()

        base_url = os.getenv("KIS_BASE_URL", "https://openapi.koreainvestment.com:9443")
        app_key = os.getenv("KIS_APP_KEY", "")
        app_secret = os.getenv("KIS_APP_SECRET", "")

        if not all([app_key, app_secret]):
            raise ValueError("KIS_APP_KEY, KIS_APP_SECRET 환경 변수를 설정하세요.")

        return cls(base_url, app_key, app_secret)

    # =========================================================================
    # Token Management
    # =========================================================================

    def _get_token_path(self) -> str:
        """토큰 파일 경로를 반환합니다."""
        return os.path.join(os.path.dirname(__file__), "..", TOKEN_FILE)

    def _load_cached_token(self) -> Tuple[Optional[str], Optional[datetime]]:
        """저장된 토큰과 만료시간을 로드합니다."""
        token_path = self._get_token_path()
        if os.path.exists(token_path):
            try:
                with open(token_path, "r") as f:
                    data = json.load(f)
                    token = data.get("access_token")
                    expires_str = data.get("expires_at")
                    expires_at = datetime.strptime(expires_str, "%Y-%m-%d %H:%M:%S") if expires_str else None
                    return token, expires_at
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning("토큰 파일 파싱 실패: %s", e)
        return None, None

    def _save_token(self, token: str, expires_at: str) -> None:
        """토큰과 만료시간을 파일에 저장합니다."""
        token_path = self._get_token_path()
        data = {
            "access_token": token,
            "expires_at": expires_at,
        }
        with open(token_path, "w") as f:
            json.dump(data, f, indent=2)
        logger.info("Access Token을 저장했습니다. (만료: %s)", expires_at)

    def _is_token_valid(self, expires_at: Optional[datetime]) -> bool:
        """토큰이 아직 유효한지 확인합니다."""
        if expires_at is None:
            return False
        return datetime.now() < expires_at

    def get_access_token(self, force_new: bool = False) -> str:
        """Access Token을 발급받습니다. 캐시된 토큰이 유효하면 재사용합니다."""
        # 캐시된 토큰 확인
        if not force_new:
            cached_token, expires_at = self._load_cached_token()
            if cached_token and self._is_token_valid(expires_at):
                remaining = expires_at - datetime.now()
                logger.info("캐시된 Access Token 사용 (남은 시간: %s)", remaining)
                self._access_token = cached_token
                return cached_token
            elif cached_token:
                logger.info("캐시된 토큰이 만료되었습니다. 새로 발급합니다.")

        url = f"{self.base_url}/oauth2/tokenP"
        body = {
            "grant_type": "client_credentials",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
        }

        logger.info("Access Token 발급 요청...")

        try:
            response = requests.post(url, json=body, timeout=10)
        except requests.RequestException as e:
            raise RuntimeError(f"토큰 발급 요청 실패: {e}")

        if not response.ok:
            raise RuntimeError(f"토큰 발급 실패 - status={response.status_code}, body={response.text}")

        payload = response.json()
        token = payload.get("access_token")
        expires_str = payload.get("access_token_token_expired")

        if not token:
            raise RuntimeError(f"토큰 응답에 access_token이 없습니다: {payload}")

        logger.info("Access Token 발급 성공 (유효기간: %s)", expires_str)
        self._save_token(token, expires_str)
        self._access_token = token
        return token

    def _ensure_token(self) -> str:
        """토큰이 없으면 발급받고 반환합니다."""
        if self._access_token is None:
            return self.get_access_token()
        return self._access_token

    def _get_headers(self, tr_id: str) -> dict:
        """API 요청에 필요한 헤더를 반환합니다."""
        return {
            "authorization": f"Bearer {self._ensure_token()}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": tr_id,
            "custtype": "P",
        }

    # =========================================================================
    # US Stock API
    # =========================================================================

    def fetch_us_stock_candles_60m(self, symbol: str, exchange: str = "NAS", count: int = 10) -> List[dict]:
        """미국 주식 60분봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            exchange: 거래소 코드 (NAS: 나스닥, NYS: 뉴욕, AMS: 아멕스)
            count: 조회 건수

        Returns:
            캔들 데이터 리스트
        """
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice"
        headers = self._get_headers("HHDFS76950200")
        params = {
            "AUTH": "",
            "EXCD": exchange,
            "SYMB": symbol.upper(),
            "NMIN": "60",
            "PINC": "1",
            "NEXT": "",
            "NREC": str(count),
            "FILL": "",
            "KEYB": "",
        }

        logger.info("[미국주식] %s 60분봉 조회 요청...", symbol)

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if not response.ok:
            logger.error("API 호출 실패 - status=%s, body=%s", response.status_code, response.text)
            return []

        payload = response.json()
        logger.info("응답 코드: %s, 메시지: %s", payload.get("rt_cd"), payload.get("msg1"))

        output2 = payload.get("output2") or []
        if not output2:
            logger.warning("시세 데이터가 없습니다.")
            return []

        logger.info("=== %s 60분봉 데이터 (%d건) ===", symbol, len(output2))
        return output2

    def fetch_us_stock_candles_daily(self, symbol: str, exchange: str = "NAS", count: int = 30) -> List[dict]:
        """미국 주식 일봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            exchange: 거래소 코드 (NAS: 나스닥, NYS: 뉴욕, AMS: 아멕스)
            count: 조회 건수

        Returns:
            캔들 데이터 리스트
        """
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/dailyprice"
        headers = self._get_headers("HHDFS76240000")
        params = {
            "AUTH": "",
            "EXCD": exchange,
            "SYMB": symbol.upper(),
            "GUBN": "0",  # 0: 일봉
            "BYMD": "",
            "MODP": "1",
        }

        logger.info("[미국주식] %s 일봉 조회 요청...", symbol)

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if not response.ok:
            logger.error("API 호출 실패 - status=%s, body=%s", response.status_code, response.text)
            return []

        payload = response.json()
        logger.info("응답 코드: %s, 메시지: %s", payload.get("rt_cd"), payload.get("msg1"))

        output2 = payload.get("output2") or []
        if not output2:
            logger.warning("시세 데이터가 없습니다.")
            return []

        logger.info("=== %s 일봉 데이터 (%d건) ===", symbol, len(output2))
        return output2[:count]

    def fetch_us_stock_price(self, symbol: str, exchange: str = "NAS") -> Optional[dict]:
        """미국 주식 현재가를 조회합니다.

        Args:
            symbol: 종목 코드 (예: AAPL, TSLA)
            exchange: 거래소 코드 (NAS: 나스닥, NYS: 뉴욕, AMS: 아멕스)

        Returns:
            현재가 정보 딕셔너리 또는 None
        """
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/price"
        headers = self._get_headers("HHDFS00000300")
        params = {
            "AUTH": "",
            "EXCD": exchange,
            "SYMB": symbol.upper(),
        }

        logger.info("[미국주식] %s 현재가 조회 요청...", symbol)

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if not response.ok:
            logger.error("API 호출 실패 - status=%s, body=%s", response.status_code, response.text)
            return None

        payload = response.json()
        logger.info("응답 코드: %s, 메시지: %s", payload.get("rt_cd"), payload.get("msg1"))

        output = payload.get("output")
        return output

    # =========================================================================
    # KR Stock API
    # =========================================================================

    def fetch_kr_stock_candles_hourly(self, symbol: str) -> List[dict]:
        """국내 주식 1시간봉 데이터를 조회합니다.

        Args:
            symbol: 종목 코드 (예: 005930)

        Returns:
            캔들 데이터 리스트
        """
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice"
        headers = self._get_headers("FHKST03010200")
        params = {
            "fid_cond_mrkt_div_code": "J",
            "fid_input_iscd": symbol,
            "fid_input_hour_8": "1",
            "fid_pw_data_incu_yn": "N",
            "fid_uplc_diff_yn": "N",
            "fid_period_div_code": "H",
        }

        logger.info("[국내주식] %s 1시간봉 조회 요청...", symbol)

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if not response.ok:
            logger.error("API 호출 실패 - status=%s, body=%s", response.status_code, response.text)
            return []

        payload = response.json()
        logger.info("응답 코드: %s, 메시지: %s", payload.get("rt_cd"), payload.get("msg1"))

        output2 = payload.get("output2") or []
        if not output2:
            logger.warning("시세 데이터가 없습니다.")
            return []

        logger.info("=== %s 1시간봉 데이터 (%d건) ===", symbol, len(output2))
        return output2

    def fetch_kr_stock_price(self, symbol: str) -> Optional[dict]:
        """국내 주식 현재가를 조회합니다.

        Args:
            symbol: 종목 코드 (예: 005930)

        Returns:
            현재가 정보 딕셔너리 또는 None
        """
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-price"
        headers = self._get_headers("FHKST01010100")
        params = {
            "fid_cond_mrkt_div_code": "J",
            "fid_input_iscd": symbol,
        }

        logger.info("[국내주식] %s 현재가 조회 요청...", symbol)

        response = requests.get(url, headers=headers, params=params, timeout=10)

        if not response.ok:
            logger.error("API 호출 실패 - status=%s, body=%s", response.status_code, response.text)
            return None

        payload = response.json()
        output = payload.get("output")
        return output
