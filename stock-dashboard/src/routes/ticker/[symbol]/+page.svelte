<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  let { data } = $props();
  
  const EXCHANGE_RATE = 1500;

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString();
  }

  function isToday(dateString: string) {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  function changeSource(source: string) {
    const url = new URL($page.url);
    url.searchParams.set('source', source);
    goto(url.toString());
  }
</script>

<div class="max-w-4xl mx-auto">
  <div class="mb-8 border-b pb-4">
    <div class="flex flex-col gap-2">
      <div class="flex items-baseline gap-4">
        <h1 class="text-3xl font-bold text-gray-900">{data.ticker?.symbol}</h1>
        <span class="text-xl text-gray-600">{data.ticker?.name}</span>
        <span class="text-sm px-2 py-1 bg-gray-200 rounded-full text-gray-700">{data.ticker?.exchange}</span>
      </div>
      <div class="text-sm text-gray-500">
        * 원화 가격은 ₩{EXCHANGE_RATE.toLocaleString()} / $1 기준입니다.
      </div>
    </div>
  </div>

  <!-- Analysis Stats -->
  {#if data.analysis}
    <div class="mb-8">
      <div class="flex items-center gap-3 mb-4">
        <h2 class="text-xl font-bold text-gray-800">눌림목 분석 지표</h2>
        <span class="px-3 py-1 rounded-full text-sm font-bold {data.analysis.score === 5 ? 'bg-green-100 text-green-700' : data.analysis.score >= 3 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}">
          종합 점수: {data.analysis.score}/5
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Trend Card -->
        <div class="bg-white p-4 rounded-lg shadow border-l-4 {data.analysis.trendStatus === 'pass' ? 'border-l-green-500' : 'border-l-red-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-2">
            <span class="text-sm text-gray-500 font-medium">시장 추세</span>
            <span>{data.analysis.trendStatus === 'pass' ? '✅' : '❌'}</span>
          </div>
          <div>
            <div class="font-bold text-lg {data.analysis.trendStatus === 'pass' ? 'text-green-700' : 'text-red-700'}">
              {data.analysis.trend === 'UP' ? '상승 추세' : '하락 추세'}
            </div>
            <div class="text-xs text-gray-500 mt-1">
              MA20 {data.analysis.trend === 'UP' ? '>' : '<'} MA60
            </div>
          </div>
          {#if data.analysis.ma20 && data.analysis.ma60}
            <div class="mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400 space-y-1">
               <div class="flex justify-between"><span>20일 이평</span> <span>${data.analysis.ma20.toFixed(2)}</span></div>
               <div class="flex justify-between"><span>60일 이평</span> <span>${data.analysis.ma60.toFixed(2)}</span></div>
            </div>
          {/if}
        </div>

        <!-- Pullback Card -->
        <div class="bg-white p-4 rounded-lg shadow border-l-4 {data.analysis.pullbackStatus === 'pass' ? 'border-l-green-500' : data.analysis.pullbackStatus === 'warning' ? 'border-l-yellow-500' : 'border-l-red-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-2">
            <span class="text-sm text-gray-500 font-medium">눌림 폭 (2주 고점)</span>
            <span>{data.analysis.pullbackStatus === 'pass' ? '✅' : data.analysis.pullbackStatus === 'warning' ? '⚠️' : '❌'}</span>
          </div>
          <div>
            <div class="font-bold text-lg {data.analysis.pullbackStatus === 'pass' ? 'text-green-700' : data.analysis.pullbackStatus === 'warning' ? 'text-yellow-700' : 'text-red-700'}">
              {data.analysis.pullbackRate.toFixed(1)}% 하락
            </div>
            <div class="text-xs text-gray-500 mt-1">
              목표: 5% ~ 15%
              <br>
              <span class="font-medium">
                {data.analysis.pullbackStatus === 'pass' ? '적정 조정 폭' : data.analysis.pullbackStatus === 'warning' ? '조정 부족' : '과도한 하락'}
              </span>
            </div>
          </div>
        </div>

        <!-- Volume Ratio Card -->
        <div class="bg-white p-4 rounded-lg shadow border-l-4 {data.analysis.volumeStatus === 'pass' ? 'border-l-green-500' : 'border-l-red-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-2">
            <span class="text-sm text-gray-500 font-medium">거래량 비율</span>
            <span>{data.analysis.volumeStatus === 'pass' ? '✅' : '❌'}</span>
          </div>
          <div>
            <div class="font-bold text-lg {data.analysis.volumeStatus === 'pass' ? 'text-green-700' : 'text-red-700'}">
              {data.analysis.volumeRatio.toFixed(2)}배
            </div>
            <div class="text-xs text-gray-500 mt-1">
              목표: 1.0배 미만 (거래량 감소)
              <br>
              <span class="font-medium">{data.analysis.volumeStatus === 'pass' ? '매도세 약화' : '매도세 강함'}</span>
            </div>
          </div>
        </div>

        <!-- Timing Card (Duration & Consolidation) -->
        <div class="bg-white p-4 rounded-lg shadow border-l-4 {data.analysis.durationStatus === 'pass' && data.analysis.consolidationStatus === 'pass' ? 'border-l-green-500' : 'border-l-orange-500'} border-t border-r border-b border-gray-100 flex flex-col justify-between">
          <div class="flex justify-between items-start mb-2">
            <span class="text-sm text-gray-500 font-medium">조정 타이밍</span>
            <span>{data.analysis.durationStatus === 'pass' && data.analysis.consolidationStatus === 'pass' ? '✅' : '⚠️'}</span>
          </div>
          <div>
            <div class="flex justify-between items-center mb-1">
              <span class="text-xs text-gray-500">기간 ({data.analysis.daysSinceHigh}일)</span>
              <span class="text-xs font-bold {data.analysis.durationStatus === 'pass' ? 'text-green-600' : 'text-red-600'}">{data.analysis.durationStatus === 'pass' ? '적정' : '부적합'}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-gray-500">지지 (5일)</span>
              <span class="text-xs font-bold {data.analysis.consolidationStatus === 'pass' ? 'text-green-600' : 'text-red-600'}">{data.analysis.consolidationStatus === 'pass' ? '횡보중' : '불안정'}</span>
            </div>
            
            <div class="mt-2 text-sm text-gray-700">
               최근 변동폭 <span class="font-bold">{data.analysis.consolidationRate.toFixed(1)}%</span>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-gray-50 text-xs text-gray-400 space-y-1">
             <div class="flex justify-between"><span>2주 고점</span> <span>${data.analysis.high2w.toFixed(2)}</span></div>
             <div class="flex justify-between"><span>52주 고점</span> <span>${data.analysis.high52w.toFixed(2)}</span></div>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Source Selection Tabs -->
  <div class="mb-6">
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        <button
          onclick={() => changeSource('kis')}
          class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {data.currentSource === 'kis' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          한국투자증권 (KIS)
        </button>
        <button
          onclick={() => changeSource('yf')}
          class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {data.currentSource === 'yf' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          야후 파이낸스 (YF)
        </button>
        <button
          onclick={() => changeSource('tiingo')}
          class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {data.currentSource === 'tiingo' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          Tiingo
        </button>
      </nav>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Daily Candles -->
    <section class="bg-white rounded-lg shadow overflow-hidden">
      <div class="bg-blue-600 px-4 py-3 flex justify-between items-center">
        <h2 class="text-lg font-semibold text-white">일봉 데이터 ({data.currentSource.toUpperCase()})</h2>
        <span class="text-xs text-blue-100 bg-blue-700 px-2 py-1 rounded">최근 30일</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-500 font-medium border-b">
            <tr>
              <th class="px-4 py-2">날짜</th>
              <th class="px-4 py-2 text-right">종가</th>
              <th class="px-4 py-2 text-right">변동률</th>
              <th class="px-4 py-2 text-right">거래량</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each data.dailyCandles as candle}
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-2 whitespace-nowrap">{new Date(candle.candle_time).toLocaleDateString()}</td>
                <td class="px-4 py-2 text-right">
                  <div>${Number(candle.close_price).toFixed(2)}</div>
                  <div class="text-xs text-gray-400">₩{(Number(candle.close_price) * EXCHANGE_RATE).toLocaleString()}</div>
                </td>
                <td class="px-4 py-2 text-right font-medium {(candle.change_percent ?? 0) > 0 ? 'text-green-600' : (candle.change_percent ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}">
                  {candle.change_percent !== null ? ((candle.change_percent > 0 ? '+' : '') + Number(candle.change_percent).toFixed(2) + '%') : '-'}
                </td>
                <td class="px-4 py-2 text-right">
                  <div>{Number(candle.volume).toLocaleString()}</div>
                  <div class="text-xs font-medium {(candle.volume_change_percent ?? 0) > 0 ? 'text-green-600' : (candle.volume_change_percent ?? 0) < 0 ? 'text-red-600' : 'text-gray-500'}">
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

    <!-- Hourly Candles -->
    <section class="bg-white rounded-lg shadow overflow-hidden">
      <div class="bg-indigo-600 px-4 py-3 flex justify-between items-center">
        <h2 class="text-lg font-semibold text-white">60분봉 데이터 ({data.currentSource.toUpperCase()})</h2>
        <span class="text-xs text-indigo-100 bg-indigo-700 px-2 py-1 rounded">최근 30개</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-500 font-medium border-b">
            <tr>
              <th class="px-4 py-2">시간</th>
              <th class="px-4 py-2 text-right">종가</th>
              <th class="px-4 py-2 text-right">거래량</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each data.hourlyCandles as candle}
              <tr class="hover:bg-gray-50 {isToday(candle.candle_time) ? 'bg-yellow-50 font-medium text-gray-900' : ''}">
                <td class="px-4 py-2 whitespace-nowrap">{formatDate(candle.candle_time)}</td>
                <td class="px-4 py-2 text-right">
                  <div>${Number(candle.close_price).toFixed(2)}</div>
                  <div class="text-xs text-gray-400">₩{(Number(candle.close_price) * EXCHANGE_RATE).toLocaleString()}</div>
                </td>
                <td class="px-4 py-2 text-right">{Number(candle.volume).toLocaleString()}</td>
              </tr>
            {:else}
              <tr>
                <td colspan="3" class="px-4 py-4 text-center text-gray-400">데이터가 없습니다.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>
