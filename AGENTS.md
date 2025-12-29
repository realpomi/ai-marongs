# AI Agent 개발 가이드

이 문서는 AI Agent가 ai-marongs 프로젝트를 개발할 때 참고해야 할 핵심 정보의 인덱스입니다.

## 프로젝트 개요

Python 기반의 Discord Bot과 메시지 처리 시스템으로, NATS 메시지 브로커를 통해 마이크로서비스 아키텍처를 구현합니다.

## 상세 문서

각 기능별 상세 내용은 아래 문서를 참고하세요.

| 문서 | 경로 | 내용 |
|------|------|------|
| 아키텍처 | [docs/agent/architecture.md](docs/agent/architecture.md) | 시스템 구조, 메시지 흐름, 주요 코드 위치, 파일 구조 |
| NATS 메시지 | [docs/agent/nats-messages.md](docs/agent/nats-messages.md) | NATS 토픽, 메시지 포맷 규격 |
| 개발 가이드 | [docs/agent/development.md](docs/agent/development.md) | 개발 주의사항, 코딩 컨벤션, 커밋 규칙, 테스트 환경 |
| 배포 가이드 | [docs/agent/deployment.md](docs/agent/deployment.md) | CI/CD, 환경 변수, 수동 배포 방법 |
| Stock Dashboard | [docs/agent/stock-dashboard.md](docs/agent/stock-dashboard.md) | SvelteKit 5 기반 대시보드 UI 작업 가이드 |

## 빠른 참고

### 서비스 구성

| 서비스 | 디렉토리 | 역할 |
|--------|----------|------|
| Discord Bot | `discord-bot/` | Discord API 인터페이스 |
| Message Processor | `message-processor/` | 비즈니스 로직 처리 |
| Stock Dashboard | `stock-dashboard/` | 주식 대시보드 웹 UI |

### 주요 기술 스택

- **Discord Bot**: Python 3.11, discord.py, nats-py
- **Message Processor**: Python 3.11, nats-py
- **Stock Dashboard**: SvelteKit 5, TailwindCSS
- **인프라**: Docker, NATS, GitHub Actions

### 커밋 메시지 타입

- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 포맷팅
- `refactor`: 코드 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드 프로세스 또는 도구 변경

---

## 서브에이전트 정의

Claude Code에서 Task 도구를 통해 호출할 수 있는 서브에이전트 정의입니다.

### kis-api-client

**용도**: KIS API 클라이언트 핵심 모듈 구현

**작업 범위**:
- `stock-dashboard/src/lib/server/kis/types.ts` - 타입 정의
- `stock-dashboard/src/lib/server/kis/rate-limiter.ts` - API 호출 제한
- `stock-dashboard/src/lib/server/kis/token-manager.ts` - OAuth2 토큰 관리
- `stock-dashboard/src/lib/server/kis/client.ts` - KIS API 클라이언트
- `stock-dashboard/src/lib/server/kis/index.ts` - exports

**참조 문서**: [docs/KIS_API_MIGRATION.md](docs/KIS_API_MIGRATION.md) Phase 1

**참조 코드**: [stock-crawler/common/kis_api.py](stock-crawler/common/kis_api.py) (포팅 대상)

---

### kis-repository

**용도**: KIS 데이터 저장소 및 API 라우트 구현

**작업 범위**:
- `stock-dashboard/src/lib/server/repositories/candle.repository.ts` - 캔들 데이터 DB 저장/조회
- `stock-dashboard/src/routes/api/kis/token/+server.ts` - 토큰 관리 API
- `stock-dashboard/src/routes/api/kis/price/[symbol]/+server.ts` - 현재가 API
- `stock-dashboard/src/routes/api/kis/candles/[symbol]/+server.ts` - 캔들 API
- `stock-dashboard/src/routes/api/kis/collect/+server.ts` - 수집 API

**참조 문서**: [docs/KIS_API_MIGRATION.md](docs/KIS_API_MIGRATION.md) Phase 2-3

**참조 코드**: [stock-crawler/common/db.py](stock-crawler/common/db.py) (포팅 대상)

---

### kis-dashboard-integration

**용도**: 대시보드 UI 연동 및 환경 설정

**작업 범위**:
- `stock-dashboard/.env` - KIS 환경변수 추가
- `stock-dashboard/src/app.d.ts` - 환경변수 타입 선언
- `stock-dashboard/src/routes/ticker/[symbol]/+page.svelte` - 새로고침 버튼 추가

