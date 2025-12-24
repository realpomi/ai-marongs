# 미국 주식 자동 캔들 수집 기능 설계 문서

## 1. 개요

### 1.1 목적

한국투자증권(KIS) API를 통해 미국 주식의 60분봉과 일봉 데이터를 주기적으로 수집하여 PostgreSQL에 저장합니다.

### 1.2 요구사항

| 항목 | 내용 |
|------|------|
| 수집 대상 | 미국 주식만 |
| 60분봉 수집 주기 | 60분 간격 |
| 일봉 수집 주기 | 하루 1회 |
| 티커 등록 방식 | DB 직접 입력 (추후 Discord 봇 연동 예정) |
| 시장 시간 고려 | 시장 오픈 여부와 관계없이 항상 수집 |

---

## 2. 데이터베이스 설계

### 2.1 신규 테이블: managed_tickers

티커(종목)를 관리하는 테이블입니다.

```sql
CREATE TABLE IF NOT EXISTS managed_tickers (
    id SERIAL PRIMARY KEY,

    -- 티커 정보
    symbol VARCHAR(20) NOT NULL,          -- 종목 코드 (예: AAPL, TSLA)
    name VARCHAR(100),                    -- 종목명 (선택, 예: Apple Inc.)
    exchange VARCHAR(10) NOT NULL DEFAULT 'NAS',  -- 거래소 코드

    -- 상태 관리
    is_active BOOLEAN NOT NULL DEFAULT TRUE,      -- 수집 활성화 여부

    -- 타임스탬프
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_collected_at TIMESTAMPTZ,        -- 마지막 수집 시간

    -- 제약 조건
    CONSTRAINT uq_managed_tickers_symbol UNIQUE(symbol)
);

-- 활성 티커 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_managed_tickers_active
    ON managed_tickers(is_active) WHERE is_active = TRUE;
```

### 2.2 거래소 코드

| 코드 | 거래소 | 예시 종목 |
|------|--------|----------|
| NAS | 나스닥 (NASDAQ) | AAPL, MSFT, GOOGL, TSLA |
| NYS | 뉴욕증권거래소 (NYSE) | JPM, V, WMT |
| AMS | 아멕스 (AMEX) | SPY, GLD |

### 2.3 기존 테이블: us_stock_candles (변경 없음)

```sql
-- 이미 존재하는 테이블 (참조용)
CREATE TABLE IF NOT EXISTS us_stock_candles (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,              -- '60m' 또는 'daily'
    candle_time TIMESTAMPTZ NOT NULL,
    open_price NUMERIC(18, 4) NOT NULL,
    high_price NUMERIC(18, 4) NOT NULL,
    low_price NUMERIC(18, 4) NOT NULL,
    close_price NUMERIC(18, 4) NOT NULL,
    volume BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_us_stock_candles UNIQUE(symbol, interval, candle_time)
);
```

---

## 3. 시스템 아키텍처

### 3.1 전체 흐름

```
┌─────────────────────────────────────────────────────────────┐
│                      CandleCollector                        │
│                                                             │
│  ┌──────────────┐                                           │
│  │   schedule   │  60분마다: collect_60m_candles()          │
│  │  스케줄러    │  매일 1회: collect_daily_candles()        │
│  └──────┬───────┘                                           │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐    SELECT     ┌─────────────────────┐    │
│  │TickerRepo    │──────────────>│ DB: managed_tickers │    │
│  │(티커 조회)   │               │ (활성 티커 목록)    │    │
│  └──────┬───────┘               └─────────────────────┘    │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐    API 호출   ┌─────────────────────┐    │
│  │   KisApi     │──────────────>│ 한국투자증권 API    │    │
│  │ (캔들 조회)  │<──────────────│ (60분봉/일봉)       │    │
│  └──────┬───────┘               └─────────────────────┘    │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐    UPSERT     ┌─────────────────────┐    │
│  │ save_candles │──────────────>│ DB: us_stock_candles│    │
│  │ (저장)       │               │ (캔들 데이터)       │    │
│  └──────────────┘               └─────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 수집 프로세스 상세

```
1. 스케줄러 트리거 (60분 또는 일봉)
       │
       ▼
