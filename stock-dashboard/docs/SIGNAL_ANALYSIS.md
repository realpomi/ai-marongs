# Signal Analysis (시그널 분석)

주식 종목의 기술적 지표를 분석하여 진입 추천 시그널을 생성하고 DB에 기록하는 기능입니다.

## 개요

- **목적**: 매일 스케줄러 실행 후 각 종목의 시그널 레벨을 계산하여 기록
- **분석 대상**: `managed_tickers` 테이블의 활성 티커
- **데이터 소스**: `us_stock_candles` 테이블의 일봉 데이터 (최근 1년)

## 시그널 레벨

| Level | 키워드 | 설명 |
|-------|--------|------|
| 1 | 매우 위험 | 하락 추세, 신규 진입 위험 |
| 2 | 주의 | 과열 상태 또는 하락 중 반등 시도 |
| 3 | 관망 | 특별한 신호 없음, 보유자는 홀딩 |
| 4 | 매수 | 상승 추세 중 적정 진입 구간 |
| 5 | 적극 매수 | 상승 추세 속 확실한 저점 매수 기회 |

## 분석 지표

### 1. 추세 분석 (Trend)
- MA20 > MA60: 상승 추세 (`pass`)
- MA20 < MA60: 하락 추세 (`fail`)

### 2. 풀백 분석 (Pullback)
- 2주 고점 대비 현재가 하락률 계산
- 15% ~ 30%: 적정 조정 (`pass`)
- < 15%: 조정 부족 (`warning`)
- > 30%: 과도한 하락 (`fail`)

### 3. 거래량 분석 (Volume)
- 5일 평균 거래량 / 20일 평균 거래량
- < 1.0: 매도세 감소 (`pass`)
- >= 1.0: 매도세 활발 (`fail`)

### 4. 기간 분석 (Duration)
- 2주 고점 이후 경과일
- 2 ~ 10일: 적정 (`pass`)
- 그 외: 부적합 (`fail`)

### 5. 횡보 분석 (Consolidation)
- 최근 5일 고가-저가 범위
- <= 4%: 횡보 중 (`pass`)
- > 4%: 불안정 (`fail`)

### 6. RSI 분석
- <= 30: 과매도 (`OVERSOLD`)
- >= 70: 과매수 (`OVERBOUGHT`)
- 31 ~ 69: 중립 (`NEUTRAL`)

### 7. MACD 분석
- Histogram > 0 (이전보다 증가): 상승 모멘텀
- Histogram 부호 전환: 추세 변곡점

### 8. 볼린저 밴드 분석
- 상단 터치: 과열 (천장권)
- 하단 터치: 바닥권 (반등 가능)
- 중간 이하: 저평가 구간

## API 엔드포인트

### 시그널 분석 실행

| 메서드 | 엔드포인트 | 설명 |
|--------|------------|------|
| POST | `/api/signals/analyze` | 시그널 분석만 수동 실행 (수집 없이) |
| POST | `/api/signals/init` | ticker_signals 테이블 생성 |
| POST | `/api/scheduler` | 데이터 수집 + 분석 (전체) |

```bash
# 시그널 분석만 실행
curl -X POST http://localhost:5173/api/signals/analyze

# 응답 예시
{
  "success": true,
  "analyzed": 10,
  "failed": 0,
  "strongBuySignals": ["AAPL(Lv5)", "NVDA(Lv4)"]
}

# 중복 실행 시 (409 Conflict)
{
  "success": false,
  "message": "이미 분석이 진행 중입니다.",
  "skipped": true
}
```

### 시그널 조회 (Repository 함수)

```typescript
import {
  getLatestSignal,
  getSignalsByLevel,
  getSignalsByDate,
  getSignalHistory
} from '$lib/server/repositories/signal.repository';

// 특정 종목의 최신 시그널
const signal = await getLatestSignal('AAPL');

// 매수 시그널(Lv4+) 종목 조회
const buySignals = await getSignalsByLevel(4);

// 특정 날짜의 전체 시그널
const todaySignals = await getSignalsByDate(new Date());

// 종목의 시그널 히스토리 (최근 30일)
const history = await getSignalHistory('AAPL', 30);
```

## 데이터베이스 스키마

