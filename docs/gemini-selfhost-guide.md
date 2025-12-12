# Gemini FileSearch & Report 셀프호스팅 개발 가이드

## 1. 개요

이 문서는 현재 Cloudflare Worker에서 구현된 Gemini FileSearch 및 AI 리포트 생성 기능을 셀프호스팅 서버로 분리하기 위한 개발 가이드입니다.

### 1.1 아키텍처 변경

**현재 구조:**
```
[Browser] → [Cloudflare Worker] → [Gemini API]
                ↓
           [Cloudflare D1]
```

**셀프호스팅 구조:**
```
[Browser] → [Cloudflare Worker] → [Self-hosted Server] → [Gemini API]
                ↓                          ↓
           [Cloudflare D1]           [Local DB (옵션)]
```

### 1.2 셀프호스팅 서버 역할

1. **FileSearch 관리**: 파일 업로드, FileSearchStore 관리, 문서 검색
2. **AI 리포트 생성**: GA4 데이터 분석 및 구조화된 리포트 생성
3. **Function Calling**: 분석 중 파일 검색 도구 실행

---

## 2. API 스펙

셀프호스팅 서버가 제공해야 할 API 엔드포인트입니다.

### 2.1 FileSearch API

#### POST /api/files/upload
파일을 Gemini File API에 업로드하고 FileSearchStore에 import합니다.

**Request:**
```typescript
// Content-Type: multipart/form-data
{
  file: File;           // 업로드할 파일
  displayName?: string; // 표시 이름 (없으면 원본 파일명 사용)
}
```

**Response:**
```typescript
{
  success: boolean;
  file?: {
    name: string;        // files/xxxxx 형식
    displayName: string;
    mimeType: string;
    sizeBytes: number;
    uri: string;
    state: 'ACTIVE' | 'PROCESSING';
  };
  error?: string;
}
```

#### GET /api/files
파일 목록을 조회합니다.

**Response:**
```typescript
{
  files: Array<{
    name: string;
    displayName: string;
    mimeType: string;
    sizeBytes: string;
    uri: string;
    state: string;
    createTime: string;
  }>;
  error: string | null;
}
```

#### DELETE /api/files/:fileName
파일을 삭제합니다 (FileSearchStore에서 제거).

**Request:**
```typescript
{
  fileName: string;  // files/xxxxx 형식
}
```

**Response:**
```typescript
{
  success: boolean;
  error: string | null;
}
```

#### POST /api/files/search
FileSearchStore에서 문서 검색을 수행합니다.

**Request:**
```typescript
{
  query: string;  // 검색 쿼리
}
```

**Response:**
```typescript
{
  answer: string;      // AI 검색 결과
  error: string | null;
}
```

---

### 2.2 Report Generation API

#### POST /api/report/generate
GA4 데이터를 분석하여 리포트를 생성합니다.

**Request:**
```typescript
{
  analysisDate: string;  // YYYY-MM-DD 형식
  newUsers: NewUsersData | null;
  retention: RetentionData | null;
  stageFunnel: StageFunnelData | null;
  endlessMode: EndlessModeData | null;
}
```

**Response:**
```typescript
{
  success: boolean;
  result?: AnalysisResult;
  tokensUsed?: number;
  durationMs?: number;
  error?: string;
}
```

#### POST /api/report/generate-raw
파싱 없이 raw 텍스트만 반환합니다.

**Request:** (generate와 동일)

**Response:**
```typescript
{
  success: boolean;
  rawText?: string;
  tokensUsed?: number;
  durationMs?: number;
  error?: string;
}
```

#### POST /api/report/parse
raw 텍스트를 구조화된 결과로 파싱합니다.

**Request:**
```typescript
{
  rawText: string;
}
```

**Response:**
```typescript
{
  success: boolean;
  result?: AnalysisResult;
  error?: string;
}
```

---

## 3. TypeScript 인터페이스

### 3.1 FileSearch 관련

