# NATS 메시지 규격

NATS 메시지 브로커를 통한 서비스 간 통신 규격입니다.

## 토픽 (Topics)

| 토픽 | 방향 | 용도 |
|------|------|------|
| `discord.messages` | Bot → Processor | 사용자 메시지 전달 |
| `discord.responses` | Processor → Bot | 처리 결과 응답 |

## 토픽 상세

| 토픽 | 방향 | 발행 위치 | 구독 위치 |
|------|------|-----------|-----------|
| `discord.messages` | Bot → Processor | `bot.py:119` | `processor.py:120` |
| `discord.responses` | Processor → Bot | `processor.py:104` | `bot.py:35` |

## 메시지 포맷

### discord.messages

사용자가 Discord에서 보낸 메시지를 Message Processor로 전달합니다.

```json
{
  "channel_id": 123456789,
  "author_id": 987654321,
  "content": "사용자 메시지",
  "message_id": 111222333
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `channel_id` | integer | Discord 채널 ID |
| `author_id` | integer | 메시지 작성자 ID |
| `content` | string | 메시지 내용 |
| `message_id` | integer | Discord 메시지 ID |

### discord.responses

Message Processor에서 처리된 응답을 Discord Bot으로 전달합니다.

```json
{
  "channel_id": 123456789,
  "response": "처리된 응답",
  "original_message_id": 111222333
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `channel_id` | integer | 응답을 보낼 Discord 채널 ID |
| `response` | string | 처리된 응답 메시지 |
| `original_message_id` | integer | 원본 메시지 ID (추적용) |
