# Track Plan: 주식 데이터 수집 고도화 및 AI 분석 리포트 생성 기본 파이프라인 구축

## Phase 1: 데이터 수집 및 관리 강화
- [x] Task: Stock Crawler - 추적 종목 리스트(20~30개) 관리 스키마 및 설정 추가
- [x] Task: Stock Crawler - 효율적인 데이터 수집 주기 최적화 및 DB 저장 로직 검증
- [ ] Task: Conductor - User Manual Verification 'Phase 1: 데이터 수집 및 관리 강화' (Protocol in workflow.md)

## Phase 2: 서비스 간 데이터 연동 및 AI 분석
- [ ] Task: Message Processor - NATS를 통한 주식 데이터 수신 및 파싱 로직 구현
- [ ] Task: Message Processor - Gemini API 연동 모듈 개발 (리포트 생성 프롬프트 포함)
- [ ] Task: Conductor - User Manual Verification 'Phase 2: 서비스 간 데이터 연동 및 AI 분석' (Protocol in workflow.md)

## Phase 3: Discord 리포트 전송 및 통합 테스트
- [ ] Task: Discord Bot - 생성된 AI 리포트(Markdown) 수신 및 전송 로직 구현
- [ ] Task: 통합 테스트 - 데이터 수집부터 Discord 전송까지 전체 흐름 검증
- [ ] Task: Conductor - User Manual Verification 'Phase 3: Discord 리포트 전송 및 통합 테스트' (Protocol in workflow.md)
