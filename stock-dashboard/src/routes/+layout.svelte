<script lang="ts">
  import './layout.css';
  let { children, data } = $props();
</script>

<div class="flex h-screen bg-gray-100 font-sans">
  <!-- Sidebar -->
  <aside class="w-64 bg-white shadow-md flex flex-col">
    <div class="p-4 border-b">
      <h1 class="text-xl font-bold text-gray-800">
        <a href="/">Stock Dashboard</a>
      </h1>
    </div>
    <nav class="flex-1 overflow-y-auto p-4">
      <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Registered Tickers
      </h2>
      <ul class="space-y-1">
        {#each data.tickers as ticker}
          <li>
            <a
              href="/ticker/{ticker.symbol}"
              class="block px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
            >
              <span class="font-medium">{ticker.symbol}</span>
              <span class="text-xs text-gray-400 ml-1 truncate">{ticker.name}</span>
            </a>
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
  <main class="flex-1 overflow-y-auto p-8">
    {@render children()}
  </main>
</div>