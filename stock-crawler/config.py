"""환경 변수에서 크롤러 설정을 로드합니다."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List
import os


@dataclass
class Settings:
    """한국투자증권 크롤러 설정."""

    base_url: str
    app_key: str
    app_secret: str
    access_token: str
    account_id: str
    account_product_code: str
    symbols: List[str]
    fetch_interval_minutes: int
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    nats_url: str
    # 캔들 수집 설정
    candle_60m_interval_minutes: int
    daily_candle_collect_time: str
    api_request_delay: float

    @classmethod
    def from_env(cls) -> "Settings":
        """환경 변수로부터 설정을 생성합니다."""

        symbols_env = os.getenv("SYMBOLS", "")
        symbols = [symbol.strip() for symbol in symbols_env.split(",") if symbol.strip()]

        fetch_interval_minutes = int(os.getenv("FETCH_INTERVAL_MINUTES", "60"))

        return cls(
            base_url=os.getenv("KIS_BASE_URL", "https://openapi.koreainvestment.com:9443"),
            app_key=os.getenv("KIS_APP_KEY", ""),
            app_secret=os.getenv("KIS_APP_SECRET", ""),
            access_token=os.getenv("KIS_ACCESS_TOKEN", ""),
            account_id=os.getenv("KIS_ACCOUNT_ID", ""),
            account_product_code=os.getenv("KIS_ACCOUNT_PRODUCT_CODE", "01"),
            symbols=symbols,
            fetch_interval_minutes=fetch_interval_minutes,
            db_host=os.getenv("DB_HOST", "postgres"),
            db_port=int(os.getenv("DB_PORT", "5432")),
            db_name=os.getenv("DB_NAME", "stocks"),
            db_user=os.getenv("DB_ID", "stocks"),
            db_password=os.getenv("DB_PASSWORD", "password"),
            nats_url=os.getenv("NATS", "nats://nats:4222"),
            # 캔들 수집 설정
            candle_60m_interval_minutes=int(os.getenv("CANDLE_60M_INTERVAL_MINUTES", "60")),
            daily_candle_collect_time=os.getenv("DAILY_CANDLE_COLLECT_TIME", "07:00"),
            api_request_delay=float(os.getenv("API_REQUEST_DELAY", "0.5")),
        )

    @property
    def db_dsn(self) -> str:
        """PostgreSQL 접속 DSN을 반환합니다."""

        return (
            f"dbname={self.db_name} user={self.db_user} "
            f"password={self.db_password} host={self.db_host} port={self.db_port}"
        )
