# KIS API 마이그레이션 가이드

## 개요

Python `stock-crawler`의 한국투자증권(KIS) API 로직을 SvelteKit `stock-dashboard`로 이전하여 단일 Node.js 스택으로 통합합니다.

### 변경 전/후 아키텍처

```
[변경 전]
Discord Bot → message-processor
                                    stock-crawler (Python) → PostgreSQL
stock-dashboard (SvelteKit) ─────────────────────────────────────┘

[변경 후]
Discord Bot → message-processor ──HTTP──┐
                                        ▼
                              stock-dashboard (SvelteKit) → PostgreSQL
                                 ├─ /api/kis/* (API 엔드포인트)
                                 └─ 대시보드 UI

※ stock-crawler는 폐기
```

---

## Phase 1: KIS 클라이언트 구현

### 1.1 타입 정의

**파일**: `stock-dashboard/src/lib/server/kis/types.ts`

```typescript
// KIS API 설정
export interface KisConfig {
  baseUrl: string;
  appKey: string;
  appSecret: string;
}

// 토큰 데이터
export interface TokenData {
  access_token: string;
  expires_at: string; // "YYYY-MM-DD HH:mm:ss" 형식
}

// KIS API 공통 응답
export interface KisApiResponse<T> {
  rt_cd: string;      // "0" = 성공
  msg_cd: string;
  msg1: string;
  output?: T;
  output2?: T[];
}

// 미국 주식 캔들 (API 응답)
export interface UsStockCandleRaw {
  xymd: string;       // 날짜: YYYYMMDD
  xhms: string;       // 시간: HHMMSS
  open: string;       // 시가
  high: string;       // 고가
  low: string;        // 저가
  clos: string;       // 종가
  tvol: string;       // 거래량
}

// 미국 주식 현재가 (API 응답)
export interface UsStockPriceRaw {
  last: string;       // 현재가
  diff: string;       // 전일대비
  rate: string;       // 등락률
  tvol: string;       // 거래량
  // ... 기타 필드
}

// 국내 주식 캔들 (API 응답)
export interface KrStockCandleRaw {
  stck_bsop_date: string;   // 날짜
  stck_cntg_hour: string;   // 시간
  stck_prpr: string;        // 현재가
  stck_oprc: string;        // 시가
  stck_hgpr: string;        // 고가
  stck_lwpr: string;        // 저가
  cntg_vol: string;         // 거래량
}

// DB 저장용 캔들 레코드
export interface CandleRecord {
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

// 거래소 타입
export type Exchange = 'NAS' | 'NYS' | 'AMS';
export type Market = 'us' | 'kr';
export type CandleInterval = '60m' | 'daily';
```

### 1.2 Rate Limiter

**파일**: `stock-dashboard/src/lib/server/kis/rate-limiter.ts`

```typescript
/**
 * KIS API 호출 간격 제한 (500ms)
 */
class RateLimiter {
  private lastRequestTime = 0;
  private readonly minDelay: number;

  constructor(delayMs: number = 500) {
    this.minDelay = delayMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minDelay) {
      await this.sleep(this.minDelay - elapsed);
    }

    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 싱글톤 인스턴스
export const rateLimiter = new RateLimiter(500);
```

### 1.3 Token Manager

**파일**: `stock-dashboard/src/lib/server/kis/token-manager.ts`

