import type { PageServerLoad } from './$types';
import { getRecentNewsSessions, getNewsItemsBySessionId } from '$lib/server/repositories/news.repository';

export const load: PageServerLoad = async () => {
  const sessions = await getRecentNewsSessions(20, 0);

  // 각 세션의 뉴스 아이템 로드
  const sessionsWithItems = await Promise.all(
    sessions.map(async (session) => {
      const items = await getNewsItemsBySessionId(session.id);
      return {
        ...session,
        items
      };
    })
  );

  return {
    sessions: sessionsWithItems
  };
};
