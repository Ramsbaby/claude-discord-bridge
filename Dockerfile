FROM node:22-alpine

LABEL maintainer="ramsbaby" \
      description="Jarvis AI 집사 — Discord bot + automation"

# bash, curl, git, jq, dcron (crontab 지원)
RUN apk add --no-cache bash curl git jq dcron

# PM2 글로벌 설치
RUN npm install -g pm2

WORKDIR /jarvis

# 의존성 먼저 복사 (Docker 레이어 캐시 활용)
COPY discord/package*.json ./discord/
RUN cd discord && npm ci --omit=dev

# 전체 소스 복사
COPY . .

# 디렉토리 생성
RUN mkdir -p logs inbox rag context state results

ENV JARVIS_HOME=/jarvis \
    NODE_ENV=production

# crond 시작 후 PM2 런타임 실행
CMD ["/bin/bash", "-c", "crond && pm2-runtime ecosystem.config.cjs"]