```typescript
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { TokenData } from './types';
import { KIS_BASE_URL, KIS_APP_KEY, KIS_APP_SECRET } from '$env/static/private';

const TOKEN_FILE = '.access_token.json';

class KisTokenManager {
  private tokenPath: string;
  private cachedToken: TokenData | null = null;

  constructor() {
    this.tokenPath = path.join(process.cwd(), TOKEN_FILE);
  }

  /**
   * 유효한 토큰을 반환합니다. 필요시 자동 갱신합니다.
   */
  async getToken(): Promise<string> {
    // 1. 메모리 캐시 확인
    if (this.cachedToken && this.isValid(this.cachedToken)) {
      return this.cachedToken.access_token;
    }

    // 2. 파일에서 로드
    const fileToken = await this.loadFromFile();
    if (fileToken && this.isValid(fileToken)) {
      this.cachedToken = fileToken;
      return fileToken.access_token;
    }

    // 3. 새 토큰 발급
    return this.refreshToken();
  }

  /**
   * 토큰을 강제로 갱신합니다.
   */
  async refreshToken(): Promise<string> {
    console.log('[KIS] 토큰 발급 요청...');

    const response = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET
      })
    });

    if (!response.ok) {
      throw new Error(`토큰 발급 실패: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const tokenData: TokenData = {
      access_token: data.access_token,
      expires_at: data.access_token_token_expired // KIS 형식: "YYYY-MM-DD HH:mm:ss"
    };

    await this.saveToFile(tokenData);
    this.cachedToken = tokenData;

    console.log(`[KIS] 토큰 발급 성공 (만료: ${tokenData.expires_at})`);
    return tokenData.access_token;
  }

  /**
   * 토큰 상태 정보를 반환합니다.
   */
  async getStatus(): Promise<{ valid: boolean; expiresAt: string | null; remainingMinutes: number | null }> {
    const token = await this.loadFromFile();
    if (!token) {
      return { valid: false, expiresAt: null, remainingMinutes: null };
    }

    const expiresAt = this.parseExpiresAt(token.expires_at);
    const now = new Date();
    const remainingMs = expiresAt.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / 60000);

    return {
      valid: remainingMs > 5 * 60 * 1000, // 5분 버퍼
      expiresAt: token.expires_at,
      remainingMinutes: remainingMinutes > 0 ? remainingMinutes : 0
    };
  }

  private isValid(token: TokenData): boolean {
    const expiresAt = this.parseExpiresAt(token.expires_at);
    const now = new Date();
    // 5분 버퍼
    return now.getTime() < expiresAt.getTime() - 5 * 60 * 1000;
  }

  private parseExpiresAt(expiresStr: string): Date {
    // KIS 형식: "YYYY-MM-DD HH:mm:ss"
    return new Date(expiresStr.replace(' ', 'T'));
  }

  private async loadFromFile(): Promise<TokenData | null> {
    if (!existsSync(this.tokenPath)) {
      return null;
    }

    try {
      const content = await readFile(this.tokenPath, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.warn('[KIS] 토큰 파일 파싱 실패:', e);
      return null;
    }
  }

  private async saveToFile(token: TokenData): Promise<void> {
    await writeFile(this.tokenPath, JSON.stringify(token, null, 2));
  }
}

// 싱글톤 인스턴스
export const tokenManager = new KisTokenManager();
```

### 1.4 KIS Client

**파일**: `stock-dashboard/src/lib/server/kis/client.ts`

```typescript
import { KIS_BASE_URL, KIS_APP_KEY, KIS_APP_SECRET } from '$env/static/private';
import { tokenManager } from './token-manager';
import { rateLimiter } from './rate-limiter';
import type { KisApiResponse, UsStockCandleRaw, UsStockPriceRaw, KrStockCandleRaw, Exchange } from './types';

