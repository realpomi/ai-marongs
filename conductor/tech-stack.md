# Tech Stack

## Programming Languages
- **Python 3.8+:** 메인 비즈니스 로직(Discord Bot, Message Processor, Stock Crawler) 개발에 사용됩니다.
- **TypeScript:** AI 분석 리포트 생성을 위한 API 서버(`gemini-api`) 개발에 사용됩니다.

## Frameworks & Libraries
### Python Stack
- **discord.py:** Discord 봇 인터페이스 구현.
- **nats-py:** NATS 메시징 시스템 연동을 통한 서비스 간 통신.
- **psycopg2-binary:** PostgreSQL 데이터베이스 연동.
- **requests:** 외부 API 호출 및 데이터 수집.
- **schedule:** 정기적인 데이터 수집 작업 예약.

### TypeScript Stack
- **Hono:** 경량 웹 프레임워크를 사용한 API 서버 구축.
- **@google/generative-ai:** Google Gemini AI 모델 연동 및 분석 리포트 생성.

## Infrastructure & Middleware
- **NATS:** 마이크로서비스 간의 효율적인 비동기 메시지 교환을 위한 메시지 브로커.
- **PostgreSQL:** 수집된 주식 데이터 및 시스템 정보 저장용 데이터베이스.
- **Docker & Docker Compose:** 서비스의 컨테이너화 및 오케스트레이션.
- **Bun:** TypeScript 환경의 고성능 런타임 및 패키지 매니저.

## Development & Deployment
- **Git:** 소스 코드 버전 관리.
- **GitHub Actions:** CI/CD 파이프라인(배포 자동화) 구축.
