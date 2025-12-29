# Stock Dashboard UI 작업 가이드

stock-dashboard UI 수정 시 참고사항입니다.

## 기본 정보

- **위치**: `stock-dashboard/src/routes/`
- **기술 스택**: SvelteKit 5 (Svelte 5 runes 문법 사용), TailwindCSS

## 주요 파일

| 파일 | 설명 |
|------|------|
| `+layout.svelte` | 전체 레이아웃, 사이드바, 티커 목록 |
| `ticker/[symbol]/+page.svelte` | 개별 티커 상세 페이지 |
| `ticker/[symbol]/+page.server.ts` | 분석 로직 (눌림목 분석 등) |
| `api/tickers/+server.ts` | 티커 CRUD API |

## 스타일 컨벤션

- TailwindCSS 클래스 사용
- 한글 레이블 사용
- 상태 표시: pass=green, warning=yellow, fail=red

## Svelte 5 Runes 문법

### 반응형 상태 선언

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

### Props 선언

```svelte
<script>
  let { data } = $props();
</script>
```

## 디렉토리 구조

```
stock-dashboard/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +page.svelte
│   │   ├── ticker/
│   │   │   └── [symbol]/
│   │   │       ├── +page.svelte
│   │   │       └── +page.server.ts
│   │   └── api/
│   │       └── tickers/
│   │           └── +server.ts
│   └── lib/
└── static/
```
