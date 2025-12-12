import { Hono } from 'hono';
import { GeminiService } from '../services/gemini';

export const reportRoutes = new Hono();

const geminiService = new GeminiService();

interface GenerateReportRequest {
  query: string;
  files?: Array<{
    name: string;
    content: string;
    mimeType?: string;
  }>;
  options?: {
    maxTokens?: number;
    temperature?: number;
  };
}

/**
 * POST /api/report/generate
 * Gemini File Search를 활용한 리포트 생성
 */
reportRoutes.post('/generate', async (c) => {
  const body = await c.req.json<GenerateReportRequest>();

  if (!body.query) {
    return c.json({ error: 'query is required' }, 400);
  }

  try {
    const result = await geminiService.generateReport({
      query: body.query,
      files: body.files,
      options: body.options,
    });

    return c.json({
      success: true,
      report: result.report,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return c.json(
      {
        error: 'Failed to generate report',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/report/search
 * 파일 기반 검색
 */
reportRoutes.post('/search', async (c) => {
  const body = await c.req.json<{ query: string; files: Array<{ name: string; content: string }> }>();

  if (!body.query || !body.files || body.files.length === 0) {
    return c.json({ error: 'query and files are required' }, 400);
  }

  try {
    const result = await geminiService.searchInFiles({
      query: body.query,
      files: body.files,
    });

    return c.json({
      success: true,
      results: result,
    });
  } catch (error) {
    console.error('Search error:', error);
    return c.json(
      {
        error: 'Failed to search files',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/report/analyze
 * 파일 분석 및 요약
 */
reportRoutes.post('/analyze', async (c) => {
  const body = await c.req.json<{
    files: Array<{ name: string; content: string; mimeType?: string }>;
    analysisType?: 'summary' | 'detailed' | 'comparison';
  }>();

  if (!body.files || body.files.length === 0) {
    return c.json({ error: 'files are required' }, 400);
  }

  try {
    const result = await geminiService.analyzeFiles({
      files: body.files,
      analysisType: body.analysisType || 'summary',
    });

    return c.json({
      success: true,
      analysis: result,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return c.json(
      {
        error: 'Failed to analyze files',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
