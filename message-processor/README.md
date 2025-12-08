# Message Processor

Discord 메시지를 처리하고 응답을 생성하는 서비스입니다. NATS를 통해 메시지를 수신하고 처리 결과를 반환합니다.

## 설치

```bash
pip install -r requirements.txt
```

## 설정

1. `.env.example` 파일을 `.env`로 복사합니다:
```bash
cp .env.example .env
```

2. 필요한 경우 `.env` 파일에서 NATS URL을 수정합니다:
```
NATS_URL=nats://localhost:4222
```

## 실행

```bash
python processor.py
```

## 기능

Message Processor는 다음과 같은 역할을 수행합니다:

1. NATS의 `discord.messages` 주제를 구독
2. 수신한 메시지 처리 (비즈니스 로직 실행)
3. 처리 결과를 NATS의 `discord.responses` 주제로 발행

## 메시지 처리 로직 커스터마이징

`processor.py` 파일의 `process_message` 메소드를 수정하여 원하는 메시지 처리 로직을 구현할 수 있습니다:

```python
async def process_message(self, message_data: Dict[str, Any]) -> str:
    # 여기에 사용자 정의 로직 구현
    content = message_data.get('content', '')
    
    # 예: AI 모델 호출, 데이터베이스 조회, API 호출 등
    
    return "처리된 응답"
```

## 아키텍처

Message Processor는 실제 비즈니스 로직을 처리하는 독립적인 서비스입니다:
- Discord Bot과 분리되어 독립적으로 실행
- 수평 확장 가능 (여러 인스턴스 실행 가능)
- 메시지 처리 로직만 집중하여 관리
