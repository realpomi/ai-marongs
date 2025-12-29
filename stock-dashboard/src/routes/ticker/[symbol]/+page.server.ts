import sql from '$lib/server/db';
import type { PageServerLoad } from './$types';
import { calculateAllIndicators } from '$lib/indicators';

export const load: PageServerLoad = async ({ params, url }) => {
  const { symbol } = params;
  const source = url.searchParams.get('source') || 'kis'; // 기본값: kis

  // Fetch Ticker Info
  const [ticker] = await sql`
    SELECT * FROM managed_tickers WHERE symbol = ${symbol}
  `;

  // Fetch Daily Candles (Fetch 1 year data for analysis)
  const rawDailyCandles = await sql`
    SELECT * FROM us_stock_candles 
    WHERE symbol = ${symbol} 
      AND interval = 'daily' 
      AND source = ${source}
    ORDER BY candle_time DESC 
    LIMIT 365
  `;

  // Calculate Technical Indicators
  let analysis = null;
  let indicators = null;
  const rsiValues: { [key: string]: number } = {};

  if (rawDailyCandles.length > 0) {
    // Calculate all technical indicators
    indicators = calculateAllIndicators(rawDailyCandles as any);

    const currentPrice = Number(rawDailyCandles[0].close_price);
    
    // MA20
    const candles20 = rawDailyCandles.slice(0, 20);
    const ma20 = candles20.length === 20 
      ? candles20.reduce((sum, c) => sum + Number(c.close_price), 0) / 20 
      : null;

    // MA60
    const candles60 = rawDailyCandles.slice(0, 60);
    const ma60 = candles60.length === 60
      ? candles60.reduce((sum, c) => sum + Number(c.close_price), 0) / 60
      : null;

    // 52-Week High (using all fetched data up to 365 days)
    let high52w = 0;
    
    rawDailyCandles.forEach(c => {
      const high = Number(c.high_price);
      if (high > high52w) {
        high52w = high;
      }
    });

    // 2-Week High (for short-term pullback)
    let high2w = 0;
    let high2wDate = '';
    const candles14 = rawDailyCandles.slice(0, 14);

    candles14.forEach(c => {
      const high = Number(c.high_price);
      if (high > high2w) {
        high2w = high;
        high2wDate = c.candle_time;
      }
    });

    // Volume Analysis
    const candles5 = rawDailyCandles.slice(0, 5);
    const avgVol5 = candles5.length > 0
      ? candles5.reduce((sum, c) => sum + Number(c.volume), 0) / candles5.length
      : 0;

    const avgVol20 = candles20.length > 0
      ? candles20.reduce((sum, c) => sum + Number(c.volume), 0) / candles20.length
      : 0;

    const volumeRatio = avgVol20 > 0 ? avgVol5 / avgVol20 : 0;
    
    // RSI Calculation (14 periods)
    // Need to process candles in chronological order for RSI calculation
    const sortedCandles = [...rawDailyCandles].sort((a, b) => new Date(a.candle_time).getTime() - new Date(b.candle_time).getTime());
    
    if (sortedCandles.length > 14) {
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
      rsiValues[sortedCandles[14].candle_time.toISOString()] = rsi;

      // Calculate rest using Smoothed Moving Average
      for (let i = 15; i < sortedCandles.length; i++) {
        const change = Number(sortedCandles[i].close_price) - Number(sortedCandles[i - 1].close_price);
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        avgGain = ((avgGain * 13) + gain) / 14;
        avgLoss = ((avgLoss * 13) + loss) / 14;

        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
        
        // Store RSI with date key
        rsiValues[new Date(sortedCandles[i].candle_time).toISOString()] = rsi;
      }
    }

    const currentRsi = rsiValues[new Date(rawDailyCandles[0].candle_time).toISOString()] || 0;

    // Calculate Pullback based on 2-Week High
    const pullbackRate = high2w > 0 ? ((high2w - currentPrice) / high2w) * 100 : 0;
    
    const highDateObj = new Date(high2wDate);
    const latestDateObj = new Date(rawDailyCandles[0].candle_time);
    const daysSinceHigh = Math.floor((latestDateObj.getTime() - highDateObj.getTime()) / (1000 * 3600 * 24));

    // Evaluate Status for Pullback Strategy
    const trendStatus = (ma20 && ma60 && ma20 > ma60) ? 'pass' : 'fail';
    
    let pullbackStatus = 'fail';
    if (pullbackRate >= 15 && pullbackRate <= 30) { // Adjusted range (15-30%)
      pullbackStatus = 'pass';
    } else if (pullbackRate < 15) {
      pullbackStatus = 'warning'; // Too shallow
    } else {
      pullbackStatus = 'fail'; // Too deep (> 30%)
    }

    const volumeStatus = volumeRatio < 1 ? 'pass' : 'fail';
    
    // Allow 2 to 10 days for short-term pullback
    const durationStatus = (daysSinceHigh >= 2 && daysSinceHigh <= 10) ? 'pass' : 'fail';

    // Consolidation Analysis (Last 5 days range)
    let consolidationStatus = 'fail';
    let consolidationRate = 0;
    
    if (candles5.length > 0) {
      const maxHigh = Math.max(...candles5.map(c => Number(c.high_price)));
      const minLow = Math.min(...candles5.map(c => Number(c.low_price)));
      if (minLow > 0) {
        consolidationRate = ((maxHigh - minLow) / minLow) * 100;
        if (consolidationRate <= 4) { // Within 4% range
           consolidationStatus = 'pass';
        }
      }
    }

    const score = [trendStatus, pullbackStatus, volumeStatus, durationStatus, consolidationStatus].filter(s => s === 'pass').length;

    // RSI Status
    let rsiStatus = 'NEUTRAL';
    if (currentRsi <= 30) rsiStatus = 'OVERSOLD';
    else if (currentRsi >= 70) rsiStatus = 'OVERBOUGHT';

    // Comprehensive Recommendation Logic
    let recommendation = 'WATCH';
    let recommendationReason = '현재 관망이 필요한 시점입니다.';

    if (trendStatus === 'fail') {
        recommendation = 'AVOID'; // 하락 추세
        recommendationReason = '하락 추세입니다. 추세가 전환될 때까지 기다리세요.';
    } else if (rsiStatus === 'OVERBOUGHT') {
        recommendation = 'WARNING'; // 과매수
        recommendationReason = '단기 과열 상태입니다(RSI > 70). 추격 매수보다는 조정을 기다리세요.';
    } else {
        // 상승 추세인 경우
        if (pullbackStatus === 'pass') {
            if (rsiStatus === 'OVERSOLD' || currentRsi <= 40) {
                 recommendation = 'STRONG_BUY';
                 recommendationReason = '상승 추세 중 과도한 하락(과매도)이 발생했습니다. 절호의 매수 기회일 수 있습니다!';
            } else if (volumeStatus === 'pass' && durationStatus === 'pass') {
                 recommendation = 'STRONG_BUY';
                 recommendationReason = '건전한 조정과 거래량 감소가 확인되었습니다. 매수하기 매우 좋은 타이밍입니다.';
            } else {
                 recommendation = 'BUY';
                 recommendationReason = '적절한 눌림목 구간입니다. 분할 매수로 접근해보세요.';
            }
        } else if (pullbackStatus === 'warning') {
            recommendation = 'WATCH';
            recommendationReason = '조정이 아직 충분하지 않습니다(가격 하락폭 부족). 조금 더 기다려보는 것이 좋습니다.';
        } else { // pullbackStatus === 'fail' (too deep)
            recommendation = 'WARNING';
            recommendationReason = '하락 폭이 너무 큽니다. 지지 라인을 확인하고 진입하세요.';
                }
            }
        
            // --- Technical Indicators Analysis ---
            // Latest Indicators
            const lastMacd = indicators.macd[indicators.macd.length - 1];
            const lastBB = indicators.bollingerBands[indicators.bollingerBands.length - 1];
        
            // MACD Status
            const macdBullish = lastMacd && lastMacd.histogram !== null && lastMacd.histogram > 0;
            const macdTurn = lastMacd && lastMacd.histogram !== null && indicators.macd.length > 1 
              && (indicators.macd[indicators.macd.length - 2].histogram || 0) <= 0 
              && lastMacd.histogram > 0; // Negative to Positive turn
        
            // Bollinger Band Status
            let bbStatus = 'MIDDLE';
            if (lastBB && lastBB.upper !== null && lastBB.lower !== null) {
                if (currentPrice >= lastBB.upper) bbStatus = 'UPPER_TOUCH';
                else if (currentPrice <= lastBB.lower) bbStatus = 'LOWER_TOUCH';
                else if (currentPrice <= lastBB.middle!) bbStatus = 'LOWER_HALF'; // Below middle
                else bbStatus = 'UPPER_HALF'; // Above middle
            }
        
            // --- Detailed Indicator Analysis (For Learning) ---
    
    // 1. RSI Analysis (Score 5 = Good for Buy/Oversold)
    let rsiScore = 3;
    let rsiMsg = '중립 구간입니다.';
    if (currentRsi >= 70) { rsiScore = 1; rsiMsg = '🔴 과매수! 이미 너무 비쌉니다. (조정 위험)'; }
    else if (currentRsi >= 60) { rsiScore = 2; rsiMsg = '🟠 다소 높습니다. 추가 상승 시 매도 물량이 나올 수 있습니다.'; }
    else if (currentRsi >= 45) { rsiScore = 3; rsiMsg = '⚪️ 적절한 균형 상태입니다.'; }
    else if (currentRsi >= 30) { rsiScore = 4; rsiMsg = '🟢 저평가 구간에 진입했습니다. 매수를 고려할 만합니다.'; }
    else { rsiScore = 5; rsiMsg = '🔵 과매도(바겐세일)! 파는 사람이 너무 많아 반등 가능성이 높습니다.'; }

    const rsiAnalysis = { score: rsiScore, value: currentRsi, message: rsiMsg };

    // 2. MACD Analysis (Score 5 = Strong Bullish Momentum)
    // Note: This scores 'Momentum Strength', not necessarily 'Dip Buy Opportunity'
    let macdScore = 3;
    let macdMsg = '방향성 모색 중';
    const hist = lastMacd?.histogram || 0;
    const prevHist = (indicators.macd.length > 1 ? indicators.macd[indicators.macd.length - 2].histogram : 0) || 0;

    if (hist > 0) {
        if (hist > prevHist) { macdScore = 5; macdMsg = '🚀 상승 에너지가 점점 강해지고 있습니다!'; }
        else { macdScore = 4; macdMsg = '📈 상승세지만 힘이 조금 빠지고 있습니다.'; }
    } else {
        if (hist > prevHist) { macdScore = 2; macdMsg = '📉 하락세지만 반등을 시도하고 있습니다 (회복세).'; } // Recovery
        else { macdScore = 1; macdMsg = '🌪 하락 에너지가 강해지고 있습니다. 떨어지는 칼날입니다.'; }
    }
    // Cross detection
    if (Math.abs(hist) < 0.05 || (hist > 0 && prevHist < 0) || (hist < 0 && prevHist > 0)) {
        macdScore = 3; macdMsg = '⚖️ 추세가 전환되는 변곡점입니다.';
    }
    
    const macdAnalysis = { score: macdScore, value: hist, message: macdMsg };

    // 3. Bollinger Band Analysis (Score 5 = Low Price/Lower Band)
    let bbScore = 3;
    let bbMsg = '밴드 중심';
    if (bbStatus === 'UPPER_TOUCH') { bbScore = 1; bbMsg = '🔴 상단 터치! 단기 고점일 확률이 높습니다.'; }
    else if (bbStatus === 'UPPER_HALF') { bbScore = 2; bbMsg = '🟠 평균보다 비싼 구간입니다.'; }
    else if (bbStatus === 'MIDDLE') { bbScore = 3; bbMsg = '⚪️ 중간값(20일선) 부근입니다.'; } // Should cover exact middle, but handled by range logic usually
    else if (bbStatus === 'LOWER_HALF') { bbScore = 4; bbMsg = '🟢 평균보다 저렴한 구간입니다.'; }
    else if (bbStatus === 'LOWER_TOUCH') { bbScore = 5; bbMsg = '🔵 하단 터치! 통계적으로 반등 확률이 높은 자리입니다.'; }
    
    // Correction for MIDDLE logic in previous block to map to scores better
    // Refine bbStatus logic slightly for the Score calculation if needed, 
    // but the previous bbStatus logic: UPPER_TOUCH, LOWER_TOUCH, LOWER_HALF, UPPER_HALF covers all.
    
    const bbAnalysis = { score: bbScore, message: bbMsg };


    // --- 5-Level Signal Logic ---
            let signalLevel = 3; // Default: Watch (Neutral)
            let signalMessage = '특별한 신호가 없습니다. 관망하세요.';
            let signalKeyword = '관망';
        
            if (trendStatus === 'fail') {
                // Downtrend
                if (macdTurn || (currentRsi < 30)) {
                    signalLevel = 2; // Caution (Possible Reversal?)
                    signalMessage = '하락 추세지만 반등 가능성이 있습니다. 섣불리 진입하지 말고 지켜보세요.';
                    signalKeyword = '주의 (반등시도)';
                } else {
                    signalLevel = 1; // Avoid
                    signalMessage = '하락 추세입니다. 보유하고 있다면 매도를 고려하고, 신규 진입은 위험합니다.';
                    signalKeyword = '매우 위험';
                }
            } else {
                // Uptrend (MA20 > MA60)
                if (currentRsi >= 70 || bbStatus === 'UPPER_TOUCH') {
                    signalLevel = 2; // Caution (Overbought)
                    signalMessage = '상승 추세지만 단기 과열(너무 비쌈) 상태입니다. 조정이 올 수 있으니 주의하세요.';
                    signalKeyword = '주의 (과열)';
                } else if (currentRsi <= 40 || bbStatus === 'LOWER_TOUCH' || pullbackStatus === 'pass') {
                    // Dip Buying Opportunity
                    if (macdBullish || volumeStatus === 'pass') {
                        signalLevel = 5; // Strong Buy
                        signalMessage = '상승 추세 속 확실한 저점 매수 기회입니다! (눌림목 + 모멘텀 살아있음)';
                        signalKeyword = '적극 매수';
                    } else {
                        signalLevel = 4; // Buy
                        signalMessage = '상승 추세 중 가격이 매력적인 구간입니다. 분할 매수로 접근해보세요.';
                        signalKeyword = '매수';
                    }
                } else if (bbStatus === 'LOWER_HALF') {
                     signalLevel = 4; // Buy (Reasonable price)
                     signalMessage = '상승 흐름이 견조하며 가격 부담이 적습니다. 매수하기 좋은 구간입니다.';
                     signalKeyword = '매수';
                } else {
                     // UPPER_HALF but not overbought
                     signalLevel = 3; // Hold/Watch
                     signalMessage = '상승세가 유지되고 있으나, 현재 진입하기엔 가격 메리트가 적습니다. 보유자는 홀딩하세요.';
                     signalKeyword = '관망 (보유)';
                }
            }
        
            // Override logic for specific cases
            if (score >= 4 && signalLevel < 4) {
                signalLevel = 4; // Boost level if simple score is very high
                signalMessage = '기술적 지표들이 전반적으로 긍정적입니다. 매수를 고려해보세요.';
                signalKeyword = '매수';
            }
        
            analysis = {
                  ma20,

          ma60,

          rsi: currentRsi,

          rsiStatus,

          trend: (ma20 && ma60 && ma20 > ma60) ? 'UP' : 'DOWN',

          trendStatus,

          high52w,

          high2w,

          currentPrice,

          pullbackRate,

          pullbackStatus,

          volumeRatio,

          volumeStatus,

          daysSinceHigh,

          durationStatus,

          consolidationRate,

                consolidationStatus,

                score,

                recommendation,

                      recommendationReason,

                      signalLevel,

                      signalMessage,

                      signalKeyword,

                      rsiAnalysis,

                      macdAnalysis,

                      bbAnalysis

                    };

                

          

      }

    

      const dailyCandles = rawDailyCandles.slice(0, 90).map((candle, index) => {

        const prevCandle = rawDailyCandles[index + 1];

        let changePercent = null;

        let volumeChangePercent = null;

    

        if (prevCandle) {

          const currentClose = Number(candle.close_price);

          const prevClose = Number(prevCandle.close_price);

          if (prevClose !== 0) {

            changePercent = ((currentClose - prevClose) / prevClose) * 100;

          }

    

          const currentVolume = Number(candle.volume);

          const prevVolume = Number(prevCandle.volume);

          if (prevVolume !== 0) {

            volumeChangePercent = ((currentVolume - prevVolume) / prevVolume) * 100;

          }

        }

    

        // Match RSI

        const candleDateKey = new Date(candle.candle_time).toISOString();

        const rsi = rsiValues[candleDateKey] || null;

    

        return {

          candle_time: candle.candle_time,

          open_price: Number(candle.open_price),

          high_price: Number(candle.high_price),

          low_price: Number(candle.low_price),

          close_price: Number(candle.close_price),

          volume: Number(candle.volume),

          change_percent: changePercent,

          volume_change_percent: volumeChangePercent,

          rsi

        };

      });

    

      // Fetch 60m Candles (Latest 30)

      const hourlyCandles = await sql`

        SELECT * FROM us_stock_candles 

        WHERE symbol = ${symbol} 

          AND interval = '60m' 

          AND source = ${source}

        ORDER BY candle_time DESC 

        LIMIT 30

      `;

    

      return {

        ticker,

        dailyCandles,

        hourlyCandles,

        currentSource: source,

        analysis,

        indicators

      };

    };

    