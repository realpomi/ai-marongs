# AI Agent 개발 가이드

이 문서는 AI Agent가 ai-marongs 프로젝트를 개발할 때 참고해야 할 핵심 정보를 정리한 것입니다.

## 프로젝트 개요

Python 기반의 Discord Bot과 메시지 처리 시스템으로, NATS 메시지 브로커를 통해 마이크로서비스 아키텍처를 구현합니다.

## 아키텍처

```
Discord User → Discord Bot (Interface) → NATS → Message Processor → NATS → Discord Bot → Discord User
```

### 두 개의 독립적인 서비스

| 서비스 | 디렉토리 | 역할 |
|--------|----------|------|
| Discord Bot | `discord-bot/` | Discord API 인터페이스, 메시지 발행/구독 |
| Message Processor | `message-processor/` | 비즈니스 로직 처리 |

## 핵심 파일 구조

```
ai-marongs/
├── discord-bot/
│   ├── bot.py              # Discord 봇 메인 (DiscordNATSBridge 클래스)
│   ├── Dockerfile          # Python 3.11-slim 기반
│   ├── requirements.txt    # discord.py, nats-py, python-dotenv
│   └── .env.example
├── message-processor/
│   ├── processor.py        # MessageProcessor 클래스 (비즈니스 로직)
│   ├── requirements.txt    # nats-py, python-dotenv
│   └── .env.example
├── docker-compose.yml      # Discord Bot 컨테이너 설정
└── .github/workflows/
    └── deploy-discord-bot.yml  # CI/CD (self-hosted runner)
```

## NATS 메시지 규격

### 토픽 (Topics)

| 토픽 | 방향 | 용도 |
|------|------|------|
| `discord.messages` | Bot → Processor | 사용자 메시지 전달 |
| `discord.responses` | Processor → Bot | 처리 결과 응답 |

### 메시지 포맷

**discord.messages:**
```json
{
  "channel_id": 123456789,
  "author_id": 987654321,
  "content": "사용자 메시지",
  "message_id": 111222333
}
```

**discord.responses:**
```json
{
  "channel_id": 123456789,
  "response": "처리된 응답",
  "original_message_id": 111222333
}
```

## 환경 변수

### Discord Bot
```env
DISCORD_TOKEN=your_discord_bot_token_here
NATS_URL=nats://nats:4222
```

### Message Processor
```env
NATS_URL=nats://nats:4222
```

## 네트워크 설정

- **Docker 네트워크**: `home-network` (외부 네트워크, 미리 생성 필요)
- **NATS 서버**: `nats:4222` (home-network에서 실행 중인 외부 NATS 서버)

## 개발 시 주의사항

### 1. 메시지 처리 로직 수정
비즈니스 로직 추가/수정 시 `message-processor/processor.py`의 `process_message` 메소드를 수정:

```python
async def process_message(self, message_data: Dict[str, Any]) -> str:
    content = message_data.get('content', '')
    # 여기에 로직 추가
    return "응답"
```

### 2. Discord 명령어 추가
`discord-bot/bot.py`에 명령어 추가:

```python
@bot.command(name='mycommand')
async def my_command(ctx):
    await ctx.send('응답')
```

### 3. 봇 트리거 조건
`bot.py`의 `on_message` 이벤트에서:
- `ping` 메시지: 즉시 `Pong!` 응답 (NATS 미사용)
- 봇 멘션 또는 `!` 명령어: NATS로 메시지 발행

### 4. Python 버전
- 최소 요구 버전: Python 3.8
- Docker 이미지: Python 3.11-slim

## 의존성

### Discord Bot
- `discord.py>=2.3.2`
- `nats-py>=2.6.0`
- `python-dotenv>=1.0.0`

### Message Processor
- `nats-py>=2.6.0`
- `python-dotenv>=1.0.0`

## 배포 (CI/CD)

### GitHub Actions 워크플로우
- **트리거**: `main` 브랜치에 `discord-bot/**` 변경 시
- **실행 환경**: self-hosted runner
- **프로세스**:
  1. 기존 컨테이너 중지/삭제
  2. Docker 이미지 빌드
  3. 새 컨테이너 실행
  4. 배포 확인

### 수동 배포
```bash
docker build -t discord-bot:latest ./discord-bot
docker run -d \
  --name discord-bot \
  --network home-network \
  -e DISCORD_TOKEN=your_token \
  -e NATS_URL=nats://nats:4222 \
  --restart unless-stopped \
  discord-bot:latest
```

## 코딩 컨벤션

- PEP 8 스타일 가이드
- 함수/클래스에 docstring 추가
- 타입 힌트 사용
- 명확하고 설명적인 변수명

## 커밋 메시지 규칙

```
<타입>: <간단한 설명>

<상세 설명 (선택사항)>
```

**타입:**
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 포맷팅
- `refactor`: 코드 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드 프로세스 또는 도구 변경

## 테스트 환경 구축

1. NATS 서버가 `home-network`에서 실행 중인지 확인
2. `.env.example`을 `.env`로 복사하고 설정
3. 가상 환경 생성 및 의존성 설치
4. 각 서비스 실행

```bash
# Discord Bot
cd discord-bot && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt && python bot.py

# Message Processor (별도 터미널)
cd message-processor && python -m venv venv && source venv/bin/activate
pip install -r requirements.txt && python processor.py
```
