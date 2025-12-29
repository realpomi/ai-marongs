<script lang="ts">
	import { onMount } from 'svelte';
	import type { TickerSignalRecord } from '$lib/server/repositories/signal.repository';

	let recommendations = $state<TickerSignalRecord[]>([]);
	let watchlist = $state<TickerSignalRecord[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	async function fetchSignals() {
		isLoading = true;
		try {
			const res = await fetch('/api/signals/ranking');
			const result = await res.json();
			if (result.success) {
				// Handle both new object format and potential backward compatibility or empty states
				if (Array.isArray(result.data)) {
					recommendations = result.data; // Fallback if API returns array
				} else {
					recommendations = result.data.recommendations || [];
					watchlist = result.data.watchlist || [];
				}
			} else {
				error = result.error;
			}
		} catch (e) {
			error = '데이터를 불러오는데 실패했습니다.';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchSignals();
	});

	function getGradeColor(score: number) {
		if (score >= 5) return 'text-yellow-400';
		if (score >= 4) return 'text-orange-400';
		if (score >= 3) return 'text-blue-400';
		return 'text-gray-400';
	}
</script>

<div class="bg-gray-900 text-white rounded-2xl p-6 shadow-2xl border border-gray-800 w-full max-w-2xl overflow-hidden relative">
	<!-- Subtle background gradient -->
	<div class="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
	<div class="absolute bottom-0 left-0 w-64 h-64 bg-green-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

	<div class="flex justify-between items-center mb-6 relative z-10">
		<div>
			<h2 class="text-xl font-bold text-gray-100 flex items-center gap-2">
				<span class="text-2xl">⚡️</span> 시장 분석 리포트
			</h2>
			<p class="text-xs text-gray-400 mt-1">
				알고리즘 기반 매수 추천 및 관심 종목
			</p>
		</div>
		<button 
			onclick={fetchSignals}
			class="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-700 transition-all flex items-center gap-1.5 text-gray-300 hover:text-white"
		>
			<span class={isLoading ? 'animate-spin' : ''}>↻</span> 새로고침
		</button>
	</div>

	{#if isLoading && recommendations.length === 0 && watchlist.length === 0}
		<div class="flex flex-col items-center justify-center py-16 gap-3">
			<div class="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
			<p class="text-sm text-gray-500">데이터 분석 중...</p>
		</div>
	{:else if error}
		<div class="bg-red-900/20 border border-red-500/30 p-4 rounded-xl text-center text-red-300 text-sm">
			{error}
		</div>
	{:else}
		<div class="space-y-8 relative z-10">
			<!-- Section 1: Recommendations (Lv.4+) -->
			<div>
				<h3 class="text-sm font-bold text-yellow-400 mb-3 flex items-center gap-2">
					<span>🚀</span> 진입 추천 (Strong Buy)
				</h3>
				
				{#if recommendations.length === 0}
					<div class="text-center py-8 border border-dashed border-gray-700 rounded-xl bg-gray-800/30">
						<p class="text-gray-500 text-sm">현재 강력한 매수 신호가 없습니다.</p>
					</div>
				{:else}
					<div class="grid gap-3">
						{#each recommendations as item}
							{@const scoreColor = getGradeColor(item.score)}
							<a 
								href="/ticker/{item.symbol}"
								class="group block bg-gray-800/60 hover:bg-gray-700/80 p-4 rounded-xl border border-yellow-500/20 hover:border-yellow-500/50 transition-all hover:-translate-y-0.5 shadow-lg shadow-black/20"
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<div>
											<div class="flex items-center gap-2">
												<span class="font-bold text-lg tracking-tight group-hover:text-yellow-400 transition-colors">
													{item.symbol}
												</span>
												<span class="text-xs font-mono text-gray-400">
													${Number(item.current_price).toLocaleString()}
												</span>
											</div>
											<div class="flex gap-1.5 mt-1">
												<span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-300 border border-yellow-800/30 font-bold">
													Lv.{item.signal_level} {item.signal_keyword}
												</span>
											</div>
										</div>
									</div>

									<div class="text-right">
										<div class="text-xs text-gray-400 mb-1">Score</div>
										<div class="flex items-center justify-end gap-2">
											<div class="flex gap-0.5">
												{#each Array(5) as _, j}
													<div class="w-1.5 h-1.5 rounded-full {j < item.score ? scoreColor : 'bg-gray-700'}"></div>
												{/each}
											</div>
											<span class="font-bold text-lg {scoreColor}">{item.score}</span>
										</div>
									</div>
								</div>
								
								<div class="mt-3 pt-3 border-t border-gray-700/50 flex items-start gap-2">
									<span class="text-yellow-400 text-xs">💡</span>
									<p class="text-xs text-gray-400 line-clamp-1 group-hover:text-gray-300 transition-colors">
										{item.signal_message}
									</p>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Section 2: Watchlist (Lv.3 + Score>=3) -->
			<div>
				<h3 class="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
					<span>👀</span> 관심 종목 (Watchlist)
				</h3>
				
				{#if watchlist.length === 0}
					<div class="text-center py-6 border border-dashed border-gray-700 rounded-xl bg-gray-800/30">
						<p class="text-gray-500 text-sm">관심 종목이 없습니다.</p>
					</div>
				{:else}
					<div class="grid gap-2">
						{#each watchlist as item}
							{@const scoreColor = getGradeColor(item.score)}
							<a 
								href="/ticker/{item.symbol}"
								class="group block bg-gray-800/40 hover:bg-gray-700/60 p-3 rounded-lg border border-gray-700/50 hover:border-blue-500/30 transition-all hover:pl-4"
							>
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<span class="font-bold text-base text-gray-300 group-hover:text-blue-300 transition-colors">
											{item.symbol}
										</span>
										<span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
											Lv.{item.signal_level} {item.signal_keyword}
										</span>
									</div>
									
									<div class="flex items-center gap-3">
										<span class="text-xs font-mono text-gray-500">${Number(item.current_price).toLocaleString()}</span>
										<div class="flex items-center gap-1.5">
											<span class="text-xs text-gray-500">Score</span>
											<span class="font-bold text-sm {scoreColor}">{item.score}</span>
										</div>
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-gray-600 group-hover:text-blue-400">
											<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
										</svg>
									</div>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
	
	<div class="mt-6 pt-4 border-t border-gray-800 text-[10px] text-gray-600 flex justify-between items-center font-mono">
		<span>AI MARKET ANALYZER</span>
		<span>
			Last updated: 
			{recommendations.length > 0 ? new Date(recommendations[0].signal_date).toLocaleDateString() : 
			 watchlist.length > 0 ? new Date(watchlist[0].signal_date).toLocaleDateString() : 'N/A'}
		</span>
	</div>
</div>
