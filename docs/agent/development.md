# 개발 가이드

개발 시 참고해야 할 주의사항, 코딩 컨벤션, 테스트 환경 구축 방법입니다.

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
