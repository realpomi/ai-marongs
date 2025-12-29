import { calculateAllIndicators } from '$lib/indicators';
import type { IndicatorResults } from '$lib/indicators';

interface CandleData {
  candle_time: Date | string;
  open_price: number | string;
  high_price: number | string;
  low_price: number | string;
  close_price: number | string;
  volume: number | string;
}

export interface SignalAnalysis {
  signalLevel: number; // 1-5 (1: 매우위험, 5: 적극매수)
  signalKeyword: string;
  signalMessage: string;

  // 상세 지표
  ma20: number | null;
  ma60: number | null;
  rsi: number;
  rsiStatus: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL';
  trend: 'UP' | 'DOWN';
  trendStatus: 'pass' | 'fail';

  pullbackRate: number;
  pullbackStatus: 'pass' | 'warning' | 'fail';

  volumeRatio: number;
  volumeStatus: 'pass' | 'fail';

  daysSinceHigh: number;
  durationStatus: 'pass' | 'fail';

  consolidationRate: number;
  consolidationStatus: 'pass' | 'fail';

  high2w: number;
  high52w: number;
  currentPrice: number;

  // 점수
  score: number;
}

/**
 * RSI 계산
 */
function calculateRSI(candles: CandleData[]): { [key: string]: number } {
  const rsiValues: { [key: string]: number } = {};

  // 시간순 정렬
  const sortedCandles = [...candles].sort(
    (a, b) => new Date(a.candle_time).getTime() - new Date(b.candle_time).getTime()
  );

  if (sortedCandles.length <= 14) return rsiValues;

  let gains = 0;
  let losses = 0;

  // First 14 days (Simple Average)
  for (let i = 1; i <= 14; i++) {
    const change = Number(sortedCandles[i].close_price) - Number(sortedCandles[i - 1].close_price);
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / 14;
  let avgLoss = losses / 14;

  // Calculate first RSI
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let rsi = 100 - (100 / (1 + rs));

  const dateKey14 = sortedCandles[14].candle_time instanceof Date
    ? sortedCandles[14].candle_time.toISOString()
    : new Date(sortedCandles[14].candle_time).toISOString();
  rsiValues[dateKey14] = rsi;

  // Calculate rest using Smoothed Moving Average
  for (let i = 15; i < sortedCandles.length; i++) {
    const change = Number(sortedCandles[i].close_price) - Number(sortedCandles[i - 1].close_price);
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = ((avgGain * 13) + gain) / 14;
    avgLoss = ((avgLoss * 13) + loss) / 14;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi = 100 - (100 / (1 + rs));

    const candleTime = sortedCandles[i].candle_time;
    const dateKey = candleTime instanceof Date
      ? candleTime.toISOString()
      : new Date(candleTime).toISOString();
    rsiValues[dateKey] = rsi;
  }

  return rsiValues;
}

/**
 * 종목의 일봉 데이터를 분석하여 시그널 레벨을 계산합니다.
 * @param candles 최근 1년치 일봉 데이터 (DESC 정렬, 최신이 첫번째)
 */
export function analyzeSignal(candles: CandleData[]): SignalAnalysis | null {
  if (candles.length < 60) {
    console.warn('[SignalAnalyzer] 분석에 필요한 최소 데이터(60일) 부족');
    return null;
  }

  // 기술적 지표 계산
  const indicators = calculateAllIndicators(candles as any);
  const rsiValues = calculateRSI(candles);

  const currentPrice = Number(candles[0].close_price);

  // MA20
  const candles20 = candles.slice(0, 20);
  const ma20 = candles20.length === 20
    ? candles20.reduce((sum, c) => sum + Number(c.close_price), 0) / 20
    : null;

  // MA60
  const candles60 = candles.slice(0, 60);
  const ma60 = candles60.length === 60
    ? candles60.reduce((sum, c) => sum + Number(c.close_price), 0) / 60
    : null;

  // 52주 고점
  let high52w = 0;
  candles.forEach(c => {
    const high = Number(c.high_price);
    if (high > high52w) high52w = high;
  });

  // 2주 고점
  let high2w = 0;
  let high2wDate = '';
  const candles14 = candles.slice(0, 14);
  candles14.forEach(c => {
    const high = Number(c.high_price);
    if (high > high2w) {
      high2w = high;
      high2wDate = c.candle_time instanceof Date
        ? c.candle_time.toISOString()
        : String(c.candle_time);
    }
  });

  // 거래량 분석
  const candles5 = candles.slice(0, 5);
  const avgVol5 = candles5.length > 0
    ? candles5.reduce((sum, c) => sum + Number(c.volume), 0) / candles5.length
    : 0;
  const avgVol20 = candles20.length > 0
    ? candles20.reduce((sum, c) => sum + Number(c.volume), 0) / candles20.length
    : 0;
  const volumeRatio = avgVol20 > 0 ? avgVol5 / avgVol20 : 0;

  // RSI
  const currentRsiKey = candles[0].candle_time instanceof Date
    ? candles[0].candle_time.toISOString()
    : new Date(candles[0].candle_time).toISOString();
  const currentRsi = rsiValues[currentRsiKey] || 50;

  // 풀백 계산
  const pullbackRate = high2w > 0 ? ((high2w - currentPrice) / high2w) * 100 : 0;

  const highDateObj = new Date(high2wDate);
  const latestDateObj = new Date(candles[0].candle_time);
  const daysSinceHigh = Math.floor((latestDateObj.getTime() - highDateObj.getTime()) / (1000 * 3600 * 24));

  // 상태 평가
  const trendStatus = (ma20 && ma60 && ma20 > ma60) ? 'pass' : 'fail';

  let pullbackStatus: 'pass' | 'warning' | 'fail' = 'fail';
  if (pullbackRate >= 15 && pullbackRate <= 30) {
    pullbackStatus = 'pass';
  } else if (pullbackRate < 15) {
    pullbackStatus = 'warning';
  }

  const volumeStatus = volumeRatio < 1 ? 'pass' : 'fail';
  const durationStatus = (daysSinceHigh >= 2 && daysSinceHigh <= 10) ? 'pass' : 'fail';

  // 횡보 분석
  let consolidationStatus: 'pass' | 'fail' = 'fail';
  let consolidationRate = 0;
  if (candles5.length > 0) {
    const maxHigh = Math.max(...candles5.map(c => Number(c.high_price)));
    const minLow = Math.min(...candles5.map(c => Number(c.low_price)));
    if (minLow > 0) {
      consolidationRate = ((maxHigh - minLow) / minLow) * 100;
      if (consolidationRate <= 4) {
        consolidationStatus = 'pass';
      }
    }
  }

  const score = [trendStatus, pullbackStatus, volumeStatus, durationStatus, consolidationStatus]
    .filter(s => s === 'pass').length;

  // RSI 상태
  let rsiStatus: 'OVERSOLD' | 'OVERBOUGHT' | 'NEUTRAL' = 'NEUTRAL';
  if (currentRsi <= 30) rsiStatus = 'OVERSOLD';
  else if (currentRsi >= 70) rsiStatus = 'OVERBOUGHT';

  // MACD 분석
  const lastMacd = indicators.macd[indicators.macd.length - 1];
  const prevMacd = indicators.macd.length > 1 ? indicators.macd[indicators.macd.length - 2] : null;
  const macdBullish = lastMacd && lastMacd.histogram !== null && lastMacd.histogram > 0;
  const macdTurn = lastMacd && lastMacd.histogram !== null && prevMacd
    && (prevMacd.histogram || 0) <= 0
    && lastMacd.histogram > 0;

  // 볼린저 밴드 상태
  const lastBB = indicators.bollingerBands[indicators.bollingerBands.length - 1];
  let bbStatus = 'MIDDLE';
  if (lastBB && lastBB.upper !== null && lastBB.lower !== null) {
    if (currentPrice >= lastBB.upper) bbStatus = 'UPPER_TOUCH';
    else if (currentPrice <= lastBB.lower) bbStatus = 'LOWER_TOUCH';
    else if (currentPrice <= lastBB.middle!) bbStatus = 'LOWER_HALF';
    else bbStatus = 'UPPER_HALF';
  }

  // 5단계 시그널 로직
  let signalLevel = 3;
  let signalMessage = '특별한 신호가 없습니다. 관망하세요.';
  let signalKeyword = '관망';

  if (trendStatus === 'fail') {
    if (macdTurn || currentRsi < 30) {
      signalLevel = 2;
      signalMessage = '하락 추세지만 반등 가능성이 있습니다. 섣불리 진입하지 말고 지켜보세요.';
      signalKeyword = '주의 (반등시도)';
    } else {
      signalLevel = 1;
      signalMessage = '하락 추세입니다. 보유하고 있다면 매도를 고려하고, 신규 진입은 위험합니다.';
      signalKeyword = '매우 위험';
    }
  } else {
    if (currentRsi >= 70 || bbStatus === 'UPPER_TOUCH') {
      signalLevel = 2;
      signalMessage = '상승 추세지만 단기 과열(너무 비쌈) 상태입니다. 조정이 올 수 있으니 주의하세요.';
      signalKeyword = '주의 (과열)';
    } else if (currentRsi <= 40 || bbStatus === 'LOWER_TOUCH' || pullbackStatus === 'pass') {
      if (macdBullish || volumeStatus === 'pass') {
        signalLevel = 5;
        signalMessage = '상승 추세 속 확실한 저점 매수 기회입니다! (눌림목 + 모멘텀 살아있음)';
        signalKeyword = '적극 매수';
      } else {
        signalLevel = 4;
        signalMessage = '상승 추세 중 가격이 매력적인 구간입니다. 분할 매수로 접근해보세요.';
        signalKeyword = '매수';
      }
    } else if (bbStatus === 'LOWER_HALF') {
      signalLevel = 4;
      signalMessage = '상승 흐름이 견조하며 가격 부담이 적습니다. 매수하기 좋은 구간입니다.';
      signalKeyword = '매수';
    } else {
      signalLevel = 3;
      signalMessage = '상승세가 유지되고 있으나, 현재 진입하기엔 가격 메리트가 적습니다. 보유자는 홀딩하세요.';
      signalKeyword = '관망 (보유)';
    }
  }

  // 점수가 높으면 레벨 상향
  if (score >= 4 && signalLevel < 4) {
    signalLevel = 4;
    signalMessage = '기술적 지표들이 전반적으로 긍정적입니다. 매수를 고려해보세요.';
    signalKeyword = '매수';
  }

  return {
    signalLevel,
    signalKeyword,
    signalMessage,
    ma20,
    ma60,
    rsi: currentRsi,
    rsiStatus,
    trend: (ma20 && ma60 && ma20 > ma60) ? 'UP' : 'DOWN',
    trendStatus,
    pullbackRate,
    pullbackStatus,
    volumeRatio,
    volumeStatus,
    daysSinceHigh,
    durationStatus,
    consolidationRate,
    consolidationStatus,
    high2w,
    high52w,
    currentPrice,
    score
  };
}
