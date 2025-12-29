import { dailyCollectScheduler } from '$lib/server/scheduler';

// 서버 시작 시 스케줄러 초기화
dailyCollectScheduler.start();

console.log('[Hooks] 서버 초기화 완료');
