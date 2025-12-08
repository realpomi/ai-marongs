# Discord Bot Interface

Discord 인터페이스를 담당하는 봇입니다. 사용자의 메시지를 받아 NATS 서버로 전달하고, 처리 결과를 다시 Discord로 전송합니다.

## 사전 요구사항

- NATS 서버가 Docker `home-network`에서 `nats` 이름으로 실행 중이어야 합니다
- NATS 포트: `4222`

## 설치

```bash
pip install -r requirements.txt
```

## 설정

1. `.env.example` 파일을 `.env`로 복사합니다:
```bash
cp .env.example .env
```

2. `.env` 파일에 Discord 봇 토큰을 설정합니다:
```
DISCORD_TOKEN=your_actual_discord_bot_token
NATS_URL=nats://nats:4222
```

## Discord 봇 토큰 생성

1. [Discord Developer Portal](https://discord.com/developers/applications)에 접속
2. "New Application" 클릭
3. 애플리케이션 이름 입력
4. "Bot" 메뉴로 이동
5. "Add Bot" 클릭
6. "TOKEN" 섹션에서 "Copy" 클릭하여 토큰 복사
7. Bot의 "Privileged Gateway Intents"에서 "MESSAGE CONTENT INTENT" 활성화

## 실행

### 로컬 실행
```bash
python bot.py
```

### Docker로 실행

```bash
# 이미지 빌드
docker build -t discord-bot .

# 컨테이너 실행
docker run -d \
  --name discord-bot \
  --network home-network \
  -e DISCORD_TOKEN=your_token \
  -e NATS_URL=nats://nats:4222 \
  --restart unless-stopped \
  discord-bot
```

## 기능

- **메시지 처리**: 봇이 멘션되거나 `!` 명령어로 시작하는 메시지를 NATS로 전달
- **!ping**: 봇의 응답 확인
- **!status**: NATS 연결 상태 확인

## 아키텍처

Discord Bot은 다음과 같은 역할을 수행합니다:
1. Discord에서 메시지 수신
2. 메시지를 NATS의 `discord.messages` 주제로 발행
3. NATS의 `discord.responses` 주제를 구독하여 응답 수신
4. 응답을 Discord 채널로 전송