```typescript
// FileSearchStore 설정
interface FileSearchStoreConfig {
  displayName: string;
}

// 파일 정보
interface GeminiFile {
  name: string;           // files/xxxxx
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  uri: string;
  state: 'ACTIVE' | 'PROCESSING' | 'FAILED';
  createTime?: string;
  expirationTime?: string;
}

// 검색 요청
interface SearchRequest {
  query: string;
}

// 검색 응답
interface SearchResponse {
  answer: string;
  error: string | null;
}
```

### 3.2 Report Generation 관련

```typescript
// 분석 입력 데이터
interface GA4AnalysisInput {
  analysisDate: string; // YYYY-MM-DD (KST 기준)

  newUsers: {
    stats: Array<{ date: string; newUsers: number; activeUsers: number }>;
    thisWeek: {
      totalNewUsers: number;
      totalActiveUsers: number;
      avgNewUsers: number;
      avgActiveUsers: number;
    };
    lastWeek: {
      totalNewUsers: number;
      totalActiveUsers: number;
      avgNewUsers: number;
      avgActiveUsers: number;
    };
  } | null;

  retention: {
    all: Array<{
      cohort_week_start: string;
      new_users: number;
      retention: (number | null)[];
    }>;
  } | null;

  stageFunnel: {
    themes: Array<{
      theme_name: string;
      stages: Array<{ stage_number: number; all_count: number }>;
    }>;
  } | null;

  endlessMode: {
    themes: Array<{ theme_name: string; all_count: number }>;
    totalCount: number;
  } | null;
}

// 분석 결과
interface AnalysisResult {
  summary: string;

  sections: {
    userGrowth: {
      insight: string;
      trend: 'up' | 'down' | 'stable';
      changePercent: number;
      highlights: string[];
    };
    retention: {
      insight: string;
      trend: 'up' | 'down' | 'stable';
      highlights: string[];
    };
    stageFunnel: {
      insight: string;
      bottlenecks: string[];
      highlights: string[];
    };
    endlessMode: {
      insight: string;
      popularThemes: string[];
      highlights: string[];
    };
  };

  recommendations: string[];

  strategies: Array<{
    title: string;
    description: string;
    expectedOutcome: string;
    priority: 'high' | 'medium' | 'low';
    timeframe: 'short' | 'medium' | 'long';
  }>;

  rawAnalysis: string;
}
```

---

## 4. 핵심 구현 상세

### 4.1 FileSearchStore 관리

FileSearchStore는 Gemini의 영구 문서 저장소입니다. 일반 File API는 48시간 후 만료되지만, FileSearchStore에 import된 파일은 만료되지 않습니다.

```typescript
import { GoogleGenAI } from '@google/genai';

const FILE_SEARCH_STORE_DISPLAY_NAME = 'jjumper-analysis-store';

// FileSearchStore 가져오기 또는 생성
async function getOrCreateFileSearchStore(ai: GoogleGenAI): Promise<string> {
  // 기존 store 목록에서 찾기
  const stores = await ai.fileSearchStores.list();
  for await (const store of stores) {
    if (store.displayName === FILE_SEARCH_STORE_DISPLAY_NAME) {
      console.log(`Found existing FileSearchStore: ${store.name}`);
      return store.name!;
    }
  }

  // 없으면 새로 생성
  console.log(`Creating new FileSearchStore: ${FILE_SEARCH_STORE_DISPLAY_NAME}`);
  const newStore = await ai.fileSearchStores.create({
    config: { displayName: FILE_SEARCH_STORE_DISPLAY_NAME }
  });
  console.log(`Created FileSearchStore: ${newStore.name}`);
  return newStore.name!;
}

// 파일을 FileSearchStore로 import
async function importFileToStore(
  ai: GoogleGenAI,
  fileSearchStoreName: string,
  fileName: string
): Promise<void> {
  // File API에 업로드된 파일을 FileSearchStore로 import
  const importOperation = await ai.fileSearchStores.importFile({
    fileSearchStoreName: fileSearchStoreName,
    fileName: fileName  // files/xxxxx 형식
  });

  // import 작업 완료 대기
  let operation = importOperation;
  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    operation = await ai.operations.get({ operation });
  }
  console.log(`Import completed for: ${fileName}`);
}
```

