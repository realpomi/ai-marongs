# 배포 가이드

CI/CD 파이프라인, 환경 변수 설정, 수동 배포 방법입니다.

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

## CI/CD (GitHub Actions)

### 워크플로우 설정

- **파일 위치**: `.github/workflows/deploy-discord-bot.yml`
- **트리거**: `main` 브랜치에 `discord-bot/**` 변경 시
- **실행 환경**: self-hosted runner

### 배포 프로세스

1. 기존 컨테이너 중지/삭제
2. Docker 이미지 빌드
3. 새 컨테이너 실행
4. 배포 확인

## 수동 배포

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

## 네트워크 설정

- **Docker 네트워크**: `home-network` (외부 네트워크, 미리 생성 필요)
- **NATS 서버**: `nats:4222` (home-network에서 실행 중인 외부 NATS 서버)

### 네트워크 생성 (최초 1회)

```bash
docker network create home-network
```
