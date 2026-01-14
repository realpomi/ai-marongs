<script lang="ts">
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import Chart from 'chart.js/auto';

  let { data } = $props();
  
  const EXCHANGE_RATE = 1500;
  
  // RSI Chart Refs
  let chartCanvas: HTMLCanvasElement;
  let chartInstance: Chart | null = null;
  
  // Candle Chart Refs
  let candleChartContainer: HTMLDivElement;
  let macdChartContainer: HTMLDivElement;
  let candleChartInstance: any = null;
  let macdChartInstance: any = null;

  let updating = $state(false);

  async function updateData() {
    if (updating || !data.ticker?.symbol) return;
    
    updating = true;
    try {
      const symbol = data.ticker.symbol;
      // Update daily candles
      await fetch(`/api/kis/candles/${symbol}?interval=daily&save=true`);
      
      await invalidateAll();
    } catch (error) {
      console.error('Failed to update data:', error);
      alert('데이터 업데이트에 실패했습니다.');
    } finally {
      updating = false;
    }
  }

  // Effect for RSI Chart (Chart.js)
  $effect(() => {
    if (chartCanvas && data.dailyCandles) {
      if (chartInstance) {
        chartInstance.destroy();
      }

      const reversedCandles = [...data.dailyCandles].reverse();
      const labels = reversedCandles.map(c => new Date(c.candle_time).toLocaleDateString());
      const rsiData = reversedCandles.map(c => c.rsi);

      // Custom plugin to draw background colors for RSI zones
      const rsiBackgroundPlugin = {
        id: 'rsiBackground',
        beforeDraw: (chart: any) => {
          const { ctx, chartArea: { top, bottom, left, right, width }, scales: { y } } = chart;
          ctx.save();

          // Overbought zone (70-100) - Light Red
          ctx.fillStyle = 'rgba(255, 99, 132, 0.15)';
          const y70 = y.getPixelForValue(70);
          ctx.fillRect(left, top, width, y70 - top);

          // Oversold zone (0-30) - Light Green
          ctx.fillStyle = 'rgba(75, 192, 192, 0.15)';
          const y30 = y.getPixelForValue(30);
          ctx.fillRect(left, y30, width, bottom - y30);

          ctx.restore();
        }
      };

      chartInstance = new Chart(chartCanvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'RSI (14)',
              data: rsiData,
              borderColor: 'rgb(54, 162, 235)',
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 3,
              pointBackgroundColor: 'rgb(54, 162, 235)',
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: {
                stepSize: 10
              },
              grid: {
                color: (context) => {
                  if (context.tick.value === 30 || context.tick.value === 70) {
                    return 'rgba(0, 0, 0, 0.2)';
                  }
                  return 'rgba(0, 0, 0, 0.05)';
                },
                lineWidth: (context) => {
                  if (context.tick.value === 30 || context.tick.value === 70) {
                    return 2;
                  }
                  return 1;
                }
              }
            }
          },
          plugins: {
            legend: {
              display: false
            }
          }
        },
        plugins: [rsiBackgroundPlugin]
      });
    }

    return () => {
      if (chartInstance) {
        chartInstance.destroy();
      }
    };
  });

  // Effect for Candle Chart (Lightweight Charts)
  $effect(() => {
    let cleanup: (() => void) | undefined;

    const initChart = async () => {
        if (!candleChartContainer || !macdChartContainer || !data.dailyCandles || data.dailyCandles.length === 0) return;

        try {
            const { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries } = await import('lightweight-charts');

            // Clean up previous instances
            if (candleChartInstance) candleChartInstance.remove();
            if (macdChartInstance) macdChartInstance.remove();

            const commonOptions = {
                layout: {
                    textColor: 'black',
                    background: { type: ColorType.Solid, color: 'white' },
                },
                grid: {
                    vertLines: { color: '#f0f0f0' },
                    horzLines: { color: '#f0f0f0' },
                },
                timeScale: {
                    borderColor: '#cccccc',
                    timeVisible: true,
                },
                rightPriceScale: {
                    borderColor: '#cccccc',
                },
            };

            // 1. Price Chart with SMA & Bollinger Bands
            candleChartInstance = createChart(candleChartContainer, {
                ...commonOptions,
                height: 400,
            });

            const candlestickSeries = candleChartInstance.addSeries(CandlestickSeries, {
                upColor: '#26a69a', 
                downColor: '#ef5350', 
                borderVisible: false,
                wickUpColor: '#26a69a', 
                wickDownColor: '#ef5350',
            });

            // 2. MACD Chart
            macdChartInstance = createChart(macdChartContainer, {
                ...commonOptions,
                height: 200,
            });

            const macdLineSeries = macdChartInstance.addSeries(LineSeries, {
                color: '#2962FF',
                lineWidth: 2,
            });

            const signalLineSeries = macdChartInstance.addSeries(LineSeries, {
                color: '#FF6D00',
                lineWidth: 2,
            });

            const histogramSeries = macdChartInstance.addSeries(HistogramSeries, {
                color: '#26a69a',
            });

            // Indicators on Price Chart
            const sma20Series = candleChartInstance.addSeries(LineSeries, {
                color: '#2962FF',
                lineWidth: 1,
            });

            const sma60Series = candleChartInstance.addSeries(LineSeries, {
                color: '#FF6D00',
                lineWidth: 1,
            });

            const bbUpperSeries = candleChartInstance.addSeries(LineSeries, {
                color: 'rgba(128, 128, 128, 0.4)',
                lineWidth: 1,
                lineStyle: 2, // Dashed
            });

            const bbMiddleSeries = candleChartInstance.addSeries(LineSeries, {
                color: 'rgba(128, 128, 128, 0.2)',
                lineWidth: 1,
                lineStyle: 2, // Dashed
            });

            const bbLowerSeries = candleChartInstance.addSeries(LineSeries, {
                color: 'rgba(128, 128, 128, 0.4)',
                lineWidth: 1,
                lineStyle: 2, // Dashed
            });

            const reversed = [...data.dailyCandles].sort((a, b) => new Date(a.candle_time).getTime() - new Date(b.candle_time).getTime());
            
            // Map data
            const candleData: any[] = [];
            const sma20Data: any[] = [];
            const sma60Data: any[] = [];
            const bbUpperData: any[] = [];
            const bbMiddleData: any[] = [];
            const bbLowerData: any[] = [];
            const macdData: any[] = [];
            const signalData: any[] = [];
            const histogramData: any[] = [];

            // Helper to find indicator value by time
            const findInd = (list: any[], time: string) => list?.find(i => i.time === time);

            const uniqueTimes = new Set<string>();

            reversed.forEach(c => {
                const timeStr = new Date(c.candle_time).toISOString().split('T')[0];
                
                // Skip if duplicate time
                if (uniqueTimes.has(timeStr)) return;
                uniqueTimes.add(timeStr);

                const open = Number(c.open_price);
                const high = Number(c.high_price);
                const low = Number(c.low_price);
                const close = Number(c.close_price);

                if (!isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close)) {
                    candleData.push({ time: timeStr, open, high, low, close });
                    
                    if (data.indicators) {
                        const s20 = findInd(data.indicators.sma20, timeStr);
                        if (s20?.value) sma20Data.push({ time: timeStr, value: s20.value });

                        const s60 = findInd(data.indicators.sma60, timeStr);
                        if (s60?.value) sma60Data.push({ time: timeStr, value: s60.value });

                        const bb = findInd(data.indicators.bollingerBands, timeStr);
                        if (bb?.upper) bbUpperData.push({ time: timeStr, value: bb.upper });
                        if (bb?.middle) bbMiddleData.push({ time: timeStr, value: bb.middle });
                        if (bb?.lower) bbLowerData.push({ time: timeStr, value: bb.lower });

                        const m = findInd(data.indicators.macd, timeStr);
                        if (m?.macd) macdData.push({ time: timeStr, value: m.macd });
                        if (m?.signal) signalData.push({ time: timeStr, value: m.signal });
                        if (m?.histogram !== null) {
                            histogramData.push({ 
                                time: timeStr, 
                                value: m.histogram,
                                color: m.histogram >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
                            });
                        }
                    }
                }
            });
            
            candlestickSeries.setData(candleData);
            sma20Series.setData(sma20Data);
            sma60Series.setData(sma60Data);
            bbUpperSeries.setData(bbUpperData);
            bbMiddleSeries.setData(bbMiddleData);
            bbLowerSeries.setData(bbLowerData);
            
            macdLineSeries.setData(macdData);
            signalLineSeries.setData(signalData);
            histogramSeries.setData(histogramData);

            candleChartInstance.timeScale().fitContent();
            
            // Sync time scales
            candleChartInstance.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
                macdChartInstance.timeScale().setVisibleRange(range);
            });
            macdChartInstance.timeScale().subscribeVisibleTimeRangeChange((range: any) => {
                candleChartInstance.timeScale().setVisibleRange(range);
            });

            const handleResize = () => {
                if (candleChartContainer && candleChartInstance) {
                    candleChartInstance.applyOptions({ width: candleChartContainer.clientWidth });
                }
                if (macdChartContainer && macdChartInstance) {
                    macdChartInstance.applyOptions({ width: macdChartContainer.clientWidth });
                }
            };

            window.addEventListener('resize', handleResize);

            cleanup = () => {
                window.removeEventListener('resize', handleResize);
                if (candleChartInstance) {
                    candleChartInstance.remove();
                    candleChartInstance = null;
                }
                if (macdChartInstance) {
                    macdChartInstance.remove();
                    macdChartInstance = null;
                }
            };
        } catch (err) {
            console.error('Failed to load chart library or render chart:', err);
        }
    };

    initChart();

    return () => {
        if (cleanup) cleanup();
        else {
            if (candleChartInstance) {
                candleChartInstance.remove();
                candleChartInstance = null;
            }
            if (macdChartInstance) {
                macdChartInstance.remove();
                macdChartInstance = null;
            }
        }
    };
  });

  function getRsiAdvice(rsi: number) {
    if (rsi >= 70) return "매수세가 매우 강하여 과열 상태입니다. 곧 가격 조정이 올 수 있으니 신규 진입에 유의하세요.";
    if (rsi >= 60) return "매수세가 강한 편입니다. 고점일 가능성을 고려해야 합니다.";
    if (rsi >= 40) return "안정적입니다. 매수와 매도 균형이 잡힌 상태입니다.";
    if (rsi > 30) return "가격이 다소 떨어진 상태이며, 반등할 가능성이 조금 있습니다.";
    return "가격이 많이 떨어진 상태이며, 반등할 가능성이 높습니다.";
  }
