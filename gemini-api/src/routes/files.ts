import { Hono } from 'hono';
import { GoogleGenAI } from '@google/genai';

export const filesRoutes = new Hono();

const FILE_SEARCH_STORE_DISPLAY_NAME = 'jjumper-analysis-store';

interface FileSearchRequest {
  query: string;
}

interface SearchResponse {
  answer: string;
  error: string | null;
}

/**
 * FileSearchStore에서 검색
 */
async function searchInFileStore(query: string): Promise<SearchResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      answer: '',
      error: 'GEMINI_API_KEY environment variable is required',
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  // FileSearchStore 찾기
  const stores = await ai.fileSearchStores.list();
  let fileSearchStoreName: string | null = null;

  for await (const store of stores) {
    if (store.displayName === FILE_SEARCH_STORE_DISPLAY_NAME) {
      fileSearchStoreName = store.name!;
      break;
    }
  }

  if (!fileSearchStoreName) {
    return {
      answer: '',
      error: 'FileSearchStore가 없습니다. 먼저 파일을 업로드해주세요.',
    };
  }

  // FileSearch 도구를 사용하여 검색
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: query,
    config: {
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [fileSearchStoreName],
          },
        },
      ],
    },
  });

  return {
    answer: response.text || '응답을 생성할 수 없습니다.',
    error: null,
  };
}

/**
 * POST /api/files/search
 * FileSearchStore에서 문서 검색
 */
filesRoutes.post('/search', async (c) => {
  const body = await c.req.json<FileSearchRequest>();

  if (!body.query) {
    return c.json({ error: 'query is required' }, 400);
  }

  try {
    const result = await searchInFileStore(body.query);

    if (result.error) {
      return c.json(
        {
          error: result.error,
        },
        500
      );
    }

    return c.json({
      answer: result.answer,
      error: null,
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