class KisClient {
  private async getHeaders(trId: string): Promise<Record<string, string>> {
    const token = await tokenManager.getToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: trId,
      custtype: 'P'
    };
  }

  private async request<T>(url: string, trId: string, params: Record<string, string>): Promise<T | null> {
    await rateLimiter.waitIfNeeded();

    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${KIS_BASE_URL}${url}?${queryString}`;

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: await this.getHeaders(trId)
    });

    if (!response.ok) {
      console.error(`[KIS] API 호출 실패: ${response.status} ${await response.text()}`);
      return null;
    }

    const data: KisApiResponse<T> = await response.json();
    console.log(`[KIS] 응답: rt_cd=${data.rt_cd}, msg=${data.msg1}`);

    return data as T;
  }

  // =========================================================================
  // 미국 주식 API
  // =========================================================================

  /**
   * 미국 주식 60분봉 조회
   */
  async fetchUsStockCandles60m(symbol: string, exchange: Exchange = 'NAS', count: number = 10): Promise<UsStockCandleRaw[]> {
    console.log(`[KIS] ${symbol} 60분봉 조회...`);

    const data = await this.request<KisApiResponse<unknown>>(
      '/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice',
      'HHDFS76950200',
      {
        AUTH: '',
        EXCD: exchange,
        SYMB: symbol.toUpperCase(),
        NMIN: '60',
        PINC: '1',
        NEXT: '',
        NREC: String(count),
        FILL: '',
        KEYB: ''
      }
    );

    return (data?.output2 as UsStockCandleRaw[]) || [];
  }

  /**
   * 미국 주식 일봉 조회
   */
  async fetchUsStockCandlesDaily(symbol: string, exchange: Exchange = 'NAS', count: number = 30): Promise<UsStockCandleRaw[]> {
    console.log(`[KIS] ${symbol} 일봉 조회...`);

    const data = await this.request<KisApiResponse<unknown>>(
      '/uapi/overseas-price/v1/quotations/dailyprice',
      'HHDFS76240000',
      {
        AUTH: '',
        EXCD: exchange,
        SYMB: symbol.toUpperCase(),
        GUBN: '0',
        BYMD: '',
        MODP: '1'
      }
    );

    const candles = (data?.output2 as UsStockCandleRaw[]) || [];
    return candles.slice(0, count);
  }

  /**
   * 미국 주식 1년치 일봉 조회 (페이징)
   */
  async fetchUsStockCandlesDailyYear(symbol: string, exchange: Exchange = 'NAS', maxDays: number = 365): Promise<UsStockCandleRaw[]> {
    console.log(`[KIS] ${symbol} 1년치 일봉 조회 시작...`);

    const allCandles: UsStockCandleRaw[] = [];
    let bymd = '';
    const maxIterations = 10;

    for (let i = 0; i < maxIterations; i++) {
      const data = await this.request<KisApiResponse<unknown>>(
        '/uapi/overseas-price/v1/quotations/dailyprice',
        'HHDFS76240000',
        {
          AUTH: '',
          EXCD: exchange,
          SYMB: symbol.toUpperCase(),
          GUBN: '0',
          BYMD: bymd,
          MODP: '1'
        }
      );

      const candles = (data?.output2 as UsStockCandleRaw[]) || [];
      if (candles.length === 0) break;

      allCandles.push(...candles);
      console.log(`[KIS] ${i + 1}차 조회: ${candles.length}건 (누적: ${allCandles.length}건)`);

      if (allCandles.length >= maxDays) {
        return allCandles.slice(0, maxDays);
      }

      const lastDate = candles[candles.length - 1]?.xymd;
      if (!lastDate || lastDate === bymd) break;
      bymd = lastDate;
    }

    console.log(`[KIS] ${symbol} 1년치 일봉 조회 완료 (${allCandles.length}건)`);
    return allCandles;
  }

  /**
   * 미국 주식 현재가 조회
   */
  async fetchUsStockPrice(symbol: string, exchange: Exchange = 'NAS'): Promise<UsStockPriceRaw | null> {
    console.log(`[KIS] ${symbol} 현재가 조회...`);

    const data = await this.request<KisApiResponse<UsStockPriceRaw>>(
      '/uapi/overseas-price/v1/quotations/price',
      'HHDFS00000300',
      {
        AUTH: '',
        EXCD: exchange,
        SYMB: symbol.toUpperCase()
      }
    );

    return data?.output || null;
  }

  // =========================================================================
  // 국내 주식 API
  // =========================================================================

  /**
   * 국내 주식 1시간봉 조회
   */
  async fetchKrStockCandlesHourly(symbol: string): Promise<KrStockCandleRaw[]> {
    console.log(`[KIS] ${symbol} 국내 1시간봉 조회...`);

    const data = await this.request<KisApiResponse<unknown>>(
      '/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice',
      'FHKST03010200',
      {
        fid_cond_mrkt_div_code: 'J',
        fid_input_iscd: symbol,
        fid_input_hour_8: '1',
        fid_pw_data_incu_yn: 'N',
        fid_uplc_diff_yn: 'N',
        fid_period_div_code: 'H'
      }
    );

    return (data?.output2 as KrStockCandleRaw[]) || [];
  }

  /**
   * 국내 주식 현재가 조회
   */
  async fetchKrStockPrice(symbol: string): Promise<Record<string, string> | null> {
    console.log(`[KIS] ${symbol} 국내 현재가 조회...`);

    const data = await this.request<KisApiResponse<Record<string, string>>>(
      '/uapi/domestic-stock/v1/quotations/inquire-price',
      'FHKST01010100',
      {
        fid_cond_mrkt_div_code: 'J',
        fid_input_iscd: symbol
      }
    );

    return data?.output || null;
  }
}

// 싱글톤 인스턴스
export const kisClient = new KisClient();
```

### 1.5 Index Export

**파일**: `stock-dashboard/src/lib/server/kis/index.ts`

```typescript
export { kisClient } from './client';
export { tokenManager } from './token-manager';
export { rateLimiter } from './rate-limiter';
export * from './types';
```

---

## Phase 2: Repository 구현

### 2.1 Candle Repository

**파일**: `stock-dashboard/src/lib/server/repositories/candle.repository.ts`

```typescript
import sql from '$lib/server/db';
import type { CandleRecord, UsStockCandleRaw } from '$lib/server/kis/types';

/**
 * 미국 주식 캔들 데이터를 DB에 저장합니다 (Upsert)
 */
export async function saveUsStockCandles(
  symbol: string,
  interval: '60m' | 'daily',
  candles: UsStockCandleRaw[],
  source: string = 'kis'
): Promise<number> {
  if (candles.length === 0) return 0;

  const records: CandleRecord[] = [];

  for (const item of candles) {
    try {
      const dateStr = item.xymd || '';
      const timeStr = item.xhms || '000000';
      if (!dateStr) continue;

      // YYYYMMDD HHMMSS → Date
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const hour = timeStr.slice(0, 2);
      const min = timeStr.slice(2, 4);
      const sec = timeStr.slice(4, 6);

      const candle_time = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);

      records.push({
        symbol,
        interval,
        candle_time,
        open_price: parseFloat(item.open) || 0,
        high_price: parseFloat(item.high) || 0,
        low_price: parseFloat(item.low) || 0,
        close_price: parseFloat(item.clos) || 0,
        volume: parseInt(item.tvol) || 0,
        source
      });
    } catch (e) {
      console.warn(`[DB] 캔들 파싱 실패:`, e);
    }
  }

  if (records.length === 0) return 0;

  // Upsert 쿼리
  for (const r of records) {
    await sql`
      INSERT INTO us_stock_candles (symbol, interval, candle_time, open_price, high_price, low_price, close_price, volume, source)
      VALUES (${r.symbol}, ${r.interval}, ${r.candle_time}, ${r.open_price}, ${r.high_price}, ${r.low_price}, ${r.close_price}, ${r.volume}, ${r.source})
      ON CONFLICT ON CONSTRAINT uq_us_stock_candles DO UPDATE SET
        open_price = EXCLUDED.open_price,
        high_price = EXCLUDED.high_price,
        low_price = EXCLUDED.low_price,
        close_price = EXCLUDED.close_price,
        volume = EXCLUDED.volume
    `;
  }

  console.log(`[DB] ${symbol}: ${records.length}건 ${interval} 데이터 저장 (source=${source})`);
  return records.length;
}

/**
 * 최신 캔들 데이터를 조회합니다
 */
export async function getLatestCandles(
  symbol: string,
  interval: '60m' | 'daily',
  source: string = 'kis',
  limit: number = 30
) {
  return sql`
    SELECT * FROM us_stock_candles
    WHERE symbol = ${symbol}
      AND interval = ${interval}
      AND source = ${source}
    ORDER BY candle_time DESC
    LIMIT ${limit}
  `;
}

/**
 * 티커의 마지막 수집 시간을 업데이트합니다
 */
export async function updateTickerLastCollected(symbol: string): Promise<void> {
  await sql`
    UPDATE managed_tickers
    SET last_collected_at = NOW(), updated_at = NOW()
    WHERE symbol = ${symbol}
  `;
}
```

---

## Phase 3: API Routes 구현

### 3.1 토큰 관리 API

**파일**: `stock-dashboard/src/routes/api/kis/token/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { tokenManager } from '$lib/server/kis';

// GET: 토큰 상태 조회
export const GET: RequestHandler = async () => {
  try {
    const status = await tokenManager.getStatus();
    return json(status);
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};

// POST: 토큰 강제 갱신
export const POST: RequestHandler = async () => {
  try {
    await tokenManager.refreshToken();
    const status = await tokenManager.getStatus();
    return json({ success: true, ...status });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
```

### 3.2 현재가 API

**파일**: `stock-dashboard/src/routes/api/kis/price/[symbol]/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kisClient } from '$lib/server/kis';
import type { Exchange, Market } from '$lib/server/kis/types';

export const GET: RequestHandler = async ({ params, url }) => {
  const { symbol } = params;
  const market = (url.searchParams.get('market') || 'us') as Market;
  const exchange = (url.searchParams.get('exchange') || 'NAS') as Exchange;

  try {
    let price;

    if (market === 'us') {
      price = await kisClient.fetchUsStockPrice(symbol, exchange);
    } else {
      price = await kisClient.fetchKrStockPrice(symbol);
    }

    if (!price) {
      return json({ error: '현재가 조회 실패' }, { status: 404 });
    }

    return json({ symbol, market, price });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
```

### 3.3 캔들 API

**파일**: `stock-dashboard/src/routes/api/kis/candles/[symbol]/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kisClient } from '$lib/server/kis';
import { saveUsStockCandles, updateTickerLastCollected } from '$lib/server/repositories/candle.repository';
import type { Exchange, Market, CandleInterval } from '$lib/server/kis/types';

export const GET: RequestHandler = async ({ params, url }) => {
  const { symbol } = params;
  const market = (url.searchParams.get('market') || 'us') as Market;
  const exchange = (url.searchParams.get('exchange') || 'NAS') as Exchange;
  const interval = (url.searchParams.get('interval') || '60m') as CandleInterval;
  const count = parseInt(url.searchParams.get('count') || '30');
  const save = url.searchParams.get('save') === 'true';
  const yearly = url.searchParams.get('yearly') === 'true';

  try {
    let candles;

    if (market === 'us') {
      if (yearly && interval === 'daily') {
        candles = await kisClient.fetchUsStockCandlesDailyYear(symbol, exchange, 365);
      } else if (interval === 'daily') {
        candles = await kisClient.fetchUsStockCandlesDaily(symbol, exchange, count);
      } else {
        candles = await kisClient.fetchUsStockCandles60m(symbol, exchange, count);
      }
    } else {
      candles = await kisClient.fetchKrStockCandlesHourly(symbol);
    }

    // DB 저장 옵션
    if (save && candles.length > 0 && market === 'us') {
      const saved = await saveUsStockCandles(symbol, interval, candles, 'kis');
      await updateTickerLastCollected(symbol);
      return json({ symbol, interval, count: candles.length, saved, candles });
    }

    return json({ symbol, interval, count: candles.length, candles });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
```

### 3.4 수집 API

**파일**: `stock-dashboard/src/routes/api/kis/collect/+server.ts`

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import sql from '$lib/server/db';
import { kisClient } from '$lib/server/kis';
import { saveUsStockCandles, updateTickerLastCollected } from '$lib/server/repositories/candle.repository';
import type { CandleInterval, Exchange } from '$lib/server/kis/types';

interface CollectResult {
  symbol: string;
  interval: string;
  saved: number;
  error?: string;
}

export const POST: RequestHandler = async ({ request, url }) => {
  // URL 쿼리 파라미터 또는 body에서 옵션 가져오기
  const intervalParam = url.searchParams.get('interval');
  let symbols: string[] | undefined;
  let interval: CandleInterval | 'all' = 'all';

  // body가 있으면 파싱
  try {
    const body = await request.json();
    symbols = body.symbols;
    interval = body.interval || intervalParam || 'all';
  } catch {
    interval = (intervalParam as CandleInterval | 'all') || 'all';
  }

  try {
    // 심볼이 지정되지 않으면 활성 티커 전체 조회
    let tickers: { symbol: string; exchange: string }[];

    if (symbols && symbols.length > 0) {
      tickers = await sql`
        SELECT symbol, exchange FROM managed_tickers
        WHERE symbol = ANY(${symbols}) AND is_active = true
      `;
    } else {
      tickers = await sql`
        SELECT symbol, exchange FROM managed_tickers
        WHERE is_active = true
      `;
    }

    const results: CollectResult[] = [];

    for (const ticker of tickers) {
      const exchange = (ticker.exchange || 'NAS') as Exchange;

      try {
        // 60분봉 수집
        if (interval === 'all' || interval === '60m') {
          const candles60m = await kisClient.fetchUsStockCandles60m(ticker.symbol, exchange, 30);
          const saved60m = await saveUsStockCandles(ticker.symbol, '60m', candles60m, 'kis');
          results.push({ symbol: ticker.symbol, interval: '60m', saved: saved60m });
        }

        // 일봉 수집
        if (interval === 'all' || interval === 'daily') {
          const candlesDaily = await kisClient.fetchUsStockCandlesDaily(ticker.symbol, exchange, 30);
          const savedDaily = await saveUsStockCandles(ticker.symbol, 'daily', candlesDaily, 'kis');
          results.push({ symbol: ticker.symbol, interval: 'daily', saved: savedDaily });
        }

        await updateTickerLastCollected(ticker.symbol);
      } catch (e) {
        results.push({ symbol: ticker.symbol, interval, saved: 0, error: String(e) });
      }
    }

    const totalSaved = results.reduce((sum, r) => sum + r.saved, 0);
    const errors = results.filter((r) => r.error);

    return json({
      success: true,
      totalTickers: tickers.length,
      totalSaved,
      errors: errors.length,
      results
    });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
```

---

## Phase 4: 환경 변수 설정

### 4.1 .env 파일 업데이트

**파일**: `stock-dashboard/.env`

```env
# 기존 DB 설정
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stocks
DB_USER=stocks
DB_PASSWORD=your_password

# KIS API 설정 (추가)
KIS_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_APP_KEY=your_app_key
KIS_APP_SECRET=your_app_secret
```

### 4.2 환경 변수 타입 선언

**파일**: `stock-dashboard/src/app.d.ts` (업데이트)

```typescript
declare global {
  namespace App {
    // ... 기존 코드
  }
}

declare module '$env/static/private' {
  export const DB_HOST: string;
  export const DB_PORT: string;
  export const DB_NAME: string;
  export const DB_USER: string;
  export const DB_PASSWORD: string;
  export const KIS_BASE_URL: string;
  export const KIS_APP_KEY: string;
  export const KIS_APP_SECRET: string;
}

export {};
```

---

## Phase 5: External Cron 설정

### 5.1 시스템 Cron 설정

```bash
# crontab -e 로 편집

# 60분봉: 매시 정각
0 * * * * curl -X POST http://localhost:5173/api/kis/collect?interval=60m

# 일봉: 매일 07:00 (한국시간)
0 7 * * * curl -X POST http://localhost:5173/api/kis/collect?interval=daily
```

### 5.2 GitHub Actions 설정 (대안)

**파일**: `.github/workflows/stock-collect.yml`

```yaml
name: Stock Data Collection

on:
  schedule:
    # 60분봉: 매시 정각 (UTC)
    - cron: '0 * * * *'
    # 일봉: 매일 22:00 UTC (한국시간 07:00)
    - cron: '0 22 * * *'
  workflow_dispatch:
    inputs:
      interval:
        description: 'Collection interval'
        required: true
        default: 'all'
        type: choice
        options:
          - all
          - 60m
          - daily

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger collection
        run: |
          INTERVAL="${{ github.event.inputs.interval || 'all' }}"
          curl -X POST "${{ secrets.DASHBOARD_URL }}/api/kis/collect?interval=$INTERVAL"
```

---

## Phase 6: 대시보드 연동 (선택)

### 6.1 새로고침 버튼 추가

**파일**: `stock-dashboard/src/routes/ticker/[symbol]/+page.svelte` (일부)

```svelte
<script lang="ts">
  // ... 기존 코드

  let refreshing = false;

  async function refreshData() {
    refreshing = true;
    try {
      const res = await fetch(`/api/kis/candles/${data.symbol}?interval=60m&save=true`);
      if (res.ok) {
        // 페이지 새로고침으로 데이터 반영
        window.location.reload();
      }
    } catch (e) {
      console.error('새로고침 실패:', e);
    } finally {
      refreshing = false;
    }
  }
</script>

<!-- 헤더 영역에 버튼 추가 -->
<button
  on:click={refreshData}
  disabled={refreshing}
  class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
>
  {refreshing ? '수집 중...' : '새로고침'}
</button>
```

---

## 마이그레이션 체크리스트

### 사전 준비
- [ ] KIS API 키 확보 (app_key, app_secret)
- [ ] stock-dashboard `.env` 파일에 KIS 환경변수 추가
- [ ] 기존 `.access_token.json` 파일 stock-dashboard 루트로 복사 (선택)

### Phase 1: KIS 클라이언트
- [ ] `src/lib/server/kis/types.ts` 생성
- [ ] `src/lib/server/kis/rate-limiter.ts` 생성
- [ ] `src/lib/server/kis/token-manager.ts` 생성
- [ ] `src/lib/server/kis/client.ts` 생성
- [ ] `src/lib/server/kis/index.ts` 생성

### Phase 2: Repository
- [ ] `src/lib/server/repositories/candle.repository.ts` 생성

### Phase 3: API Routes
- [ ] `src/routes/api/kis/token/+server.ts` 생성
- [ ] `src/routes/api/kis/price/[symbol]/+server.ts` 생성
- [ ] `src/routes/api/kis/candles/[symbol]/+server.ts` 생성
- [ ] `src/routes/api/kis/collect/+server.ts` 생성

### Phase 4: 환경 설정
- [ ] `.env` 파일 업데이트
- [ ] `src/app.d.ts` 타입 선언 추가

### Phase 5: 테스트
- [ ] 토큰 발급 테스트: `GET /api/kis/token`
- [ ] 현재가 조회 테스트: `GET /api/kis/price/AAPL?market=us&exchange=NAS`
- [ ] 캔들 조회 테스트: `GET /api/kis/candles/AAPL?interval=60m&save=true`
- [ ] 전체 수집 테스트: `POST /api/kis/collect`

### Phase 6: 전환
- [ ] stock-crawler 크롤러 중지
- [ ] External Cron 설정 (시스템 cron 또는 GitHub Actions)
- [ ] 1주일 모니터링
- [ ] stock-crawler 아카이브/삭제

---

## API 사용 예시

### 토큰 상태 확인
```bash
curl http://localhost:5173/api/kis/token
# {"valid":true,"expiresAt":"2024-12-27 10:30:00","remainingMinutes":1420}
```

### 현재가 조회
```bash
curl "http://localhost:5173/api/kis/price/AAPL?market=us&exchange=NAS"
# {"symbol":"AAPL","market":"us","price":{"last":"250.50",...}}
```

### 캔들 조회 (DB 저장)
```bash
curl "http://localhost:5173/api/kis/candles/AAPL?interval=daily&count=30&save=true"
# {"symbol":"AAPL","interval":"daily","count":30,"saved":30,"candles":[...]}
```

### 전체 티커 수집
```bash
curl -X POST "http://localhost:5173/api/kis/collect?interval=all"
# {"success":true,"totalTickers":5,"totalSaved":300,"errors":0,"results":[...]}
```

### 특정 티커만 수집
```bash
curl -X POST "http://localhost:5173/api/kis/collect" \
  -H "Content-Type: application/json" \
  -d '{"symbols":["AAPL","NVDA"],"interval":"60m"}'
```

---

## 트러블슈팅

### 토큰 발급 실패
- KIS_APP_KEY, KIS_APP_SECRET 환경변수 확인
- KIS 홈페이지에서 API 사용 신청 여부 확인

### Rate Limit 에러
- 500ms 간격이 지켜지고 있는지 확인
- 동시에 여러 요청이 발생하지 않는지 확인

### DB 저장 실패
- `uq_us_stock_candles` constraint 존재 확인
- DB 연결 정보 확인

### Cron 동작 안함
- 서버가 실행 중인지 확인
- cron 로그 확인: `grep CRON /var/log/syslog`