</script>

<div class="max-w-4xl mx-auto px-2 md:px-0">
  <div class="mb-4 md:mb-8 border-b pb-4">
    <div class="flex flex-col gap-2">
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div class="flex items-center gap-2 sm:gap-4 flex-wrap">
          <h1 class="text-2xl md:text-3xl font-bold text-gray-900">{data.ticker?.symbol}</h1>
          <span class="text-sm px-2 py-1 bg-gray-200 rounded-full text-gray-700">{data.ticker?.exchange}</span>
        </div>
        <button
          onclick={updateData}
          disabled={updating}
          class="flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 rounded-lg hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
        >
          <span class={updating ? "animate-spin" : ""}>🔄</span>
          {updating ? '업데이트 중...' : '최신 데이터 가져오기'}
        </button>
      </div>
      <span class="text-base md:text-xl text-gray-600">{data.ticker?.name}</span>
      <div class="text-xs md:text-sm text-gray-500">
        * 원화 가격은 ₩{EXCHANGE_RATE.toLocaleString()} / $1 기준입니다.
      </div>
    </div>
  </div>

  <!-- Analysis Stats -->
  {#if data.analysis}
    <div class="mb-8">
      
      <!-- 5-Level Signal Gauge (New) -->
      <div class="mb-4 md:mb-8 bg-white rounded-2xl p-4 md:p-6 shadow-lg border border-gray-100">
         <h2 class="text-base md:text-lg font-bold text-gray-800 mb-3 md:mb-4 flex items-center gap-2">
            🤖 AI 투자 분석 신호
            <span class="text-[10px] md:text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Beta</span>
         </h2>
         
         <!-- Gauge Bar -->
         <div class="relative h-4 w-full bg-gray-200 rounded-full mb-6 flex overflow-hidden">
            <div class="flex-1 bg-red-500 opacity-20 transition-opacity {data.analysis.signalLevel === 1 ? 'opacity-100' : ''}"></div>
            <div class="flex-1 bg-orange-500 opacity-20 transition-opacity {data.analysis.signalLevel === 2 ? 'opacity-100' : ''}"></div>
            <div class="flex-1 bg-yellow-400 opacity-20 transition-opacity {data.analysis.signalLevel === 3 ? 'opacity-100' : ''}"></div>
            <div class="flex-1 bg-lime-500 opacity-20 transition-opacity {data.analysis.signalLevel === 4 ? 'opacity-100' : ''}"></div>
            <div class="flex-1 bg-green-600 opacity-20 transition-opacity {data.analysis.signalLevel === 5 ? 'opacity-100' : ''}"></div>
         </div>

         <!-- Labels & Arrow -->
         <div class="relative h-8 -mt-5 mb-4 mx-[10%] w-[80%]">
             <div class="absolute top-0 transition-all duration-500 transform -translate-x-1/2" style="left: {(data.analysis.signalLevel - 1) * 25}%">
                <div class="text-3xl">Wait...</div> <!-- Placeholder, improved below with icon -->
             </div>
         </div>

         <!-- Signal Result -->
         <div class="flex flex-col items-center text-center">
             <!-- Arrow Pointer based on level -->
             <div class="flex w-full justify-between text-[10px] md:text-xs text-gray-400 font-bold px-1 mb-2">
                 <span class={data.analysis.signalLevel === 1 ? 'text-red-600 scale-110' : ''}>매우 위험</span>
                 <span class={data.analysis.signalLevel === 2 ? 'text-orange-600 scale-110' : ''}>주의</span>
                 <span class={data.analysis.signalLevel === 3 ? 'text-yellow-600 scale-110' : ''}>관망</span>
                 <span class={data.analysis.signalLevel === 4 ? 'text-lime-600 scale-110' : ''}>매수</span>
                 <span class={data.analysis.signalLevel === 5 ? 'text-green-700 scale-110' : ''}>적극 매수</span>
             </div>

             <!-- Active Signal Pointer (Visual) -->
             <div class="w-full relative h-6 mb-4">
                 <div class="absolute top-0 transform -translate-x-1/2 transition-all duration-500" style="left: {10 + (data.analysis.signalLevel - 1) * 20}%">
                     <div class="w-0 h-0 border-l-[8px] md:border-l-[10px] border-l-transparent border-r-[8px] md:border-r-[10px] border-r-transparent border-b-[12px] md:border-b-[15px]
                         {data.analysis.signalLevel === 1 ? 'border-b-red-500' :
                          data.analysis.signalLevel === 2 ? 'border-b-orange-500' :
                          data.analysis.signalLevel === 3 ? 'border-b-yellow-400' :
                          data.analysis.signalLevel === 4 ? 'border-b-lime-500' : 'border-b-green-600'}">
                     </div>
                 </div>
             </div>

             <h1 class="text-2xl md:text-4xl font-black mb-2
                 {data.analysis.signalLevel === 1 ? 'text-red-600' :
                  data.analysis.signalLevel === 2 ? 'text-orange-600' :
                  data.analysis.signalLevel === 3 ? 'text-yellow-600' :
                  data.analysis.signalLevel === 4 ? 'text-lime-600' : 'text-green-700'}">
                 {data.analysis.signalKeyword}
             </h1>
             <p class="text-base md:text-xl text-gray-700 font-medium">{data.analysis.signalMessage}</p>
         </div>
      </div>

      <div class="flex items-center gap-3 mb-3 md:mb-4">
        <h2 class="text-lg md:text-xl font-bold text-gray-800">상세 분석 지표</h2>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <!-- Trend Card -->
        <div class="bg-white p-2.5 md:p-4 rounded-lg shadow border-l-4 {data.analysis.trendStatus === 'pass' ? 'border-l-green-500' : 'border-l-red-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-1 md:mb-2">
            <span class="text-[10px] md:text-sm text-gray-500 font-medium">1. 시장 추세</span>
            <span class="text-sm md:text-base">{data.analysis.trendStatus === 'pass' ? '✅' : '❌'}</span>
          </div>
          <div>
            <div class="font-bold text-sm md:text-lg {data.analysis.trendStatus === 'pass' ? 'text-green-700' : 'text-red-700'}">
              {data.analysis.trend === 'UP' ? '상승 추세' : '하락 추세'}
            </div>
            <div class="text-[10px] md:text-xs text-gray-500 mt-1">
              MA20 {data.analysis.trend === 'UP' ? '>' : '<'} MA60
            </div>
          </div>
          {#if data.analysis.ma20 && data.analysis.ma60}
            <div class="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-gray-50 text-[10px] md:text-xs text-gray-400 space-y-1">
               <div class="flex justify-between"><span>20일 이평</span> <span>${data.analysis.ma20.toFixed(2)}</span></div>
               <div class="flex justify-between"><span>60일 이평</span> <span>${data.analysis.ma60.toFixed(2)}</span></div>
            </div>
          {/if}
        </div>

        <!-- Pullback Card -->
        <div class="bg-white p-2.5 md:p-4 rounded-lg shadow border-l-4 {data.analysis.pullbackStatus === 'pass' ? 'border-l-green-500' : data.analysis.pullbackStatus === 'warning' ? 'border-l-yellow-500' : 'border-l-red-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-1 md:mb-2">
            <span class="text-[10px] md:text-sm text-gray-500 font-medium">2. 가격 조정</span>
            <span class="text-sm md:text-base">{data.analysis.pullbackStatus === 'pass' ? '✅' : data.analysis.pullbackStatus === 'warning' ? '⚠️' : '❌'}</span>
          </div>
          <div>
            <div class="font-bold text-sm md:text-lg {data.analysis.pullbackStatus === 'pass' ? 'text-green-700' : data.analysis.pullbackStatus === 'warning' ? 'text-yellow-700' : 'text-red-700'}">
              {data.analysis.pullbackRate.toFixed(1)}% 하락
            </div>
            <div class="text-[10px] md:text-xs text-gray-500 mt-1 space-y-0.5 md:space-y-1">
              <div class="hidden md:block">기준: 2주 고점 (${data.analysis.high2w.toFixed(2)})</div>
              <div>목표: 15% ~ 30%</div>
              <div class="font-medium pt-1 border-t border-gray-100 mt-1">
                {data.analysis.pullbackStatus === 'pass' ? '적정' :
                 data.analysis.pullbackStatus === 'warning' ? '부족' :
                 '과도'}
              </div>
            </div>
          </div>
        </div>

        <!-- Volume Ratio Card -->
        <div class="bg-white p-2.5 md:p-4 rounded-lg shadow border-l-4 {data.analysis.volumeStatus === 'pass' ? 'border-l-green-500' : 'border-l-red-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-1 md:mb-2">
            <span class="text-[10px] md:text-sm text-gray-500 font-medium">3. 매도세</span>
            <span class="text-sm md:text-base">{data.analysis.volumeStatus === 'pass' ? '✅' : '❌'}</span>
          </div>
          <div>
            <div class="font-bold text-sm md:text-lg {data.analysis.volumeStatus === 'pass' ? 'text-green-700' : 'text-red-700'}">
              {data.analysis.volumeRatio.toFixed(2)}배
            </div>
            <div class="text-[10px] md:text-xs text-gray-500 mt-1">
              <span class="font-medium">{data.analysis.volumeStatus === 'pass' ? '반등 준비' : '위험'}</span>
            </div>
          </div>
        </div>

        <!-- Timing Card (Duration & Consolidation) -->
        <div class="bg-white p-2.5 md:p-4 rounded-lg shadow border-l-4 {data.analysis.durationStatus === 'pass' && data.analysis.consolidationStatus === 'pass' ? 'border-l-green-500' : 'border-l-orange-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-1 md:mb-2">
            <span class="text-[10px] md:text-sm text-gray-500 font-medium">4. 지지력</span>
            <span class="text-sm md:text-base">{data.analysis.durationStatus === 'pass' && data.analysis.consolidationStatus === 'pass' ? '✅' : '⚠️'}</span>
          </div>
          <div>
            <div class="flex justify-between items-center mb-0.5 md:mb-1">
              <span class="text-[10px] md:text-xs text-gray-500">기간 ({data.analysis.daysSinceHigh}일)</span>
              <span class="text-[10px] md:text-xs font-bold {data.analysis.durationStatus === 'pass' ? 'text-green-600' : 'text-red-600'}">{data.analysis.durationStatus === 'pass' ? '적정' : '부적합'}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-[10px] md:text-xs text-gray-500">지지 (5일)</span>
              <span class="text-[10px] md:text-xs font-bold {data.analysis.consolidationStatus === 'pass' ? 'text-green-600' : 'text-red-600'}">{data.analysis.consolidationStatus === 'pass' ? '횡보' : '불안정'}</span>
            </div>

            <div class="mt-1 md:mt-2 text-xs md:text-sm text-gray-700">
               변동폭 <span class="font-bold">{data.analysis.consolidationRate.toFixed(1)}%</span>
            </div>
          </div>
          <div class="hidden md:block mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400 space-y-1">
             <div class="flex justify-between"><span>2주 고점</span> <span>${data.analysis.high2w.toFixed(2)}</span></div>
             <div class="flex justify-between"><span>52주 고점</span> <span>${data.analysis.high52w.toFixed(2)}</span></div>
          </div>
        </div>
      </div>
      
      <!-- Detailed Learning Indicators (New) -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 md:mb-4 mt-6 md:mt-8 pt-4 md:pt-6 border-t border-gray-100">
        <h2 class="text-base md:text-xl font-bold text-gray-800">📚 심층 지표 분석</h2>
        <span class="text-[10px] md:text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">각 지표가 어떤 이야기를 하고 있을까요?</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <!-- RSI Card -->
        <div class="bg-white p-3 md:p-5 rounded-lg shadow-sm border border-gray-200">
            <div class="flex justify-between items-center mb-2 md:mb-3">
                <h3 class="font-bold text-sm md:text-base text-gray-700">RSI (가격 부담)</h3>
                <span class="text-xs md:text-sm font-mono bg-gray-100 px-2 rounded">{data.analysis.rsiAnalysis.value.toFixed(1)}</span>
            </div>

            <!-- Score Bar -->
            <div class="flex gap-1 h-1.5 md:h-2 mb-2 md:mb-3">
                {#each Array(5) as _, i}
                    <div class="flex-1 rounded-full {i < data.analysis.rsiAnalysis.score ? (data.analysis.rsiAnalysis.score >= 4 ? 'bg-blue-500' : data.analysis.rsiAnalysis.score <= 2 ? 'bg-orange-400' : 'bg-gray-400') : 'bg-gray-200'}"></div>
                {/each}
            </div>

            <p class="font-bold text-sm md:text-lg mb-1 {data.analysis.rsiAnalysis.score >= 4 ? 'text-blue-600' : data.analysis.rsiAnalysis.score <= 2 ? 'text-orange-600' : 'text-gray-700'}">
                {data.analysis.rsiAnalysis.score >= 4 ? '저렴해요' : data.analysis.rsiAnalysis.score <= 2 ? '비싸요' : '적당해요'}
            </p>
            <p class="text-xs md:text-sm text-gray-600 leading-relaxed line-clamp-2">{data.analysis.rsiAnalysis.message}</p>
        </div>

        <!-- MACD Card -->
        <div class="bg-white p-3 md:p-5 rounded-lg shadow-sm border border-gray-200">
            <div class="flex justify-between items-center mb-2 md:mb-3">
                <h3 class="font-bold text-sm md:text-base text-gray-700">MACD (상승 힘)</h3>
                <span class="text-xs md:text-sm font-mono bg-gray-100 px-2 rounded">{data.analysis.macdAnalysis.value.toFixed(2)}</span>
            </div>

            <!-- Score Bar -->
            <div class="flex gap-1 h-1.5 md:h-2 mb-2 md:mb-3">
                {#each Array(5) as _, i}
                    <div class="flex-1 rounded-full {i < data.analysis.macdAnalysis.score ? (data.analysis.macdAnalysis.score >= 4 ? 'bg-red-500' : 'bg-gray-400') : 'bg-gray-200'}"></div>
                {/each}
            </div>

            <p class="font-bold text-sm md:text-lg mb-1 {data.analysis.macdAnalysis.score >= 4 ? 'text-red-600' : data.analysis.macdAnalysis.score <= 2 ? 'text-blue-600' : 'text-gray-700'}">
                {data.analysis.macdAnalysis.score >= 4 ? '강해요' : data.analysis.macdAnalysis.score <= 2 ? '약해요' : '변곡점'}
            </p>
            <p class="text-xs md:text-sm text-gray-600 leading-relaxed line-clamp-2">{data.analysis.macdAnalysis.message}</p>
        </div>

        <!-- Bollinger Band Card -->
        <div class="bg-white p-3 md:p-5 rounded-lg shadow-sm border border-gray-200">
            <div class="flex justify-between items-center mb-2 md:mb-3">
                <h3 class="font-bold text-sm md:text-base text-gray-700">볼린저 밴드</h3>
                <span class="text-[10px] md:text-xs text-gray-500">통계적 범위</span>
            </div>

            <!-- Score Bar -->
            <div class="flex gap-1 h-1.5 md:h-2 mb-2 md:mb-3">
                {#each Array(5) as _, i}
                    <div class="flex-1 rounded-full {i < data.analysis.bbAnalysis.score ? (data.analysis.bbAnalysis.score >= 4 ? 'bg-blue-500' : data.analysis.bbAnalysis.score <= 2 ? 'bg-orange-400' : 'bg-gray-400') : 'bg-gray-200'}"></div>
                {/each}
            </div>

            <p class="font-bold text-sm md:text-lg mb-1 {data.analysis.bbAnalysis.score >= 4 ? 'text-blue-600' : data.analysis.bbAnalysis.score <= 2 ? 'text-orange-600' : 'text-gray-700'}">
                {data.analysis.bbAnalysis.score >= 4 ? '바닥권' : data.analysis.bbAnalysis.score <= 2 ? '천장권' : '중간 지대'}
            </p>
            <p class="text-xs md:text-sm text-gray-600 leading-relaxed line-clamp-2">{data.analysis.bbAnalysis.message}</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Candle Chart -->
  <div class="mb-4 md:mb-8 bg-white p-3 md:p-4 rounded-lg shadow">
    <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 md:mb-4">
        <h2 class="text-base md:text-xl font-bold text-gray-800">주가 차트 (Daily)</h2>
        <div class="flex flex-wrap gap-3 md:gap-4 items-center">
          <div class="flex items-center gap-1.5">
            <div class="w-4 h-0.5 bg-[#2962FF]"></div>
            <span class="text-xs md:text-sm font-medium text-gray-600">SMA 20</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-4 h-0.5 bg-[#FF6D00]"></div>
            <span class="text-xs md:text-sm font-medium text-gray-600">SMA 60</span>
          </div>
          <div class="flex items-center gap-1.5">
            <div class="w-4 h-0.5 border-t-2 border-gray-400 border-dashed"></div>
            <span class="text-xs md:text-sm font-medium text-gray-600">Bollinger Bands</span>
          </div>
        </div>
    </div>
    <!-- Chart Container -->
    <div class="h-[280px] md:h-[400px] w-full" bind:this={candleChartContainer}></div>
  </div>

  <!-- MACD Chart -->
  <div class="mb-4 md:mb-8 bg-white p-3 md:p-4 rounded-lg shadow">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3 md:mb-4">
        <div class="flex flex-wrap items-center gap-2 md:gap-3">
          <h2 class="text-base md:text-xl font-bold text-gray-800">MACD (추세 강도)</h2>
          <div class="flex flex-wrap gap-3 md:gap-4 items-center">
            <div class="flex items-center gap-1.5">
              <div class="w-4 h-0.5 bg-[#2962FF]"></div>
              <span class="text-xs md:text-sm font-medium text-gray-600">MACD</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="w-4 h-0.5 bg-[#FF6D00]"></div>
              <span class="text-xs md:text-sm font-medium text-gray-600">Signal</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="w-3 h-3 bg-[#26a69a] opacity-50"></div>
              <span class="text-xs md:text-sm font-medium text-gray-600">Histogram</span>
            </div>
          </div>
        </div>
        {#if data.indicators?.macd}
          {@const latestMacd = data.indicators.macd[data.indicators.macd.length - 1]}
          {#if latestMacd && latestMacd.histogram !== null}
            <span class="px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-sm font-bold
              {latestMacd.histogram > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
              {latestMacd.histogram > 0 ? 'Bullish' : 'Bearish'} ({(latestMacd.histogram).toFixed(2)})
            </span>
          {/if}
        {/if}
    </div>
    <div class="h-[150px] md:h-[200px] w-full" bind:this={macdChartContainer}></div>
  </div>

  <!-- RSI Chart -->
  <div class="mb-4 md:mb-8 bg-white p-3 md:p-4 rounded-lg shadow">
    <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 md:mb-4">
        <h2 class="text-base md:text-xl font-bold text-gray-800">RSI (과열/침체)</h2>
        {#if data.analysis?.rsiStatus}
            <span class="px-2 md:px-3 py-0.5 md:py-1 rounded-full text-xs md:text-sm font-bold
                {data.analysis.rsiStatus === 'OVERSOLD' ? 'bg-green-100 text-green-700' :
                 data.analysis.rsiStatus === 'OVERBOUGHT' ? 'bg-red-100 text-red-700' :
                 'bg-gray-100 text-gray-700'}">
                {data.analysis.rsiStatus === 'OVERSOLD' ? '🔥 과매도' :
                 data.analysis.rsiStatus === 'OVERBOUGHT' ? '⚠️ 과매수' :
                 '중립'}
            </span>
        {/if}
    </div>

    <div class="h-48 md:h-64">
      <canvas bind:this={chartCanvas}></canvas>
    </div>

    <div class="mt-3 md:mt-4 p-2 md:p-3 bg-gray-50 rounded-lg text-xs md:text-sm text-gray-600 space-y-1.5 md:space-y-2">
      <div class="flex gap-2 items-center">
         <span class="font-bold text-gray-600">현재 RSI:</span>
         <span class="font-bold text-base md:text-lg text-gray-900">{data.analysis?.rsi.toFixed(1)}</span>
      </div>
      <div class="text-gray-700 font-medium bg-white p-2 rounded border border-gray-100 text-xs md:text-sm">
         💡 {getRsiAdvice(data.analysis?.rsi ?? 50)}
      </div>
    </div>
  </div>

  <!-- Daily Candles -->
  <div class="mt-4 md:mt-8">
    <section class="bg-white rounded-lg shadow overflow-hidden">
      <div class="bg-blue-600 px-3 md:px-4 py-2 md:py-3 flex justify-between items-center">
        <h2 class="text-sm md:text-lg font-semibold text-white">일봉 데이터 ({data.currentSource.toUpperCase()})</h2>
        <span class="text-[10px] md:text-xs text-blue-100 bg-blue-700 px-1.5 md:px-2 py-0.5 md:py-1 rounded">최근 30일</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs md:text-sm text-left">
          <thead class="bg-gray-50 text-gray-500 font-medium border-b">
            <tr>
              <th class="px-2 md:px-4 py-2">날짜</th>
              <th class="px-2 md:px-4 py-2 text-right">종가</th>
              <th class="px-2 md:px-4 py-2 text-right">변동률</th>
              <th class="px-2 md:px-4 py-2 text-right hidden sm:table-cell">거래량</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each data.dailyCandles as candle}
              <tr class="hover:bg-gray-50">
                <td class="px-2 md:px-4 py-1.5 md:py-2 whitespace-nowrap">{new Date(candle.candle_time).toLocaleDateString()}</td>
                <td class="px-2 md:px-4 py-1.5 md:py-2 text-right">
                  <div>${Number(candle.close_price).toFixed(2)}</div>
                  <div class="text-[10px] md:text-xs text-gray-400 hidden sm:block">₩{(Number(candle.close_price) * EXCHANGE_RATE).toLocaleString()}</div>
                </td>
                <td class="px-2 md:px-4 py-1.5 md:py-2 text-right font-medium {(candle.change_percent ?? 0) > 0 ? 'text-green-600' : (candle.change_percent ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}">
                  {candle.change_percent !== null ? ((candle.change_percent > 0 ? '+' : '') + Number(candle.change_percent).toFixed(2) + '%') : '-'}
                </td>
                <td class="px-2 md:px-4 py-1.5 md:py-2 text-right hidden sm:table-cell">
                  <div>{Number(candle.volume).toLocaleString()}</div>
                  <div class="text-[10px] md:text-xs font-medium {(candle.volume_change_percent ?? 0) > 0 ? 'text-green-600' : (candle.volume_change_percent ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}">
                    {candle.volume_change_percent !== null ? ((candle.volume_change_percent > 0 ? '+' : '') + Number(candle.volume_change_percent).toFixed(1) + '%') : '-'}
                  </div>
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="4" class="px-4 py-4 text-center text-gray-400">데이터가 없습니다.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>