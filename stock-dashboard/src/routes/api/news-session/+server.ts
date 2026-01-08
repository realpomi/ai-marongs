import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveNewsSession, getRecentNewsSessions, getNewsItemsBySessionId } from '$lib/server/repositories/news.repository';

/**
 * POST /api/news-session
 *
 * 뉴스 세션을 저장합니다.
 *
 * Request Body:
 * {
 *   from: string,       // 데이터 출처 (예: "claude")
 *   news: [             // 뉴스 배열
 *     { ticker: string, content: string }
 *   ],
 *   date: string        // 뉴스 날짜 (YYYY-MM-DD)
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   sessionId: number,
 *   itemCount: number,
 *   message: string
 * }
 */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { from, news, date } = body;

    // 유효성 검사
    if (!from || typeof from !== 'string') {
      return json({ error: 'from 필드가 필요합니다' }, { status: 400 });
    }

    if (!Array.isArray(news) || news.length === 0) {
      return json({ error: 'news 배열이 필요합니다' }, { status: 400 });
    }

    if (!date || typeof date !== 'string') {
      return json({ error: 'date 필드가 필요합니다 (YYYY-MM-DD 형식)' }, { status: 400 });
    }

    // 날짜 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return json({ error: 'date는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 });
    }

    // 뉴스 아이템 유효성 검사
    for (const item of news) {
      if (!item.ticker || typeof item.ticker !== 'string') {
        return json({ error: '각 뉴스 항목에 ticker가 필요합니다' }, { status: 400 });
      }
      if (!item.content || typeof item.content !== 'string') {
        return json({ error: '각 뉴스 항목에 content가 필요합니다' }, { status: 400 });
      }
    }

    // 저장
    const result = await saveNewsSession({ from, news, date });

    return json({
      success: true,
      sessionId: result.session.id,
      itemCount: result.itemCount,
      message: `뉴스 세션 저장 완료: ${result.itemCount}개 항목`
    });
  } catch (error) {
    console.error('뉴스 세션 저장 실패:', error);
    return json({ error: '뉴스 세션 저장에 실패했습니다' }, { status: 500 });
  }
};

/**
 * GET /api/news-session
 *
 * 최근 뉴스 세션 목록을 조회합니다.
 *
 * Query Parameters:
 * - limit: number (기본값: 10)
 * - offset: number (기본값: 0)
 * - includeItems: boolean (기본값: false) - 뉴스 아이템 포함 여부
 *
 * Response:
 * {
 *   sessions: [
 *     { id, source, news_date, created_at, items?: [...] }
 *   ]
 * }
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const includeItems = url.searchParams.get('includeItems') === 'true';

    const sessions = await getRecentNewsSessions(limit, offset);

    if (includeItems) {
      const sessionsWithItems = await Promise.all(
        sessions.map(async (session) => {
          const items = await getNewsItemsBySessionId(session.id);
          return { ...session, items };
        })
      );
      return json({ sessions: sessionsWithItems });
    }

    return json({ sessions });
  } catch (error) {
    console.error('뉴스 세션 조회 실패:', error);
    return json({ error: '뉴스 세션 조회에 실패했습니다' }, { status: 500 });
  }
};
