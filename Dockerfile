# Jarvis — Docker image
# Enables Jarvis to run on Windows (via Docker Desktop) and Linux servers.
#
# Build:  docker build -t jarvis .
# Run:    docker compose up -d

FROM node:22-alpine

LABEL maintainer="ramsbaby" \
      description="Jarvis AI 집사 — Discord bot + automation"

# bash, curl, git, jq (스크립트 의존성)
RUN apk add --no-cache bash curl git jq

# PM2 글로벌 설치
RUN npm install -g pm2

WORKDIR /jarvis

# 의존성 먼저 복사 (Docker 레이어 캐시 활용)
COPY discord/package*.json ./discord/
RUN cd discord && npm ci --omit=dev

# 전체 소스 복사
COPY . .

# 로그 디렉토리 생성
RUN mkdir -p logs inbox rag

ENV JARVIS_HOME=/jarvis \
    NODE_ENV=production

# PM2 런타임으로 실행 (foreground, Docker 친화적)
CMD ["pm2-runtime", "ecosystem.config.cjs"]
