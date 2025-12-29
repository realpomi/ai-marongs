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
  rt_cd: string; // "0" = 성공
  msg_cd: string;
  msg1: string;
  output?: T;
  output2?: T[];
}

// 미국 주식 캔들 (API 응답)
export interface UsStockCandleRaw {
  xymd: string; // 날짜: YYYYMMDD
  xhms: string; // 시간: HHMMSS
  open: string; // 시가
  high: string; // 고가
  low: string; // 저가
  clos: string; // 종가
  tvol: string; // 거래량
}

// 미국 주식 현재가 (API 응답)
export interface UsStockPriceRaw {
  last: string; // 현재가
  diff: string; // 전일대비
  rate: string; // 등락률
  tvol: string; // 거래량
  // ... 기타 필드
}

// 국내 주식 캔들 (API 응답)
export interface KrStockCandleRaw {
  stck_bsop_date: string; // 날짜
  stck_cntg_hour: string; // 시간
  stck_prpr: string; // 현재가
  stck_oprc: string; // 시가
  stck_hgpr: string; // 고가
  stck_lwpr: string; // 저가
  cntg_vol: string; // 거래량
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
