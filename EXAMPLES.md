# 사용 예제

이 문서는 ai-marongs 디스코드 봇의 다양한 사용 예제를 제공합니다.

## 기본 설정

### 1. NATS 서버 시작

```bash
docker-compose up -d
```

### 2. Discord Bot 실행

```bash
cd discord-bot
python bot.py
```

콘솔 출력:
```
Logged in as YourBot#1234 (ID: 123456789)
Connected to NATS at nats://localhost:4222
Subscribed to discord.responses
```

### 3. Message Processor 실행

```bash
cd message-processor
python processor.py
```

콘솔 출력:
```
Starting Message Processor...
Connected to NATS at nats://localhost:4222
Subscribed to discord.messages - waiting for messages...
```

## Discord에서 사용하기

### 기본 명령어

#### Ping 명령어
```
사용자: !ping
봇: Pong!
```

#### Status 명령어
```
사용자: !status
봇: ✅ NATS connection is active
```

### 봇 멘션

```
사용자: @YourBot 안녕하세요
봇: 안녕하세요! <@사용자ID>님, 무엇을 도와드릴까요?
```

### 키워드 인식

```
사용자: @YourBot 날씨 알려줘
봇: 죄송합니다. 날씨 정보 기능은 아직 구현되지 않았습니다.
```

```
사용자: @YourBot 도움말
봇: 
**사용 가능한 명령어:**
- 안녕/hello: 인사
- 날씨/weather: 날씨 정보 (준비 중)
- 도움/help: 도움말
```

## 메시지 처리 커스터마이징

### 예제 1: 간단한 에코 봇

`message-processor/processor.py`를 수정:

```python
async def process_message(self, message_data: Dict[str, Any]) -> str:
    content = message_data.get('content', '')
    return f"에코: {content}"
```

### 예제 2: 키워드 기반 응답

```python
async def process_message(self, message_data: Dict[str, Any]) -> str:
    content = message_data.get('content', '').lower()
    
    keywords = {
        '가격': '가격 정보는 웹사이트를 참조해주세요.',
        '시간': f'현재 시간은 {datetime.now().strftime("%H:%M")}입니다.',
        '이름': '저는 ai-marongs 봇입니다!',
    }
    
    for keyword, response in keywords.items():
        if keyword in content:
            return response
    
    return '무엇을 도와드릴까요?'
```

### 예제 3: 외부 API 호출

```python
import aiohttp

async def process_message(self, message_data: Dict[str, Any]) -> str:
    content = message_data.get('content', '')
    
    if '날씨' in content:
        # 외부 API 호출 예제
        async with aiohttp.ClientSession() as session:
            async with session.get('https://api.weather.com/...') as resp:
                data = await resp.json()
                return f"날씨: {data['weather']}"
    
    return '처리 중...'
```

### 예제 4: 데이터베이스 연동

```python
import asyncpg

async def process_message(self, message_data: Dict[str, Any]) -> str:
    content = message_data.get('content', '')
    author_id = message_data.get('author_id')
    
    # PostgreSQL 연결 예제
    conn = await asyncpg.connect('postgresql://...')
    
    # 사용자 정보 조회
    user = await conn.fetchrow(
        'SELECT * FROM users WHERE discord_id = $1', 
        author_id
    )
    
    await conn.close()
    
    if user:
        return f"안녕하세요, {user['name']}님!"
    else:
        return "처음 오셨네요! 환영합니다."
```

## 고급 사용 예제

### 여러 Message Processor 실행 (로드 밸런싱)

터미널 1:
```bash
cd message-processor
python processor.py
```

터미널 2:
```bash
cd message-processor
python processor.py
```

NATS가 자동으로 메시지를 두 프로세서에 분산합니다.

### 환경별 설정

개발 환경:
```bash
# discord-bot/.env.dev
DISCORD_TOKEN=dev_token
NATS_URL=nats://localhost:4222
```

프로덕션 환경:
```bash
# discord-bot/.env.prod
DISCORD_TOKEN=prod_token
NATS_URL=nats://prod-nats:4222
```

실행:
```bash
# 개발
cp .env.dev .env
python bot.py

# 프로덕션
cp .env.prod .env
python bot.py
```

### Docker로 전체 시스템 실행

`docker-compose.yml`을 확장:

```yaml
version: '3.8'

services:
  nats:
    image: nats:latest
    ports:
      - "4222:4222"
      - "8222:8222"
  
  discord-bot:
    build: ./discord-bot
    depends_on:
      - nats
    environment:
      - DISCORD_TOKEN=${DISCORD_TOKEN}
      - NATS_URL=nats://nats:4222
  
  message-processor:
    build: ./message-processor
    depends_on:
      - nats
    environment:
      - NATS_URL=nats://nats:4222
    deploy:
      replicas: 3  # 3개의 프로세서 인스턴스
```

## 모니터링

### NATS 상태 확인

```bash
curl http://localhost:8222/varz
```

### 로그 확인

Discord Bot 로그:
```
Published message to NATS: 123456789
Received response from NATS for message 123456789
```

Message Processor 로그:
```
Received message: {'channel_id': 123, 'author_id': 456, ...}
Processing message from user 456: 안녕하세요
Sent response for message 123456789
```

## 문제 해결

### NATS 연결 실패

```bash
# NATS가 실행 중인지 확인
docker ps | grep nats

# NATS 재시작
docker-compose restart nats
```

### Discord Bot이 응답하지 않음

1. Bot Token이 올바른지 확인
2. MESSAGE CONTENT INTENT가 활성화되어 있는지 확인
3. 봇이 서버에 초대되었는지 확인
4. NATS 연결 상태 확인 (!status 명령어)

### Message Processor가 메시지를 받지 못함

1. NATS URL이 올바른지 확인
2. processor.py가 실행 중인지 확인
3. NATS 로그 확인

## 더 알아보기

- [Discord.py 문서](https://discordpy.readthedocs.io/)
- [NATS 문서](https://docs.nats.io/)
- [프로젝트 README](../README.md)
