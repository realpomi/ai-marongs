<script lang="ts">
  import './layout.css';
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/state';

  let { children, data } = $props();
  let showModal = $state(false);
  let isEditMode = $state(false);
  let sidebarOpen = $state(false);
  let symbol = $state('');
  let exchange = $state('NAS');
  let name = $state('');
  let loading = $state(false);
  let error = $state('');

  function openAddModal() {
    isEditMode = false;
    symbol = '';
    exchange = 'NAS';
    name = '';
    error = '';
    showModal = true;
  }

  function openEditModal(ticker: { symbol: string; exchange: string; name: string | null }) {
    isEditMode = true;
    symbol = ticker.symbol;
    exchange = ticker.exchange;
    name = ticker.name || '';
    error = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    error = '';
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!symbol.trim()) {
      error = '심볼을 입력해주세요';
      return;
    }
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.trim(), exchange, name: name.trim() || undefined })
      });
      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to save ticker');
      closeModal();
      invalidateAll();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save ticker';
    } finally {
      loading = false;
    }
  }
</script>

<div class="flex h-screen bg-gray-100 font-sans">
  <!-- Mobile Header -->
  <div class="md:hidden fixed top-0 left-0 right-0 bg-white shadow-md z-40 flex items-center justify-between px-4 py-3">
    <button
      onclick={() => sidebarOpen = !sidebarOpen}
      type="button"
      class="p-2 rounded-md text-gray-600 hover:bg-gray-100"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
    <h1 class="text-lg font-bold text-gray-800">
      <a href="/">Stock Dashboard</a>
    </h1>
    <button
      onclick={openAddModal}
      type="button"
      class="w-8 h-8 flex items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 text-lg font-bold"
      title="티커 추가"
    >
      +
    </button>
  </div>

  <!-- Mobile Overlay -->
  {#if sidebarOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="md:hidden fixed inset-0 bg-black/50 z-40"
      onclick={() => sidebarOpen = false}
    ></div>
  {/if}

  <!-- Sidebar -->
  <aside class="fixed md:static inset-y-0 left-0 z-50 w-64 bg-white shadow-md flex flex-col transform transition-transform duration-200 ease-in-out {sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0">
    <div class="p-4 border-b">
      <h1 class="text-xl font-bold text-gray-800">
        <a href="/" onclick={() => sidebarOpen = false}>Stock Dashboard</a>
      </h1>
    </div>
    <nav class="flex-1 overflow-y-auto p-4">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Registered Tickers
        </h2>
        <button
          onclick={openAddModal}
          type="button"
          class="w-6 h-6 flex items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors text-sm font-bold"
          title="티커 추가"
        >
          +
        </button>
      </div>
      <ul class="space-y-1">
        {#each data.tickers as ticker}
          <li class="group flex items-center">
            <a
              href="/ticker/{ticker.symbol}"
              onclick={() => sidebarOpen = false}
              class="flex-1 block px-3 py-2 rounded-md text-sm transition-colors {page.url.pathname === `/ticker/${ticker.symbol}` ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'}"
            >
              <span class="font-medium">{ticker.symbol}</span>
              <span class="text-xs {page.url.pathname === `/ticker/${ticker.symbol}` ? 'text-blue-500' : 'text-gray-400'} ml-1 truncate">{ticker.name}</span>
            </a>
            <button
              onclick={() => openEditModal(ticker as { symbol: string; exchange: string; name: string | null })}
              type="button"
              class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-opacity"
              title="수정"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </li>
        {:else}
          <li class="text-sm text-gray-400">No tickers found.</li>
        {/each}
      </ul>
    </nav>
    <div class="p-4 border-t text-xs text-center text-gray-400">
      AI Marongs © 2025
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto p-4 md:p-8 pt-16 md:pt-8 md:ml-0">
    {@render children()}
  </main>
</div>

{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 flex items-center justify-center"
    style="background-color: rgba(0,0,0,0.5); z-index: 9999;"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
  >
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
      <div class="flex items-center justify-between p-4 border-b">
        <h2 class="text-lg font-semibold text-gray-800">{isEditMode ? '티커 수정' : '티커 추가'}</h2>
        <button onclick={closeModal} class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <form onsubmit={handleSubmit} class="p-4 space-y-4">
        {#if error}
          <div class="bg-red-50 text-red-600 px-3 py-2 rounded text-sm">{error}</div>
        {/if}
        <div>
          <label for="symbol" class="block text-sm font-medium text-gray-700 mb-1">심볼 <span class="text-red-500">*</span></label>
          <input id="symbol" type="text" bind:value={symbol} placeholder="AAPL, NVDA, TSLA..." class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" disabled={loading || isEditMode} />
        </div>
        <div>
          <label for="exchange" class="block text-sm font-medium text-gray-700 mb-1">거래소</label>
          <select id="exchange" bind:value={exchange} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={loading}>
            <option value="NAS">NASDAQ (NAS)</option>
            <option value="NYS">NYSE (NYS)</option>
            <option value="AMS">AMEX (AMS)</option>
          </select>
        </div>
        <div>
          <label for="ticker-name" class="block text-sm font-medium text-gray-700 mb-1">회사명 (선택)</label>
          <input id="ticker-name" type="text" bind:value={name} placeholder="Apple Inc." class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={loading} />
        </div>
        <div class="flex gap-3 pt-2">
          <button type="button" onclick={closeModal} class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50" disabled={loading}>취소</button>
          <button type="submit" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50" disabled={loading}>{loading ? '저장 중...' : '저장'}</button>
        </div>
      </form>
      {#if !isEditMode}
        <div class="px-4 pb-4 text-xs text-gray-500">* 티커 추가 후 데이터 수집: <code class="bg-gray-100 px-1 rounded">make update SYMBOL=XXX</code></div>
      {/if}
    </div>
  </div>
{/if}