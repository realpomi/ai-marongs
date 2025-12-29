# 아키텍처

Python 기반의 Discord Bot과 메시지 처리 시스템으로, NATS 메시지 브로커를 통해 마이크로서비스 아키텍처를 구현합니다.

## 시스템 개요

```
Discord User → Discord Bot (Interface) → NATS → Message Processor → NATS → Discord Bot → Discord User
```

## 메시지 흐름 상세

```
Discord User
    │
    ▼
┌─────────────────────────────────────┐
│  discord-bot/bot.py                 │
│  DiscordNATSBridge                  │
│                                     │
│  on_message() (L163)                │
│    └─▶ publish_message() (L41)      │
│           │                         │
│           │ NATS publish            │
│           │ "discord.messages"      │
│           ▼                         │
│  handle_response() (L127)           │◀─────┐
│    └─▶ channel.send() (L140)        │      │
└─────────────────────────────────────┘      │
                                             │
              NATS Message Broker            │
                                             │
┌─────────────────────────────────────┐      │
│  message-processor/processor.py     │      │
│  MessageProcessor                   │      │
│                                     │
│  handle_discord_message() (L85)     │      │
│    └─▶ process_message() (L30)      │      │
│           │                         │      │
│           │ NATS publish            │      │
│           │ "discord.responses"     │──────┘
│           ▼                         │
└─────────────────────────────────────┘
```

## 주요 코드 위치

| 기능 | 파일 | 라인 | 설명 |
|------|------|------|------|
| 메시지 수신 | `discord-bot/bot.py` | L163 | `on_message()` - Discord 메시지 이벤트 |
| 메시지 발행 | `discord-bot/bot.py` | L41 | `publish_message()` - NATS로 메시지 전송 |
| 응답 구독 | `discord-bot/bot.py` | L35 | `discord.responses` 토픽 구독 |
| 응답 처리 | `discord-bot/bot.py` | L127 | `handle_response()` - Discord로 응답 전송 |
| 메시지 구독 | `message-processor/processor.py` | L120 | `discord.messages` 토픽 구독 |
| 메시지 처리 | `message-processor/processor.py` | L85 | `handle_discord_message()` - 수신 메시지 파싱 |
| 비즈니스 로직 | `message-processor/processor.py` | L30 | `process_message()` - 실제 처리 로직 |
| 응답 발행 | `message-processor/processor.py` | L104 | NATS로 응답 전송 |

## 서비스 구성

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

## 네트워크 설정

- **Docker 네트워크**: `home-network` (외부 네트워크, 미리 생성 필요)
- **NATS 서버**: `nats:4222` (home-network에서 실행 중인 외부 NATS 서버)