### 4.2 파일 업로드 프로세스

```typescript
import { GoogleAIFileManager } from '@google/generative-ai/server';

async function uploadFile(
  apiKey: string,
  filePath: string,
  displayName: string,
  mimeType: string
): Promise<GeminiFile> {
  const fileManager = new GoogleAIFileManager(apiKey);

  // 1. Gemini File API에 업로드
  const uploadResult = await fileManager.uploadFile(filePath, {
    mimeType: mimeType,
    displayName: displayName
  });

  console.log(`Uploaded file: ${uploadResult.file.name}`);

  // 2. FileSearchStore에 import
  const ai = new GoogleGenAI({ apiKey });
  const storeName = await getOrCreateFileSearchStore(ai);
  await importFileToStore(ai, storeName, uploadResult.file.name);

  return {
    name: uploadResult.file.name,
    displayName: uploadResult.file.displayName,
    mimeType: uploadResult.file.mimeType,
    sizeBytes: parseInt(uploadResult.file.sizeBytes),
    uri: uploadResult.file.uri,
    state: 'ACTIVE'
  };
}
```

### 4.3 FileSearch 검색 구현

```typescript
// FileSearchStore를 사용한 검색
async function searchInFileStore(
  apiKey: string,
  query: string
): Promise<SearchResponse> {
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
      error: 'FileSearchStore가 없습니다. 먼저 파일을 업로드해주세요.'
    };
  }

  // FileSearch 도구를 사용하여 검색
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: query,
    config: {
      tools: [
        {
          fileSearch: {
            fileSearchStoreNames: [fileSearchStoreName]
          }
        }
      ]
    }
  });

  return {
    answer: response.text || '응답을 생성할 수 없습니다.',
    error: null
  };
}
```

---

## 5. 리포트 생성 구현

### 5.1 Function Calling 도구 정의

분석 중 Gemini가 호출할 수 있는 도구들입니다.

```typescript
import {
  GoogleGenerativeAI,
  SchemaType,
  type FunctionDeclaration,
  type FunctionResponsePart
} from '@google/generative-ai';

const fileSearchTools: FunctionDeclaration[] = [
  {
    name: 'searchFiles',
    description:
      '업로드된 문서(기획서, 매뉴얼, 과거 분석 보고서 등)에서 정보를 검색합니다. 스테이지 난이도, 기획 의도, 과거 분석 결과 등을 찾을 때 사용하세요.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: '검색할 키워드나 질문 (예: "스테이지 난이도", "리텐션 목표", "이벤트 일정")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'listAvailableFiles',
    description: '참조 가능한 문서 목록을 확인합니다. 어떤 문서가 있는지 먼저 확인할 때 사용하세요.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {}
    }
  }
];
```

### 5.2 Function Call 핸들러

```typescript
import { GoogleAIFileManager } from '@google/generative-ai/server';

// 파일 목록 조회
async function listAvailableFiles(apiKey: string): Promise<{ files: { name: string; displayName: string }[] }> {
  try {
    const fileManager = new GoogleAIFileManager(apiKey);
    const listResult = await fileManager.listFiles({ pageSize: 100 });

    const files =
      listResult.files
        ?.filter((f) => f.state === 'ACTIVE')
        .map((f) => ({ name: f.name, displayName: f.displayName || f.name })) || [];

    return { files };
  } catch (e) {
    console.error('Failed to list files:', e);
    return { files: [] };
  }
}

// 파일 내용 검색
async function searchFiles(apiKey: string, query: string): Promise<{ results: string }> {
  try {
    const fileManager = new GoogleAIFileManager(apiKey);
    const listResult = await fileManager.listFiles({ pageSize: 100 });
    const activeFiles = listResult.files?.filter((f) => f.state === 'ACTIVE' && f.uri) || [];

    if (activeFiles.length === 0) {
      return { results: '검색 가능한 문서가 없습니다.' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const fileParts = activeFiles.map((file) => ({
      fileData: {
        mimeType: file.mimeType,
        fileUri: file.uri!
      }
    }));

    const searchPrompt = `다음 문서들에서 "${query}"와 관련된 정보를 찾아 요약해주세요.