2. DB에서 활성 티커 목록 조회
   SELECT * FROM managed_tickers WHERE is_active = TRUE
       │
       ▼
3. 각 티커별 반복 처리
   ┌─────────────────────────────────────┐
   │ for ticker in active_tickers:      │
   │   ├─ KIS API 호출 (60분봉/일봉)    │
   │   ├─ 응답 데이터 파싱              │
   │   ├─ us_stock_candles에 UPSERT     │
   │   ├─ last_collected_at 업데이트    │
   │   ├─ 0.5초 대기 (Rate Limit 방지)  │
   │   └─ 에러 시 로깅 후 다음 티커     │
   └─────────────────────────────────────┘
       │
       ▼
4. 수집 결과 로깅
```

---

## 4. 파일 구조

### 4.1 신규 생성 파일

```
stock-cralwer/
├── common/
│   └── ticker_repository.py    # [신규] 티커 테이블 CRUD
└── candle_collector.py         # [신규] 캔들 수집 스케줄러
```

### 4.2 수정 파일

```
stock-cralwer/
├── common/
│   └── __init__.py             # [수정] 새 함수 export 추가
├── config.py                   # [수정] 수집 주기 설정 추가
└── .env.example                # [수정] 새 환경변수 문서화
```

---

## 5. 모듈 상세 설계

### 5.1 ticker_repository.py

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

@dataclass
class ManagedTicker:
    """관리 대상 티커 정보"""
    id: int
    symbol: str
    name: Optional[str]
    exchange: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    last_collected_at: Optional[datetime]


def ensure_managed_tickers_table() -> None:
    """managed_tickers 테이블이 없으면 생성"""


def get_active_tickers() -> List[ManagedTicker]:
    """활성화된 모든 티커 목록 조회"""


def add_ticker(symbol: str, exchange: str = "NAS", name: str = None) -> int:
    """새 티커 추가, 생성된 ID 반환"""


def deactivate_ticker(symbol: str) -> bool:
    """티커 비활성화 (is_active = FALSE)"""


def activate_ticker(symbol: str) -> bool:
    """티커 활성화 (is_active = TRUE)"""


def update_last_collected(ticker_id: int) -> None:
    """마지막 수집 시간 업데이트"""


def get_ticker(symbol: str) -> Optional[ManagedTicker]:
    """심볼로 티커 조회"""
```

### 5.2 candle_collector.py

```python
from dataclasses import dataclass
from typing import List, Optional
import schedule
import time
import logging

@dataclass
class CollectionResult:
    """수집 결과"""
    symbol: str
    success: bool
    records_saved: int = 0
    error_message: Optional[str] = None


class CandleCollector:
    """미국 주식 캔들 수집기"""

    def __init__(self, kis_api: KisApi):
        self.kis_api = kis_api
        self.logger = logging.getLogger(__name__)

    def collect_60m_candles(self) -> List[CollectionResult]:
        """
        모든 활성 티커의 60분봉 수집

        Returns:
            각 티커별 수집 결과 리스트
        """

    def collect_daily_candles(self) -> List[CollectionResult]:
        """
        모든 활성 티커의 일봉 수집

        Returns:
            각 티커별 수집 결과 리스트
        """

    def _collect_ticker_60m(self, ticker: ManagedTicker) -> CollectionResult:
        """단일 티커 60분봉 수집 (내부 메서드)"""

    def _collect_ticker_daily(self, ticker: ManagedTicker) -> CollectionResult:
        """단일 티커 일봉 수집 (내부 메서드)"""

    def start(self,
              interval_60m: int = 60,
              daily_time: str = "07:00") -> None:
        """
        스케줄러 시작

        Args:
            interval_60m: 60분봉 수집 간격 (분)
            daily_time: 일봉 수집 시간 (HH:MM 형식)
        """
```

---

## 6. 환경변수

### 6.1 추가할 환경변수

