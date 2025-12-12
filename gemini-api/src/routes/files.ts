import { Hono } from 'hono';
import { GeminiService } from '../services/gemini';

export const filesRoutes = new Hono();

const geminiService = new GeminiService();

interface FileSearchRequest {
  query: string;
  files: Array<{
    name: string;
    content: string;
    mimeType?: string;
  }>;
  options?: {
    maxResults?: number;
    minRelevanceScore?: number;
  };
}

/**
 * POST /api/files/search
 * 파일 내용에서 쿼리와 관련된 정보를 검색
 */
filesRoutes.post('/search', async (c) => {
  const body = await c.req.json<FileSearchRequest>();

  if (!body.query) {
    return c.json({ error: 'query is required' }, 400);
  }

  if (!body.files || body.files.length === 0) {
    return c.json({ error: 'files are required' }, 400);
  }

  try {
    const result = await geminiService.searchInFiles({
      query: body.query,
      files: body.files,
    });

    // 옵션에 따른 필터링
    let filteredResults = result.relevantSections;

    if (body.options?.minRelevanceScore) {
      filteredResults = filteredResults.filter(
        (section) => section.relevanceScore >= (body.options?.minRelevanceScore || 0)
      );
    }

    if (body.options?.maxResults) {
      filteredResults = filteredResults.slice(0, body.options.maxResults);
    }

    return c.json({
      success: true,
      query: body.query,
      results: filteredResults,
      summary: result.summary,
      metadata: {
        totalFiles: body.files.length,
        matchedSections: filteredResults.length,
        searchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('File search error:', error);
    return c.json(
      {
        error: 'Failed to search files',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