관련 정보가 없으면 "관련 정보를 찾을 수 없습니다"라고 답변하세요.
찾은 정보는 간결하게 핵심만 정리해주세요.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([...fileParts, { text: searchPrompt }]);

    return { results: result.response.text() || '검색 결과 없음' };
  } catch (e) {
    console.error('Failed to search files:', e);
    return { results: '검색 중 오류가 발생했습니다.' };
  }
}

// Function Call 처리
async function handleFunctionCall(
  apiKey: string,
  functionName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (functionName) {
    case 'searchFiles':
      return await searchFiles(apiKey, args.query as string);
    case 'listAvailableFiles':
      return await listAvailableFiles(apiKey);
    default:
      return { error: 'Unknown function' };
  }
}
```

### 5.3 분석 메인 로직

```typescript
const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-2.0-flash';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function analyzeGA4Data(
  apiKey: string,
  input: GA4AnalysisInput
): Promise<{ result: AnalysisResult; tokensUsed: number; durationMs: number }> {
  const startTime = Date.now();
  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = buildPrompt(input);

  let currentModel = DEFAULT_MODEL;
  let text = '';
  let totalTokens = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: currentModel,
        tools: [{ functionDeclarations: fileSearchTools }]
      });

      const chat = model.startChat();
      let response = await chat.sendMessage(prompt);
      totalTokens = response.response.usageMetadata?.totalTokenCount || 0;

      let iterations = 0;
      const maxIterations = 5;

      // Function calling 루프
      while (iterations < maxIterations) {
        const functionCalls = response.response.functionCalls();
        if (!functionCalls || functionCalls.length === 0) break;

        iterations++;

        // 모든 function call 처리
        const functionResponses: FunctionResponsePart[] = await Promise.all(
          functionCalls.map(async (call) => {
            console.log(`Executing function: ${call.name}`, call.args);
            const result = await handleFunctionCall(
              apiKey,
              call.name,
              call.args as Record<string, unknown>
            );
            return {
              functionResponse: {
                name: call.name,
                response: result as object
              }
            };
          })
        );

        // Function 결과로 다시 호출
        response = await chat.sendMessage(functionResponses);
        totalTokens += response.response.usageMetadata?.totalTokenCount || 0;
      }

      text = response.response.text();
      break;
    } catch (error) {
      // 재시도 로직 (503, overloaded 에러 시)
      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }

      // 폴백 모델로 시도
      if (attempt === MAX_RETRIES && currentModel !== FALLBACK_MODEL) {
        currentModel = FALLBACK_MODEL;
        attempt = 0;
        continue;
      }

      throw error;
    }
  }

  const durationMs = Date.now() - startTime;

  // JSON 파싱
  const parsedResult = parseAnalysisResult(text);

  return { result: parsedResult, tokensUsed: totalTokens, durationMs };
}

// 유틸리티 함수들
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('503') || message.includes('overloaded') || message.includes('unavailable');
  }
  return false;
}

