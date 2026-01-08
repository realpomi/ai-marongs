<script lang="ts">
  let { data } = $props();

  // 날짜별로 세션 그룹핑
  function groupByDate(sessions: typeof data.sessions) {
    const groups: Record<string, typeof data.sessions> = {};
    for (const session of sessions) {
      const dateKey = new Date(session.news_date).toISOString().split('T')[0];
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(session);
    }
    return groups;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return '오늘';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '어제';
    }
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
  }

  function formatTime(date: Date | string): string {
    return new Date(date).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  const groupedSessions = $derived(groupByDate(data.sessions));
  const sortedDates = $derived(Object.keys(groupedSessions).sort((a, b) => b.localeCompare(a)));
</script>

<svelte:head>
  <title>뉴스 피드 - Stock Dashboard</title>
</svelte:head>

<div class="max-w-4xl mx-auto">
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-800">뉴스 피드</h1>
    <p class="text-sm text-gray-500 mt-1">종목별 뉴스와 분석 정보를 확인하세요</p>
  </div>

  {#if data.sessions.length === 0}
    <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
      <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
      </svg>
      <h3 class="text-lg font-medium text-gray-600 mb-2">뉴스가 없습니다</h3>
      <p class="text-sm text-gray-400">아직 등록된 뉴스가 없습니다.</p>
    </div>
  {:else}
    <div class="space-y-8">
      {#each sortedDates as dateKey}
        <div>
          <!-- 날짜 헤더 -->
          <div class="flex items-center gap-3 mb-4">
            <div class="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 class="text-lg font-semibold text-gray-700">{formatDate(dateKey)}</h2>
            <div class="flex-1 h-px bg-gray-200"></div>
          </div>

          <!-- 세션 목록 -->
          <div class="space-y-4 ml-4">
            {#each groupedSessions[dateKey] as session}
              <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <!-- 세션 헤더 -->
                <div class="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 text-xs font-medium rounded-full {session.source === 'claude' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}">
                      {session.source}
                    </span>
                    <span class="text-xs text-gray-400">{formatTime(session.created_at)}</span>
                  </div>
                  <span class="text-xs text-gray-400">{session.items.length}개 뉴스</span>
                </div>

                <!-- 뉴스 아이템 목록 -->
                <div class="divide-y divide-gray-100">
                  {#each session.items as item}
                    <div class="p-4 hover:bg-gray-50 transition-colors">
                      <div class="flex items-start gap-3">
                        <a
                          href="/ticker/{item.ticker}"
                          class="flex-shrink-0 px-2 py-1 bg-blue-50 text-blue-700 text-sm font-semibold rounded hover:bg-blue-100 transition-colors"
                        >
                          {item.ticker}
                        </a>
                        <p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{item.content}</p>
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
