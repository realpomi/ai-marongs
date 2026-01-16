<script>
	import { onMount } from 'svelte';

	let gameContainer;

	function updateScale() {
		if (!gameContainer) return;
		const gameWidth = 360;
		const gameHeight = 640;
		const padding = 20;

		const scaleX = (window.innerWidth - padding) / gameWidth;
		const scaleY = (window.innerHeight - padding) / gameHeight;
		const scale = Math.min(scaleX, scaleY, 1); // 최대 1배율

		gameContainer.style.transform = `scale(${scale})`;
	}

	onMount(async () => {
		updateScale();
		window.addEventListener('resize', updateScale);

		// Matter.js 로드
		const script = document.createElement('script');
		script.src = 'https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js';
		script.onload = async () => {
			// game.js 로드
			const gameScript = document.createElement('script');
			gameScript.src = '/game/game.js';
			document.body.appendChild(gameScript);
		};
		document.body.appendChild(script);

		return () => {
			window.removeEventListener('resize', updateScale);
		};
	});
</script>

<svelte:head>
	<title>Sling - Puzzle Ball Game</title>
</svelte:head>

<div class="game-wrapper">
	<div id="game-container" bind:this={gameContainer}>
		<canvas id="game"></canvas>
		<div id="ui">
			<div id="stage-info">Stage <span id="stage-num">1</span> | Attempts: <span id="attempts">0</span></div>
		</div>
		<div id="message"></div>
		<button id="restart-btn">Restart</button>
	</div>
</div>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		overflow: hidden;
		height: 100%;
		width: 100%;
	}

	.game-wrapper {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100dvh;
		width: 100vw;
		background: #1a1a2e;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		overflow: hidden;
		position: fixed;
		top: 0;
		left: 0;
		touch-action: none;
	}

	#game-container {
		position: relative;
		width: 360px;
		height: 640px;
		transform-origin: center center;
	}

	#game-container :global(canvas) {
		display: block;
		border-radius: 8px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
	}

	#ui {
		position: absolute;
		top: 10px;
		left: 10px;
		color: white;
		font-size: 16px;
		z-index: 10;
	}

	#stage-info {
		background: rgba(0, 0, 0, 0.5);
		padding: 8px 16px;
		border-radius: 4px;
	}

	#message {
		position: absolute;
		top: 40%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: rgba(0, 0, 0, 0.8);
		color: #4ade80;
		padding: 20px 40px;
		border-radius: 8px;
		font-size: 24px;
		font-weight: bold;
		display: none;
		z-index: 10;
	}

	#restart-btn {
		position: absolute;
		bottom: 80px;
		left: 50%;
		transform: translateX(-50%);
		padding: 10px 24px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 14px;
		touch-action: manipulation;
		z-index: 10;
	}

	#restart-btn:hover {
		background: #2563eb;
	}

</style>
