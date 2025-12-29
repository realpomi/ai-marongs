<script lang="ts">
	import RecommendationList from '$lib/components/RecommendationList.svelte';

	let isAnalyzing = $state(false);
	let isCollecting = $state(false);
	let lastResult = $state<{
		success: boolean;
		analyzed?: number;
		failed?: number;
		strongBuySignals?: string[];
		error?: string;
		skipped?: boolean;
	} | null>(null);

	async function runAnalyze() {
		if (isAnalyzing) return;
		isAnalyzing = true;
		lastResult = null;

		try {
			const res = await fetch('/api/signals/analyze', { method: 'POST' });
			lastResult = await res.json();
		} catch (e) {
			lastResult = { success: false, error: e instanceof Error ? e.message : String(e) };
		} finally {
			isAnalyzing = false;
		}
	}

	async function runCollectAndAnalyze() {
		if (isCollecting) return;
		isCollecting = true;
		lastResult = null;

		try {
			const res = await fetch('/api/scheduler', { method: 'POST' });
			const data = await res.json();
			lastResult = {
				success: data.success,
				analyzed: data.totalTickers,
				error: data.error
			};
		} catch (e) {
			lastResult = { success: false, error: e instanceof Error ? e.message : String(e) };
		} finally {
			isCollecting = false;
		}
	}
</script>

<svelte:head>
	<title>Stock Dashboard</title>
</svelte:head>

<div class="flex flex-col items-center justify-center min-h-full py-10 text-center gap-10">
	<!-- Top Ranking Section -->
	<RecommendationList />

	<!-- Signal Analysis Section -->
	<div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200 w-full max-w-lg">
		<h2 class="text-lg font-bold text-gray-800 mb-4">Signal Analysis</h2>

		<div class="flex gap-3 justify-center mb-4">
			<button
				onclick={runAnalyze}
				disabled={isAnalyzing || isCollecting}
				class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
			>
				{#if isAnalyzing}
					<span class="animate-spin">⏳</span> 분석 중...
				{:else}
					📊 시그널 분석 실행
				{/if}
			</button>
		</div>

		<p class="text-xs text-gray-500 mb-4">
			* 시그널 분석: 기존에 수집된 데이터를 바탕으로 종목별 진입 시그널을 계산합니다.
		</p>

		{#if lastResult}
			<div class="mt-4 p-4 rounded-lg {lastResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
				{#if lastResult.skipped}
					<p class="text-yellow-700 font-medium">이미 분석이 진행 중입니다.</p>
				{:else if lastResult.success}
					<p class="text-green-700 font-medium">완료!</p>
					{#if lastResult.analyzed !== undefined}
						<p class="text-sm text-green-600">분석: {lastResult.analyzed}개 / 실패: {lastResult.failed || 0}개</p>
					{/if}
					{#if lastResult.strongBuySignals && lastResult.strongBuySignals.length > 0}
						<p class="text-sm text-green-800 mt-2 font-bold">
							🔥 매수 시그널: {lastResult.strongBuySignals.join(', ')}
						</p>
					{/if}
				{:else}
					<p class="text-red-700 font-medium">실패</p>
					{#if lastResult.error}
						<p class="text-sm text-red-600">{lastResult.error}</p>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>