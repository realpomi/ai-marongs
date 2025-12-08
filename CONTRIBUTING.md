# Contributing to ai-marongs

이 프로젝트에 기여해 주셔서 감사합니다! 🎉

## 개발 환경 설정

1. 저장소를 포크하고 클론합니다:
```bash
git clone https://github.com/YOUR_USERNAME/ai-marongs.git
cd ai-marongs
```

2. NATS 서버를 시작합니다:
```bash
docker-compose up -d
```

3. 각 프로젝트의 가상 환경을 설정합니다:

**Discord Bot:**
```bash
cd discord-bot
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# .env 파일 편집
```

**Message Processor:**
```bash
cd message-processor
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

## 코딩 스타일

- Python 코드는 PEP 8 스타일 가이드를 따릅니다
- 함수와 클래스에는 docstring을 추가합니다
- 타입 힌트를 사용합니다
- 변수명과 함수명은 명확하고 설명적으로 작성합니다

## 커밋 메시지

커밋 메시지는 다음 형식을 따릅니다:

```
<타입>: <간단한 설명>

<상세 설명 (선택사항)>
```

타입:
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 포맷팅
- `refactor`: 코드 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드 프로세스 또는 도구 변경

예시:
```
feat: Add weather command to message processor

Added a new weather command that fetches weather information
from an external API and formats it for Discord.
```

## Pull Request 프로세스

1. 새로운 기능 브랜치를 생성합니다:
```bash
git checkout -b feature/your-feature-name
```

2. 변경사항을 커밋합니다

3. 테스트를 실행하여 모든 것이 작동하는지 확인합니다

4. Pull Request를 생성합니다:
   - 변경사항을 명확하게 설명합니다
   - 관련 이슈를 참조합니다
   - 스크린샷이나 예제를 포함합니다 (해당되는 경우)

## 버그 리포트

버그를 발견하셨나요? 이슈를 생성해 주세요:

- 명확한 제목과 설명
- 재현 단계
- 예상 동작과 실제 동작
- 환경 정보 (OS, Python 버전 등)

## 기능 제안

새로운 기능을 제안하고 싶으신가요?

- 이슈를 생성하고 "enhancement" 라벨을 추가합니다
- 제안하는 기능과 그 이유를 설명합니다
- 가능하면 사용 예제를 포함합니다

## 질문

질문이 있으신가요? GitHub Discussions 또는 Issues를 활용해 주세요!

## 행동 강령

- 존중하고 포용적인 태도를 유지합니다
- 건설적인 피드백을 제공합니다
- 다른 관점을 받아들입니다

감사합니다! 🙏
