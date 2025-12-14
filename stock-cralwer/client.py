"""한국투자증권 시세 조회 클라이언트."""
from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, Optional

import requests

from models import StockPriceRecord

logger = logging.getLogger(__name__)


class KoreaInvestmentClient:
    """한국투자증권 OpenAPI를 호출합니다."""

    def __init__(self, base_url: str, app_key: str, app_secret: str, access_token: str, account_id: str, account_product_code: str):
        self.base_url = base_url.rstrip("/")
        self.app_key = app_key
        self.app_secret = app_secret
        self.access_token = access_token
        self.account_id = account_id
        self.account_product_code = account_product_code
        self.session = requests.Session()

    def _headers(self) -> Dict[str, str]:
        return {
            "authorization": f"Bearer {self.access_token}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": "FHKST03010200",
            "custtype": "P",
        }

    def fetch_hourly_price(self, symbol: str) -> Optional[StockPriceRecord]:
        """지정한 종목의 최신 1시간 봉 가격을 반환합니다."""

        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice"
        params = {
            "fid_cond_mrkt_div_code": "J",
            "fid_input_iscd": symbol,
            "fid_input_hour_8": "1",
            "fid_pw_data_incu_yn": "N",
            "fid_uplc_diff_yn": "N",
            "fid_period_div_code": "H",
        }

        response = self.session.get(url, headers=self._headers(), params=params, timeout=10)
        if not response.ok:
            logger.error("시세 조회 실패 - 종목: %s, status=%s, body=%s", symbol, response.status_code, response.text)
            return None

        payload = response.json()
        output = payload.get("output2") or []
        if not output:
            logger.warning("시세 데이터가 없습니다 - 종목: %s", symbol)
            return None

        latest = output[-1]
        try:
            price = Decimal(latest["stck_prpr"])
            price_date = latest["stck_bsop_date"]
            price_time = latest["stck_cntg_hour"]
            timestamp = datetime.strptime(f"{price_date} {price_time}", "%Y%m%d %H%M%S")
        except (KeyError, ValueError) as exc:
            logger.error("시세 데이터 파싱 실패 - 종목: %s, error=%s", symbol, exc)
            return None

        return StockPriceRecord(symbol=symbol, price=price, price_time=timestamp)