### `ticker_signals` 테이블

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | SERIAL | PK |
| `symbol` | VARCHAR(20) | 종목 코드 |
| `signal_date` | DATE | 분석 날짜 |
| `signal_level` | INTEGER | 시그널 레벨 (1-5) |
| `signal_keyword` | VARCHAR(50) | "적극 매수", "관망" 등 |
| `signal_message` | TEXT | 상세 설명 메시지 |
| `trend` | VARCHAR(10) | "UP" / "DOWN" |
| `trend_status` | VARCHAR(10) | "pass" / "fail" |
| `rsi` | NUMERIC(6,2) | RSI 값 |
| `rsi_status` | VARCHAR(20) | "OVERSOLD" / "OVERBOUGHT" / "NEUTRAL" |
| `pullback_rate` | NUMERIC(6,2) | 풀백 비율 (%) |
| `pullback_status` | VARCHAR(10) | "pass" / "warning" / "fail" |
| `volume_ratio` | NUMERIC(8,4) | 거래량 비율 |
| `volume_status` | VARCHAR(10) | "pass" / "fail" |
| `consolidation_rate` | NUMERIC(6,2) | 횡보 비율 (%) |
| `consolidation_status` | VARCHAR(10) | "pass" / "fail" |
| `score` | INTEGER | 총점 (0-5) |
| `current_price` | NUMERIC(18,4) | 현재가 |
| `ma20` | NUMERIC(18,4) | 20일 이동평균 |
| `ma60` | NUMERIC(18,4) | 60일 이동평균 |
| `high_2w` | NUMERIC(18,4) | 2주 고점 |
| `high_52w` | NUMERIC(18,4) | 52주 고점 |
| `created_at` | TIMESTAMPTZ | 생성 시간 |

**제약조건 & 인덱스:**
- `CONSTRAINT uq_ticker_signals UNIQUE(symbol, signal_date)`
- `INDEX idx_ticker_signals_symbol ON ticker_signals(symbol)`
- `INDEX idx_ticker_signals_date ON ticker_signals(signal_date DESC)`
- `INDEX idx_ticker_signals_level ON ticker_signals(signal_level)`

### 테이블 생성 SQL

```sql
CREATE TABLE IF NOT EXISTS ticker_signals (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  signal_date DATE NOT NULL,
  signal_level INTEGER NOT NULL,
  signal_keyword VARCHAR(50) NOT NULL,
  signal_message TEXT,
  trend VARCHAR(10) NOT NULL,
  trend_status VARCHAR(10) NOT NULL,
  rsi NUMERIC(6,2) NOT NULL,
  rsi_status VARCHAR(20) NOT NULL,
  pullback_rate NUMERIC(6,2) NOT NULL,
  pullback_status VARCHAR(10) NOT NULL,
  volume_ratio NUMERIC(8,4) NOT NULL,
  volume_status VARCHAR(10) NOT NULL,
  consolidation_rate NUMERIC(6,2) NOT NULL,
  consolidation_status VARCHAR(10) NOT NULL,
  score INTEGER NOT NULL,
  current_price NUMERIC(18,4) NOT NULL,
  ma20 NUMERIC(18,4),
  ma60 NUMERIC(18,4),
  high_2w NUMERIC(18,4) NOT NULL,
  high_52w NUMERIC(18,4) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_ticker_signals UNIQUE(symbol, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_ticker_signals_symbol ON ticker_signals(symbol);
CREATE INDEX IF NOT EXISTS idx_ticker_signals_date ON ticker_signals(signal_date DESC);
CREATE INDEX IF NOT EXISTS idx_ticker_signals_level ON ticker_signals(signal_level);
```

## 파일 구조

```
stock-dashboard/src/lib/server/
├── analysis/
│   ├── index.ts                    # exports
│   └── signal-analyzer.ts          # 시그널 분석 로직
├── repositories/
│   └── signal.repository.ts        # DB CRUD
└── scheduler.ts                    # 스케줄러 (분석 연동)

stock-dashboard/src/routes/
├── +page.svelte                    # 대시보드 (실행 버튼)
└── api/
    └── signals/
        ├── analyze/+server.ts      # POST /api/signals/analyze
        └── init/+server.ts         # POST /api/signals/init
```

## 스케줄러 동작

1. **자동 실행**: 매일 08:00 KST
2. **수동 실행**: 대시보드 버튼 또는 API 호출
3. **동작 순서**:
   - 활성 티커의 일봉 데이터 수집 (KIS API)
   - 각 티커별 시그널 분석
   - `ticker_signals` 테이블에 저장
   - Discord 알림 발송 (매수 시그널 포함)

4. **중복 실행 방지**: `isAnalyzing` 플래그로 동시 요청 차단

## Discord 알림

분석 완료 시 Discord 웹훅으로 알림 발송:

```
📊 [Scheduler] 시그널 분석 완료: 10개 분석, 0개 실패
🔥 매수 시그널: AAPL(Lv5), NVDA(Lv4)
```

## 대시보드 UI

메인 페이지(`/`)에서 실행 버튼 제공:

| 버튼 | 기능 |
|------|------|
| 📊 시그널 분석 실행 | 기존 데이터로 분석만 실행 |
| 🔄 데이터 수집 + 분석 | KIS API 수집 후 분석 |

- 실행 중: 버튼 비활성화 + 스피너
- 완료 시: 분석 결과 및 매수 시그널 표시
