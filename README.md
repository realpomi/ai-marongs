# ai-marongs

Python 기반의 Discord Bot과 메시지 처리 시스템입니다. NATS를 통해 봇 인터페이스와 메시지 처리 로직을 분리한 마이크로서비스 아키텍처를 사용합니다.

## 🏗️ 아키텍처

이 프로젝트는 두 개의 독립적인 Python 서비스로 구성된 모노레포입니다:

```
┌─────────────────┐      ┌──────────┐      ┌───────────────────┐
│  Discord User   │      │   NATS   │      │    Message        │
│                 │      │  Server  │      │   Processor       │
└────────┬────────┘      └────┬─────┘      └─────────┬─────────┘
         │                     │                      │
         │  1. 메시지 전송      │                      │
         ├────────────────────>│                      │
         │                     │                      │
    ┌────▼──────┐             │   2. discord.        │
    │  Discord  │             │      messages        │
    │    Bot    ├─────────────┼─────────────────────>│
    │ Interface │             │                      │
    └────▲──────┘             │                      │
         │                     │   3. 메시지 처리      │
         │                     │                      │
         │  5. 응답 전송        │   4. discord.        │
         │                     │      responses       │
         │<────────────────────┼──────────────────────┤
         │                     │                      │
         └─────────────────────┴──────────────────────┘
```

### 구성 요소

1. **Discord Bot Interface** (`discord-bot/`)
   - Discord API와 상호작용
   - 사용자 메시지를 NATS로 발행
   - NATS에서 응답을 수신하여 Discord로 전송
   - 경량 인터페이스 역할만 수행

2. **Message Processor** (`message-processor/`)
   - NATS에서 메시지를 구독
   - 실제 비즈니스 로직 처리
   - 처리 결과를 NATS로 발행
   - Discord Bot과 독립적으로 확장 가능

3. **NATS Server**
   - 두 서비스 간 메시지 브로커
   - 비동기 통신 지원
   - 경량이고 빠른 성능

## 🚀 빠른 시작

### 사전 요구사항

- Python 3.8 이상
- Docker 및 Docker Compose (NATS 서버 실행용)
- Discord Bot Token ([생성 방법](#discord-봇-토큰-생성))

### 1. NATS 서버 시작

```bash
docker-compose up -d
```

NATS 서버가 다음 포트에서 실행됩니다:
- `4222`: 클라이언트 연결
- `8222`: HTTP 관리
- `6222`: 클러스터 연결

### 2. Discord Bot 설정 및 실행

```bash
cd discord-bot
pip install -r requirements.txt
cp .env.example .env
# .env 파일에서 DISCORD_TOKEN 설정
python bot.py
```

### 3. Message Processor 설정 및 실행

```bash
cd message-processor
pip install -r requirements.txt
cp .env.example .env
python processor.py
```

## 📁 프로젝트 구조

```
ai-marongs/
├── discord-bot/              # Discord 봇 인터페이스
│   ├── bot.py               # 봇 메인 스크립트
│   ├── requirements.txt     # 봇 의존성
│   ├── .env.example         # 환경 변수 예제
│   └── README.md            # 봇 상세 문서
├── message-processor/        # 메시지 처리 서비스
│   ├── processor.py         # 프로세서 메인 스크립트
│   ├── requirements.txt     # 프로세서 의존성
│   ├── .env.example         # 환경 변수 예제
│   └── README.md            # 프로세서 상세 문서
├── docker-compose.yml        # NATS 서버 설정
├── .gitignore               # Git 무시 파일
└── README.md                # 이 파일
```

## 🔧 설정

### Discord 봇 토큰 생성

1. [Discord Developer Portal](https://discord.com/developers/applications)에 접속
2. "New Application" 클릭
3. 애플리케이션 이름 입력
4. "Bot" 메뉴로 이동
5. "Add Bot" 클릭
6. "TOKEN" 섹션에서 토큰 복사
7. "Privileged Gateway Intents"에서 "MESSAGE CONTENT INTENT" 활성화
8. "OAuth2" > "URL Generator"에서 다음 설정:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Messages/View Channels`
9. 생성된 URL로 봇을 서버에 초대

### 환경 변수

#### Discord Bot (`.env`)
```env
DISCORD_TOKEN=your_discord_bot_token_here
NATS_URL=nats://localhost:4222
```

#### Message Processor (`.env`)
```env
NATS_URL=nats://localhost:4222
```

## 💡 사용 방법

봇이 실행되면 Discord에서 다음과 같이 사용할 수 있습니다:

1. **봇 멘션**: `@BotName 안녕하세요`
2. **명령어 사용**: 
   - `!ping` - 봇 응답 확인
   - `!status` - NATS 연결 상태 확인

메시지 처리는 `message-processor/processor.py`의 `process_message` 메소드에서 커스터마이징할 수 있습니다.

## 🔄 메시지 플로우

### NATS 주제 (Topics)

- `discord.messages`: Discord Bot → Message Processor
  ```json
  {
    "channel_id": 123456789,
    "author_id": 987654321,
    "content": "사용자 메시지",
    "message_id": 111222333
  }
  ```

- `discord.responses`: Message Processor → Discord Bot
  ```json
  {
    "channel_id": 123456789,
    "response": "처리된 응답 메시지",
    "original_message_id": 111222333
  }
  ```

## 🛠️ 개발

### 가상 환경 사용 (권장)

```bash
# Discord Bot
cd discord-bot
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Message Processor
cd message-processor
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 로그 확인

- Discord Bot: 콘솔 출력으로 연결 상태 및 메시지 처리 로그 확인
- Message Processor: 콘솔 출력으로 메시지 수신 및 처리 로그 확인
- NATS: `http://localhost:8222` 에서 관리 인터페이스 확인

## 📝 커스터마이징

### 메시지 처리 로직 추가

`message-processor/processor.py`의 `process_message` 메소드를 수정:

```python
async def process_message(self, message_data: Dict[str, Any]) -> str:
    content = message_data.get('content', '')
    
    # 여기에 커스텀 로직 추가
    # 예: AI 모델 호출, 데이터베이스 조회, 외부 API 호출 등
    
    if '특정키워드' in content:
        return "맞춤형 응답"
    
    return "기본 응답"
```

### 새로운 Discord 명령어 추가

`discord-bot/bot.py`에 명령어 추가:

```python
@bot.command(name='mycommand')
async def my_command(ctx):
    """커스텀 명령어"""
    await ctx.send('커스텀 응답')
```

## 🎯 장점

1. **확장성**: Message Processor를 여러 인스턴스로 실행하여 처리량 증가
2. **독립성**: 각 서비스를 독립적으로 개발, 배포, 확장 가능
3. **유지보수성**: 관심사의 분리로 코드 유지보수 용이
4. **안정성**: 한 서비스의 장애가 다른 서비스에 영향을 주지 않음
5. **유연성**: 다양한 프로그래밍 언어로 Message Processor 구현 가능

## 📄 라이선스

MIT

## 🤝 기여

이슈와 풀 리퀘스트를 환영합니다!