function parseAnalysisResult(rawText: string): AnalysisResult {
  try {
    let jsonText = rawText;
    jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);
    return { ...parsed, rawAnalysis: rawText };
  } catch (e) {
    // 파싱 실패 시 기본 구조 반환
    return {
      summary: `분석 결과를 구조화하는데 실패했습니다.`,
      sections: {
        userGrowth: { insight: '', trend: 'stable', changePercent: 0, highlights: [] },
        retention: { insight: '', trend: 'stable', highlights: [] },
        stageFunnel: { insight: '', bottlenecks: [], highlights: [] },
        endlessMode: { insight: '', popularThemes: [], highlights: [] }
      },
      recommendations: [],
      strategies: [],
      rawAnalysis: rawText
    };
  }
}
```

---

## 6. 프롬프트 템플릿

분석에 사용되는 프롬프트입니다. 게임 컨텍스트와 분석 요구사항이 포함됩니다.

```typescript
function buildPrompt(data: GA4AnalysisInput): string {
  return `당신은 모바일 게임 "점퍼(JJumper)"의 데이터 분석가입니다.
이 게임은 중력을 이용한 단순한 쌓기 퍼즐게임이며, 여러 테마(SUPER MARKET, BUFFET, LUXURY SHOP, ELECTRO MART, STREET MARKET)가 있고 각 테마에 20개의 스테이지와 무제한 모드가 있습니다.
각 테마에 따라 받침이 있고, 최대한 높이 쌓는 것이 목표인 게임입니다

분석 기준일: ${data.analysisDate}

다음 GA4 데이터를 분석하고 인사이트를 제공해주세요.

## 1. 일별 신규/활성 사용자 (14일)
${data.newUsers ? JSON.stringify(data.newUsers, null, 2) : '데이터 없음'}

## 2. 리텐션 (주간 코호트)
${data.retention ? JSON.stringify(data.retention, null, 2) : '데이터 없음'}

## 3. 스테이지 진행률 (7일)
## 스테이지는 0부터 19까지로 되어 있는데, 각각 +1을 해서 1스테이지부터 20스테이지로 표기하세요
## 스테이지 이탈율이나 병목 구간을 설명할때 좀 더 쉽게 이해할 수 있도록 내용을 자세히 설명해주세요
## 예를 들어 이전에 "스테이지 0에서 1로 넘어갈 때 사용자 이탈이 가장 크게 발생하며" 라고  분석했는데
## 정확하게 "1스테이지에서 2스테이지로 넘어가는 사용자가 xx%로 감소하여 가장 큰 이탈이 발생합니다" 라고 설명해주세요
## 병목 구간을 설명할 때도 "사용자들이 xx 스테이지 이후에 플레이가 급감한것으로 보아 다음스테이지로 넘어가지 않고 있어 병목구간으로 보입니다" 와 같이 풀어서 보는 즉시 이해할수 있게 설명해주세요
## 각 부분에서 왜 그런지 추측을 해보고, 그에 대한 대처할 수 있는 방안들도 몇가지 제시해주세요
${data.stageFunnel ? JSON.stringify(data.stageFunnel, null, 2) : '데이터 없음'}

## 4. 무제한모드 클리어 (7일)
## 무제한모드는 스테이지 10을 클리어하면 열리게 됩니다.
## 11스테이지의 플레이어 카운트와 무제한 모드 카운트간의 수치를 비교하여 무제한모드 진입률도 분석해주세요
## 이는 또한 10스테이지 이후의 이탈율에 대한 간접적인 지표가 될 수 있습니다
## 이런부분을 고려하여 분석하고, 필요할경우 자료를 참고해서 인사이트를 제공해주세요
${data.endlessMode ? JSON.stringify(data.endlessMode, null, 2) : '데이터 없음'}

## 참고 문서 검색 도구 (필수)
분석을 시작하기 전에 반드시 아래 단계를 수행하세요:

### 1단계: 문서 목록 확인
먼저 listAvailableFiles 도구를 사용하여 참조 가능한 문서가 있는지 확인하세요.

### 2단계: 필수 검색 (문서가 있는 경우)
문서가 있다면 searchFiles 도구를 사용하여 다음 항목들을 반드시 검색하세요:

**기본 분석용 검색:**
- 스테이지 난이도 설계 의도
- 기획서에 명시된 목표 리텐션
- 과거 분석 결과와의 비교
- 이벤트나 업데이트 일정

**전략 수립용 검색 (필수):**
- "전략" 또는 "strategy" - 기존에 수립된 전략이나 계획 확인
- "계획" 또는 "로드맵" - 향후 개발/운영 계획 확인
- "차후 업데이트 계획" 또는 "예정된 업데이트" - 예정된 기능 추가나 개선 사항 확인
- "업데이트 완료" 또는 "업데이트 내역" - 최근 완료된 업데이트 및 변경 사항 확인
- "목표" 또는 "KPI" - 달성해야 할 목표 지표 확인
- "개선" 또는 "패치노트" - 개선 사항 및 버그 수정 내역 확인

### 3단계: 검색 결과 활용
검색한 정보를 바탕으로:
- 기존 전략과 일치하거나 보완하는 방향으로 전략을 제안하세요
- 이미 계획된 사항은 중복 제안하지 말고, 우선순위나 실행 시기 조정을 제안하세요
- 기획 의도와 현재 데이터의 차이점을 분석하여 전략에 반영하세요
- 최근 완료된 업데이트가 있다면, 해당 업데이트의 효과를 데이터와 연결지어 분석하세요
- 차후 업데이트 계획이 있다면, 현재 데이터 기반으로 해당 계획의 우선순위나 방향성에 대한 의견을 제시하세요

중요: 반드시 아래 JSON 형식만 출력하세요. 다른 텍스트나 설명 없이 오직 JSON만 출력해야 합니다.
JSON 앞뒤에 마크다운 코드블록(\`\`\`)을 사용하지 마세요.
{
  "summary": "전체 요약 (2-3문장)",
  "sections": {
    "userGrowth": {
      "insight": "신규/활성 사용자 분석",
      "trend": "up|down|stable",
      "changePercent": 숫자,
      "highlights": ["주요 포인트 1", "주요 포인트 2"]
    },
    "retention": {
      "insight": "리텐션 분석",
      "trend": "up|down|stable",
      "highlights": ["주요 포인트 1", "주요 포인트 2"]
    },
    "stageFunnel": {
      "insight": "스테이지 진행률 분석",
      "bottlenecks": ["병목 스테이지 1", "병목 스테이지 2"],
      "highlights": ["주요 포인트 1", "주요 포인트 2"]
    },
    "endlessMode": {
      "insight": "무제한모드 분석",
      "popularThemes": ["인기 테마 1", "인기 테마 2"],
      "highlights": ["주요 포인트 1", "주요 포인트 2"]
    }
  },
  "recommendations": ["권장 사항 1", "권장 사항 2", "권장 사항 3"],
  "strategies": [
    {
      "title": "전략 제목 (예: 초반 이탈 방지 전략)",
      "description": "전략에 대한 구체적인 설명과 실행 방안",
      "expectedOutcome": "이 전략을 실행했을 때 기대되는 효과",
      "priority": "high|medium|low",
      "timeframe": "short|medium|long"
    }
  ]
}

## 전략(strategies) 작성 가이드
위 데이터 분석을 기반으로 게임 성장에 도움이 될 전략을 3-5개 제시해주세요:
- 각 전략은 데이터에서 발견된 문제점이나 기회를 기반으로 해야 합니다
- priority: high(긴급하게 해결해야 할 문제), medium(개선이 필요한 부분), low(장기적 개선)
- timeframe: short(1-2주 내 실행 가능), medium(1개월 정도 소요), long(분기 단위 프로젝트)
- 전략 예시:
  - 리텐션 개선 전략: 특정 코호트의 이탈 원인 분석 및 대응
  - 병목 구간 해소 전략: 특정 스테이지 난이도 조정 방안
  - 사용자 유입 전략: 특정 테마나 모드 홍보 강화
  - 무제한모드 활성화 전략: 접근성 개선 또는 보상 강화
  - 신규 사용자 전환 전략: 초반 경험 개선을 통한 이탈 방지`;
}
```

---

## 7. 필요 의존성

### 7.1 npm 패키지

```json
{
  "dependencies": {
    "@google/genai": "^1.33.0",
    "@google/generative-ai": "^0.24.1"
  }
}
```

### 7.2 환경 변수

```bash
# Gemini API 키
GEMINI_API_KEY="your-api-key"

