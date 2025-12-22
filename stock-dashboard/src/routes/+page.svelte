<svelte:head>
	<title>Stock Dashboard</title>
</svelte:head>

<div class="flex flex-col items-center justify-center h-full text-center">
	<div class="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-md">
		<h1 class="text-2xl font-bold text-gray-800 mb-2">Welcome to Stock Dashboard</h1>
		<p class="text-gray-600 mb-6">
			Select a ticker from the sidebar to view collected price data.
		</p>
		<div class="text-sm text-gray-400">
			<p>Data Source: PostgreSQL</p>
			<p>Candles: Daily & 60-Min</p>
		</div>
	</div>
</div>