**참조 문서**: [docs/KIS_API_MIGRATION.md](docs/KIS_API_MIGRATION.md) Phase 4-6

---

## KIS API 엔드포인트

`stock-dashboard`에서 제공하는 KIS API 엔드포인트입니다.

### 토큰 관리

| 메서드 | 엔드포인트 | 설명 |
|--------|------------|------|
| GET | `/api/kis/token` | 토큰 상태 조회 |
| POST | `/api/kis/token` | 토큰 강제 갱신 |

```bash
# 토큰 상태 확인
curl http://localhost:5173/api/kis/token
# {"valid":true,"expiresAt":"2024-12-27 10:30:00","remainingMinutes":1420}

# 토큰 강제 갱신
curl -X POST http://localhost:5173/api/kis/token
```

### 현재가 조회

| 메서드 | 엔드포인트 | 쿼리 파라미터 |
|--------|------------|---------------|
| GET | `/api/kis/price/[symbol]` | `market` (us/kr), `exchange` (NAS/NYS/AMS) |

```bash
# 미국 주식 현재가
curl "http://localhost:5173/api/kis/price/AAPL?market=us&exchange=NAS"

# 국내 주식 현재가
curl "http://localhost:5173/api/kis/price/005930?market=kr"
```

### 캔들 조회

| 메서드 | 엔드포인트 | 쿼리 파라미터 |
|--------|------------|---------------|
| GET | `/api/kis/candles/[symbol]` | `market`, `exchange`, `interval` (60m/daily), `count`, `save` (true/false), `yearly` (true/false) |

```bash
# 60분봉 조회
curl "http://localhost:5173/api/kis/candles/AAPL?interval=60m&count=30"

# 일봉 조회 + DB 저장
curl "http://localhost:5173/api/kis/candles/AAPL?interval=daily&count=30&save=true"

# 1년치 일봉 조회
curl "http://localhost:5173/api/kis/candles/AAPL?interval=daily&yearly=true&save=true"
```

### 데이터 수집

| 메서드 | 엔드포인트 | 쿼리/바디 파라미터 |
|--------|------------|-------------------|
| POST | `/api/kis/collect` | `interval` (60m/daily/all), `symbols` (배열) |

```bash
# 전체 활성 티커 수집
curl -X POST "http://localhost:5173/api/kis/collect?interval=all"

# 60분봉만 수집
curl -X POST "http://localhost:5173/api/kis/collect?interval=60m"

# 특정 티커만 수집
curl -X POST "http://localhost:5173/api/kis/collect" \
  -H "Content-Type: application/json" \
  -d '{"symbols":["AAPL","NVDA"],"interval":"daily"}'
```

### 스케줄러 (자동 일봉 수집)

| 메서드 | 엔드포인트 | 설명 |
|--------|------------|------|
| GET | `/api/scheduler` | 스케줄러 상태 조회 |
| POST | `/api/scheduler` | 수동 실행 (즉시 수집) |

```bash
# 스케줄러 상태 확인
curl http://localhost:5173/api/scheduler

# 수동으로 즉시 실행
curl -X POST http://localhost:5173/api/scheduler
```

**스케줄러 설정:**
- 실행 시간: 매일 06:00 KST (21:00 UTC)
- 수집 대상: `managed_tickers` 테이블의 `is_active = true` 티커
- Rate limit: 500ms 간격으로 순차 수집 (KIS API 분당 호출 한도 준수)
- 자동 시작: 서버 시작 시 `hooks.server.ts`에서 자동 초기화

### 응답 예시

```json
// GET /api/kis/token
{"valid": true, "expiresAt": "2024-12-27 10:30:00", "remainingMinutes": 1420}

// GET /api/kis/price/AAPL
{"symbol": "AAPL", "market": "us", "price": {"last": "250.50", "diff": "+2.30", "rate": "0.93"}}

// GET /api/kis/candles/AAPL?interval=daily&save=true
{"symbol": "AAPL", "interval": "daily", "count": 30, "saved": 30, "candles": [...]}

// POST /api/kis/collect
{"success": true, "totalTickers": 5, "totalSaved": 300, "errors": 0, "results": [...]}

// GET /api/scheduler
{"isRunning": true, "lastRun": "2024-12-27T21:00:00.000Z", "nextRun": "2024-12-28T21:00:00.000Z", "isCollecting": false, "lastResult": {"success": true, "totalTickers": 5, "totalSaved": 150, "errors": 0, "duration": 3200}}

// POST /api/scheduler
{"success": true, "totalTickers": 5, "totalSaved": 150, "errors": 0, "results": [...]}
```

