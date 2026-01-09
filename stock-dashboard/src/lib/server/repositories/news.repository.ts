import sql from '$lib/server/db';

// 테이블 초기화 여부 플래그
let tablesInitialized = false;

/**
 * 뉴스 세션 테이블 스키마
 *
 * news_sessions 테이블:
 * - id: SERIAL PRIMARY KEY
 * - source: TEXT NOT NULL (데이터 출처: 'claude', 'manual' 등)
 * - news_date: DATE NOT NULL (뉴스 날짜)
 * - created_at: TIMESTAMPTZ DEFAULT NOW()
 *
 * news_items 테이블:
 * - id: SERIAL PRIMARY KEY
 * - session_id: INTEGER REFERENCES news_sessions(id) ON DELETE CASCADE
 * - ticker: TEXT NOT NULL (종목 코드)
 * - content: TEXT NOT NULL (뉴스 내용)
 * - created_at: TIMESTAMPTZ DEFAULT NOW()
 */

export interface NewsItem {
  ticker: string;
  content: string;
}

export interface NewsSessionInput {
  from: string;
  news: NewsItem[];
  date: string; // YYYY-MM-DD 형식
}

export interface NewsSession {
  id: number;
  source: string;
  news_date: Date;
  created_at: Date;
}

export interface NewsItemRecord {
  id: number;
  session_id: number;
  ticker: string;
  content: string;
  created_at: Date;
}

/**
 * 뉴스 테이블이 존재하는지 확인하고 없으면 생성
 */
export async function ensureNewsTablesExist(): Promise<void> {
  if (tablesInitialized) return;

  // news_sessions 테이블 생성
  await sql`
    CREATE TABLE IF NOT EXISTS news_sessions (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      news_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // news_items 테이블 생성
  await sql`
    CREATE TABLE IF NOT EXISTS news_items (
      id SERIAL PRIMARY KEY,
      session_id INTEGER NOT NULL REFERENCES news_sessions(id) ON DELETE CASCADE,
      ticker TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // 인덱스 생성 (존재하지 않으면)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_news_sessions_date ON news_sessions(news_date DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_news_sessions_source ON news_sessions(source)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_news_items_session ON news_items(session_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_news_items_ticker ON news_items(ticker)
  `;

  tablesInitialized = true;
  console.log('[DB] news_sessions, news_items 테이블 확인 완료');
}

/**
 * 뉴스 세션을 저장합니다
 */
export async function saveNewsSession(input: NewsSessionInput): Promise<{
  session: NewsSession;
  itemCount: number;
}> {
  // 테이블 존재 확인
  await ensureNewsTablesExist();

  const { from, news, date } = input;

  // 세션 생성
  const sessionResult = await sql`
    INSERT INTO news_sessions (source, news_date)
    VALUES (${from}, ${date})
    RETURNING id, source, news_date, created_at
  `;

  const session = sessionResult[0] as NewsSession;

  // 뉴스 아이템 저장
  let itemCount = 0;
  for (const item of news) {
    await sql`
      INSERT INTO news_items (session_id, ticker, content)
      VALUES (${session.id}, ${item.ticker}, ${item.content})
    `;
    itemCount++;
  }

  console.log(`[DB] 뉴스 세션 저장: source=${from}, date=${date}, items=${itemCount}`);

  return { session, itemCount };
}

/**
 * 특정 날짜의 뉴스 세션 조회
 */
export async function getNewsSessionsByDate(date: string): Promise<NewsSession[]> {
  return sql`
    SELECT id, source, news_date, created_at
    FROM news_sessions
    WHERE news_date = ${date}
    ORDER BY created_at DESC
  `;
}

/**
 * 세션 ID로 뉴스 아이템 조회
 */
export async function getNewsItemsBySessionId(sessionId: number): Promise<NewsItemRecord[]> {
  return sql`
    SELECT id, session_id, ticker, content, created_at
    FROM news_items
    WHERE session_id = ${sessionId}
    ORDER BY id ASC
  `;
}

/**
 * 최근 뉴스 세션 조회 (페이지네이션)
 */
export async function getRecentNewsSessions(limit: number = 10, offset: number = 0): Promise<NewsSession[]> {
  // 테이블이 없으면 빈 배열 반환
  await ensureNewsTablesExist();

  return sql`
    SELECT id, source, news_date, created_at
    FROM news_sessions
    ORDER BY news_date DESC, created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

/**
 * 특정 티커의 뉴스 조회
 */
export async function getNewsByTicker(ticker: string, limit: number = 20): Promise<Array<NewsItemRecord & { news_date: Date; source: string }>> {
  return sql`
    SELECT ni.id, ni.session_id, ni.ticker, ni.content, ni.created_at,
           ns.news_date, ns.source
    FROM news_items ni
    JOIN news_sessions ns ON ni.session_id = ns.id
    WHERE ni.ticker = ${ticker.toUpperCase()}
    ORDER BY ns.news_date DESC, ni.created_at DESC
    LIMIT ${limit}
  `;
}
