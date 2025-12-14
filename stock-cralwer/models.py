"""데이터 모델 정의."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass
class StockPriceRecord:
    """저장할 주가 정보."""

    symbol: str
    price: Decimal
    price_time: datetime