# Discord 웹훅 (선택사항, 알림용)
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

---

## 8. Worker에서 셀프호스팅 서버 호출

### 8.1 Worker 측 수정 예시

```typescript
// src/lib/server/gemini/selfhost-client.ts

const SELFHOST_API_URL = 'https://your-selfhost-server.com/api';

// 파일 검색 호출
export async function searchFilesRemote(query: string): Promise<SearchResponse> {
  const response = await fetch(`${SELFHOST_API_URL}/files/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return response.json();
}

// 리포트 생성 호출
export async function generateReportRemote(
  input: GA4AnalysisInput
): Promise<{ result: AnalysisResult; tokensUsed: number; durationMs: number }> {
  const response = await fetch(`${SELFHOST_API_URL}/report/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error);
  }

  return {
    result: data.result,
    tokensUsed: data.tokensUsed,
    durationMs: data.durationMs
  };
}

// 파일 목록 조회
export async function listFilesRemote(): Promise<GeminiFile[]> {
  const response = await fetch(`${SELFHOST_API_URL}/files`);
  const data = await response.json();
  return data.files || [];
}
```

---

## 9. 셀프호스팅 서버 프로젝트 구조 제안

```
gemini-selfhost/
├── src/
│   ├── index.ts              # 메인 서버 엔트리
│   ├── routes/
│   │   ├── files.ts          # /api/files 라우트
│   │   └── report.ts         # /api/report 라우트
│   ├── services/
│   │   ├── file-search.ts    # FileSearch 비즈니스 로직
│   │   └── analyzer.ts       # 리포트 생성 로직
│   ├── utils/
│   │   ├── gemini-client.ts  # Gemini API 클라이언트
│   │   ├── prompt.ts         # 프롬프트 빌더
│   │   └── retry.ts          # 재시도 유틸리티
│   └── types/
│       └── index.ts          # TypeScript 인터페이스
├── package.json
├── tsconfig.json
└── .env
```

---

## 10. 주의사항

### 10.1 API 제한
- Gemini API는 분당/일당 요청 제한이 있습니다
- 503/overloaded 에러 발생 시 재시도 로직 필수

### 10.2 파일 만료
- Gemini File API에 업로드된 파일은 48시간 후 만료
- **FileSearchStore에 import하면 만료되지 않음** (중요!)
- 파일 업로드 후 반드시 FileSearchStore로 import 필요

### 10.3 토큰 사용량
- Function Calling 사용 시 토큰 사용량이 증가합니다
- 각 턴마다 토큰 카운트를 누적해야 정확한 사용량 파악 가능

### 10.4 모델 선택
- 기본 모델: `gemini-2.5-flash` (빠르고 저렴)
- 폴백 모델: `gemini-2.0-flash` (안정성)
- FileSearch에는 `gemini-2.5-flash` 권장

---

## 11. 참고 파일 경로

현재 구현된 파일들의 위치:

| 구현 내용 | 파일 경로 |
|----------|----------|
| Gemini 클라이언트 | `src/lib/server/gemini/client.ts` |
| 분석 엔진 (프롬프트 포함) | `src/lib/server/gemini/analyzer.ts` |
| FileSearch 관리 API | `src/routes/admin/ai/analysis-data/api/+server.ts` |
| FileSearch 검색 API | `src/routes/admin/ai/analysis-data/api/search/+server.ts` |
| 리포트 생성 API | `src/routes/admin/ai-reports/api/+server.ts` |
| 공개 분석 API | `src/routes/api/ga4/gemini-analysis/+server.ts` |