```env
# 60분봉 수집 간격 (분, 기본값: 60)
CANDLE_60M_INTERVAL_MINUTES=60

# 일봉 수집 시간 (HH:MM 형식, 기본값: 07:00)
# 미국 시장 마감(한국시간 06:00) 이후 수집 권장
DAILY_CANDLE_COLLECT_TIME=07:00

# API 호출 간 대기 시간 (초, 기본값: 0.5)
# KIS API Rate Limit 방지용
API_REQUEST_DELAY=0.5
```

### 6.2 config.py 추가 필드

```python
@dataclass
class Settings:
    # ... 기존 필드 ...

    # 캔들 수집 설정 (신규)
    candle_60m_interval_minutes: int = 60
    daily_candle_collect_time: str = "07:00"
    api_request_delay: float = 0.5
```

---

## 7. 에러 처리

### 7.1 처리 전략

| 에러 유형 | 처리 방식 |
|----------|----------|
| API 타임아웃 | 로깅 후 다음 티커 진행 |
| API 응답 에러 | 로깅 후 다음 티커 진행 |
| DB 연결 실패 | 로깅 후 전체 수집 중단 |
| 개별 티커 저장 실패 | 로깅 후 다음 티커 진행 |

### 7.2 로깅 예시

```
2024-01-15 10:00:00 [INFO] 60분봉 수집 시작 (활성 티커: 5개)
2024-01-15 10:00:01 [INFO] AAPL: 30건 저장 완료
2024-01-15 10:00:02 [INFO] TSLA: 30건 저장 완료
2024-01-15 10:00:03 [ERROR] GOOGL: API 타임아웃 - 스킵
2024-01-15 10:00:04 [INFO] MSFT: 30건 저장 완료
2024-01-15 10:00:05 [INFO] NVDA: 30건 저장 완료
2024-01-15 10:00:05 [INFO] 60분봉 수집 완료 (성공: 4, 실패: 1)
```

---

## 8. 사용 예시

### 8.1 티커 등록 (SQL)

```sql
-- 나스닥 종목 추가
INSERT INTO managed_tickers (symbol, name, exchange)
VALUES ('AAPL', 'Apple Inc.', 'NAS');

INSERT INTO managed_tickers (symbol, name, exchange)
VALUES ('TSLA', 'Tesla Inc.', 'NAS');

-- NYSE 종목 추가
INSERT INTO managed_tickers (symbol, name, exchange)
VALUES ('JPM', 'JPMorgan Chase', 'NYS');

-- 티커 비활성화
UPDATE managed_tickers SET is_active = FALSE WHERE symbol = 'TSLA';

-- 활성 티커 확인
SELECT symbol, name, exchange, last_collected_at
FROM managed_tickers
WHERE is_active = TRUE;
```

### 8.2 수집기 실행

```python
from common import KisApi, init_pool
from candle_collector import CandleCollector
from config import Settings

settings = Settings.from_env()
init_pool(settings.db_dsn)

kis_api = KisApi.from_env()
collector = CandleCollector(kis_api)

# 스케줄러 시작 (60분봉: 매 60분, 일봉: 매일 07:00)
collector.start(
    interval_60m=settings.candle_60m_interval_minutes,
    daily_time=settings.daily_candle_collect_time
)
```

---

## 9. 구현 순서

| 단계 | 작업 | 파일 |
|------|------|------|
| 1 | 티커 테이블 생성 함수 구현 | `common/ticker_repository.py` |
| 2 | 티커 CRUD 함수 구현 | `common/ticker_repository.py` |
| 3 | common 모듈 export 추가 | `common/__init__.py` |
| 4 | 캔들 수집기 클래스 구현 | `candle_collector.py` |
| 5 | 설정 클래스 필드 추가 | `config.py` |
| 6 | 환경변수 예시 업데이트 | `.env.example` |
| 7 | 테스트 | - |

---

## 10. 향후 확장 계획

- Discord 봇을 통한 티커 등록/삭제 명령어
- 수집 상태 모니터링 대시보드
- 수집 실패 알림 (Discord/Slack)