---

## 데이터베이스 스키마

PostgreSQL 기반의 데이터베이스 구조입니다.

### 연결 설정

```typescript
// stock-dashboard/src/lib/server/db.ts
{
  host: DB_HOST || 'localhost',
  port: DB_PORT || 5432,
  database: DB_NAME || 'stocks',
  user: DB_USER || 'stocks',
  password: DB_PASSWORD
}
```

### 테이블 정의

#### `us_stock_candles` - 미국 주식 캔들 데이터

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | SERIAL | PRIMARY KEY | 자동 증가 ID |
| `symbol` | TEXT | NOT NULL | 종목 코드 (예: AAPL) |
| `interval` | TEXT | NOT NULL | 주기 ('60m', 'daily') |
| `candle_time` | TIMESTAMPTZ | NOT NULL | 캔들 시간 |
| `open_price` | NUMERIC(18,4) | NOT NULL | 시가 |
| `high_price` | NUMERIC(18,4) | NOT NULL | 고가 |
| `low_price` | NUMERIC(18,4) | NOT NULL | 저가 |
| `close_price` | NUMERIC(18,4) | NOT NULL | 종가 |
| `volume` | BIGINT | NOT NULL | 거래량 |
| `source` | TEXT | NOT NULL DEFAULT 'kis' | 데이터 소스 ('kis', 'yf') |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 생성 시간 |

**제약조건 & 인덱스:**
- `CONSTRAINT uq_us_stock_candles UNIQUE(symbol, interval, candle_time, source)`
- `INDEX idx_us_stock_candles_lookup ON us_stock_candles(symbol, interval, candle_time DESC)`
- `INDEX idx_us_stock_candles_source ON us_stock_candles(source)`

#### `managed_tickers` - 관리 대상 티커

| 컬럼 | 타입 | 제약조건 | 설명 |
|------|------|----------|------|
| `id` | SERIAL | PRIMARY KEY | 자동 증가 ID |
| `symbol` | VARCHAR(20) | NOT NULL, UNIQUE | 종목 코드 |
| `name` | VARCHAR(100) | - | 종목명 |
| `exchange` | VARCHAR(10) | NOT NULL DEFAULT 'NAS' | 거래소 (NAS/NYS/AMS) |
| `is_active` | BOOLEAN | NOT NULL DEFAULT TRUE | 활성 상태 |
| `created_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 생성 시간 |
| `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT NOW() | 수정 시간 |
| `last_collected_at` | TIMESTAMPTZ | - | 마지막 수집 시간 |

**제약조건 & 인덱스:**
- `CONSTRAINT uq_managed_tickers_symbol UNIQUE(symbol)`
- `INDEX idx_managed_tickers_active ON managed_tickers(is_active) WHERE is_active = TRUE`

### 타입 정의 (TypeScript)

```typescript
// stock-dashboard/src/lib/server/kis/types.ts

// DB 저장용 캔들 레코드
interface CandleRecord {
  symbol: string;
  interval: '60m' | 'daily';
  candle_time: Date;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
  source: string;
}

// 거래소 및 시장 타입
type Exchange = 'NAS' | 'NYS' | 'AMS';
type Market = 'us' | 'kr';
type CandleInterval = '60m' | 'daily';
```

### Repository 모듈

| 파일 | 용도 |
|------|------|
| `stock-dashboard/src/lib/server/db.ts` | PostgreSQL 연결 설정 |
| `stock-dashboard/src/lib/server/repositories/candle.repository.ts` | 캔들 데이터 CRUD |
| `stock-crawler/common/db.py` | Python 커넥션 풀 관리 |
| `stock-crawler/common/ticker_repository.py` | 티커 CRUD (Python) |

---

### 서브에이전트 호출 예시

```
Phase 1 작업:
- subagent_type: "kis-data-pipeline" 또는 "general-purpose"
- prompt: "docs/KIS_API_MIGRATION.md Phase 1을 참조하여 KIS 클라이언트를 구현해주세요"

Phase 2-3 작업:
- subagent_type: "kis-data-pipeline" 또는 "general-purpose"
- prompt: "docs/KIS_API_MIGRATION.md Phase 2-3을 참조하여 Repository와 API Routes를 구현해주세요"

Phase 4-6 작업:
- subagent_type: "general-purpose"
- prompt: "docs/KIS_API_MIGRATION.md Phase 4-6을 참조하여 환경설정과 UI 연동을 구현해주세요"
```
