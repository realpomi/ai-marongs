<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  let { data } = $props();

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
    <div class="flex items-baseline gap-4">
      <h1 class="text-3xl font-bold text-gray-900">{data.ticker?.symbol}</h1>
      <span class="text-xl text-gray-600">{data.ticker?.name}</span>
      <span class="text-sm px-2 py-1 bg-gray-200 rounded-full text-gray-700">{data.ticker?.exchange}</span>
    </div>
  </div>

  <!-- Source Selection Tabs -->
  <div class="mb-6">
    <div class="border-b border-gray-200">
      <nav class="-mb-px flex space-x-8" aria-label="Tabs">
        <button
          onclick={() => changeSource('kis')}
          class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {data.currentSource === 'kis' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          Korea Investment (KIS)
        </button>
        <button
          onclick={() => changeSource('yf')}
          class="whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm {data.currentSource === 'yf' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}"
        >
          Yahoo Finance (YF)
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
        <h2 class="text-lg font-semibold text-white">Daily Data ({data.currentSource.toUpperCase()})</h2>
        <span class="text-xs text-blue-100 bg-blue-700 px-2 py-1 rounded">Last 30</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-500 font-medium border-b">
            <tr>
              <th class="px-4 py-2">Date</th>
              <th class="px-4 py-2 text-right">Close</th>
              <th class="px-4 py-2 text-right">Volume</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each data.dailyCandles as candle}
              <tr class="hover:bg-gray-50">
                <td class="px-4 py-2 whitespace-nowrap">{new Date(candle.candle_time).toLocaleDateString()}</td>
                <td class="px-4 py-2 text-right">${Number(candle.close_price).toFixed(2)}</td>
                <td class="px-4 py-2 text-right">{Number(candle.volume).toLocaleString()}</td>
              </tr>
            {:else}
              <tr>
                <td colspan="3" class="px-4 py-4 text-center text-gray-400">No daily data available for {data.currentSource.toUpperCase()}.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>

    <!-- Hourly Candles -->
    <section class="bg-white rounded-lg shadow overflow-hidden">
      <div class="bg-indigo-600 px-4 py-3 flex justify-between items-center">
        <h2 class="text-lg font-semibold text-white">60-Minute Data ({data.currentSource.toUpperCase()})</h2>
        <span class="text-xs text-indigo-100 bg-indigo-700 px-2 py-1 rounded">Last 30</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 text-gray-500 font-medium border-b">
            <tr>
              <th class="px-4 py-2">Time</th>
              <th class="px-4 py-2 text-right">Close</th>
              <th class="px-4 py-2 text-right">Volume</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each data.hourlyCandles as candle}
              <tr class="hover:bg-gray-50 {isToday(candle.candle_time) ? 'bg-yellow-50 font-medium text-gray-900' : ''}">
                <td class="px-4 py-2 whitespace-nowrap">{formatDate(candle.candle_time)}</td>
                <td class="px-4 py-2 text-right">${Number(candle.close_price).toFixed(2)}</td>
                <td class="px-4 py-2 text-right">{Number(candle.volume).toLocaleString()}</td>
              </tr>
            {:else}
              <tr>
                <td colspan="3" class="px-4 py-4 text-center text-gray-400">No hourly data available for {data.currentSource.toUpperCase()}.</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
</div>
