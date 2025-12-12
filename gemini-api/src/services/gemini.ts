import { GoogleGenerativeAI, Part } from '@google/generative-ai';

interface FileInput {
  name: string;
  content: string;
  mimeType?: string;
}

interface GenerateReportParams {
  query: string;
  files?: FileInput[];
  options?: {
    maxTokens?: number;
    temperature?: number;
  };
}

interface SearchParams {
  query: string;
  files: FileInput[];
}

interface AnalyzeParams {
  files: FileInput[];
  analysisType: 'summary' | 'detailed' | 'comparison';
}

interface ReportResult {
  report: string;
  metadata: {
    model: string;
    filesProcessed: number;
    generatedAt: string;
  };
}

interface SearchResult {
  relevantSections: Array<{
    fileName: string;
    content: string;
    relevanceScore: number;
  }>;
  summary: string;
}

interface AnalysisResult {
  analysis: string;
  filesSummary: Array<{
    fileName: string;
    summary: string;
  }>;
}

export class GeminiService {
  private genAI: GoogleGenerativeAI;
  private modelName: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  }

  /**
   * 파일 내용을 기반으로 리포트 생성
   */
  async generateReport(params: GenerateReportParams): Promise<ReportResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        maxOutputTokens: params.options?.maxTokens || 8192,
        temperature: params.options?.temperature || 0.7,
      },
    });

    const parts: Part[] = [];

    // 파일 컨텍스트 추가
    if (params.files && params.files.length > 0) {
      const fileContext = params.files
        .map((file) => `--- File: ${file.name} ---\n${file.content}\n--- End of ${file.name} ---`)
        .join('\n\n');

      parts.push({
        text: `다음 파일들을 참고하여 질문에 답변해주세요:\n\n${fileContext}`,
      });
    }

    parts.push({
      text: `\n\n질문/요청: ${params.query}\n\n상세하고 구조화된 리포트 형식으로 답변해주세요.`,
    });

    const result = await model.generateContent(parts);
    const response = await result.response;

    return {
      report: response.text(),
      metadata: {
        model: this.modelName,
        filesProcessed: params.files?.length || 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * 파일 내에서 특정 정보 검색
   */
  async searchInFiles(params: SearchParams): Promise<SearchResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: 0.3,
      },
    });

    const fileContext = params.files
      .map((file) => `--- File: ${file.name} ---\n${file.content}\n--- End of ${file.name} ---`)
      .join('\n\n');

    const prompt = `다음 파일들에서 "${params.query}"와 관련된 정보를 찾아주세요.

${fileContext}

다음 JSON 형식으로 응답해주세요:
{
  "relevantSections": [
    {
      "fileName": "파일명",
      "content": "관련 내용",
      "relevanceScore": 0.0-1.0 사이 점수
    }
  ],
  "summary": "검색 결과 요약"
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // JSON 파싱 시도
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as SearchResult;
      }
    } catch {
      // JSON 파싱 실패 시 기본 응답
    }

    return {
      relevantSections: [],
      summary: text,
    };
  }

  /**
   * 파일 분석 및 요약
   */
  async analyzeFiles(params: AnalyzeParams): Promise<AnalysisResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      generationConfig: {
        temperature: 0.5,
      },
    });

    const fileContext = params.files
      .map((file) => `--- File: ${file.name} ---\n${file.content}\n--- End of ${file.name} ---`)
      .join('\n\n');

    let analysisPrompt = '';

    switch (params.analysisType) {
      case 'summary':
        analysisPrompt = '각 파일의 주요 내용을 간단히 요약해주세요.';
        break;
      case 'detailed':
        analysisPrompt = '각 파일의 구조, 주요 내용, 핵심 포인트를 상세히 분석해주세요.';
        break;
      case 'comparison':
        analysisPrompt = '파일들 간의 공통점과 차이점을 비교 분석해주세요.';
        break;
    }

    const prompt = `다음 파일들을 분석해주세요.

${fileContext}

분석 유형: ${params.analysisType}
${analysisPrompt}

다음 JSON 형식으로 응답해주세요:
{
  "analysis": "전체 분석 결과",
  "filesSummary": [
    {
      "fileName": "파일명",
      "summary": "해당 파일 요약"
    }
  ]
}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // JSON 파싱 시도
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as AnalysisResult;
      }
    } catch {
      // JSON 파싱 실패 시 기본 응답
    }

    return {
      analysis: text,
      filesSummary: params.files.map((file) => ({
        fileName: file.name,
        summary: '',
      })),
    };
  }
}
