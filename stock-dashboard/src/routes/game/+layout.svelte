<script>
	let { children } = $props();
</script>

<div class="game-layout">
	{@render children()}
</div>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
	}

	.game-layout {
		position: fixed;
		inset: 0;
		z-index: 9999;
		background: #1a1a2e;
	}

	.game-layout :global(.flex.h-screen) {
		display: none !important;
	}
</style>
