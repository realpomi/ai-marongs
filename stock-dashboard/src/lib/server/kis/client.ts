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
