# Stock Cralwer

한국투자증권 시세를 1시간 단위로 조회하여 PostgreSQL에 적재하는 크롤러입니다.

## 환경 변수
`.env.example`을 참고하여 다음 값을 설정하세요.

- `KIS_APP_KEY`, `KIS_APP_SECRET`, `KIS_ACCESS_TOKEN`: 한국투자증권 OpenAPI 자격 증명
- `KIS_ACCOUNT_ID`, `KIS_ACCOUNT_PRODUCT_CODE`: 계좌 정보 (실계좌/모의계좌에 맞춰 입력)
- `SYMBOLS`: 조회할 종목 코드 목록(쉼표 구분)
- `FETCH_INTERVAL_MINUTES`: 조회 주기(분 단위, 기본 60분)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_ID`, `DB_PASSWORD`: PostgreSQL 접속 정보
- `NATS`: NATS 접속 URL

## 로컬 실행
```bash
cd stock-cralwer
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 값을 실제로 채워 넣으세요
python main.py
```

## Docker 실행 (docker-compose)
`docker-compose.yml`에 정의된 `stock-cralwer`와 `postgres` 서비스를 통해 실행할 수 있습니다.

```bash
docker compose up -d stock-cralwer postgres
```

PostgreSQL에는 `stock_prices` 테이블이 자동으로 생성되며, 종목별로 고유한 가격 시점(`price_time`)에 대한 가격이 저장됩니다.
