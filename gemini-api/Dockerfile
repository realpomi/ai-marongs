FROM oven/bun:1-alpine

WORKDIR /app

# 의존성 파일 복사
COPY package.json bun.lock* ./

# 의존성 설치
RUN bun install --frozen-lockfile || bun install

# 소스 코드 복사
COPY . .

# 포트 노출
EXPOSE 3000

# 서버 실행
CMD ["bun", "run", "start"]
