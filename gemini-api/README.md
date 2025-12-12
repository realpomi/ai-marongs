# Gemini API Server

Gemini File Search 기능을 활용한 리포트 생성 API 서버입니다.

## 기술 스택

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **AI**: Google Gemini API

## 시작하기

### 1. 의존성 설치

```bash
cd gemini-api
bun install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env
# .env 파일을 편집하여 GEMINI_API_KEY 설정
```

### 3. 개발 서버 실행

```bash
bun run dev
```

### 4. 프로덕션 실행

```bash
bun run start
```

## API 엔드포인트

### Health Check

```
GET /
GET /health
```

### 리포트 생성

```
POST /api/report/generate
```

**Request Body:**
```json
{
  "query": "분석할 질문 또는 요청",
  "files": [
    {
      "name": "example.txt",
      "content": "파일 내용",
      "mimeType": "text/plain"
    }
  ],
  "options": {
    "maxTokens": 8192,
    "temperature": 0.7
  }
}
```

**Response:**
```json
{
  "success": true,
  "report": "생성된 리포트 내용",
  "metadata": {
    "model": "gemini-2.0-flash",
    "filesProcessed": 1,
    "generatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 파일 검색

```
POST /api/report/search
```

**Request Body:**
```json
{
  "query": "검색할 키워드",
  "files": [
    {
      "name": "document.txt",
      "content": "파일 내용"
    }
  ]
}
```

### 파일 분석

```
POST /api/report/analyze
```

**Request Body:**
```json
{
  "files": [
    {
      "name": "data.json",
      "content": "파일 내용"
    }
  ],
  "analysisType": "summary"
}
```

**analysisType 옵션:**
- `summary`: 간단 요약
- `detailed`: 상세 분석
- `comparison`: 비교 분석

## Docker 실행

```bash
# 이미지 빌드
docker build -t gemini-api:latest ./gemini-api

# 컨테이너 실행
docker run -d \
  --name gemini-api \
  -p 3000:3000 \
  -e GEMINI_API_KEY=your_api_key \
  --restart unless-stopped \
  gemini-api:latest
```

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `GEMINI_API_KEY` | Google Gemini API 키 | (필수) |
| `GEMINI_MODEL` | 사용할 Gemini 모델 | `gemini-2.0-flash` |
| `PORT` | 서버 포트 | `3000` |

## 프로젝트 구조

```
gemini-api/
├── src/
│   ├── index.ts           # Hono 서버 엔트리포인트
│   ├── routes/
│   │   └── report.ts      # 리포트 API 라우트
│   └── services/
│       └── gemini.ts      # Gemini API 서비스
├── package.json
├── tsconfig.json
├── Dockerfile
├── .env.example
└── README.md
```
