# Jarvis — AI Company-in-a-Box Docker Image
# Usage: docker build -t jarvis . && docker compose up -d

FROM node:20-alpine

# System deps: claude CLI, coreutils (timeout), jq, bash, git
RUN apk add --no-cache bash coreutils jq git curl \
    && npm install -g @anthropic-ai/claude-code

# On Linux, `timeout` exists natively; create gtimeout alias for ask-claude.sh compat
RUN ln -sf "$(command -v timeout)" /usr/local/bin/gtimeout

WORKDIR /app

# Install Node dependencies first (layer cache)
COPY discord/package.json discord/package-lock.json ./discord/
RUN cd discord && npm install --production

# Copy application code
COPY bin/ ./bin/
COPY lib/ ./lib/
COPY discord/discord-bot.js discord/.env.example discord/personas.json.example ./discord/
COPY discord/lib/ ./discord/lib/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY watchdog/ ./watchdog/

# Fix lib/node_modules symlink for container paths
RUN rm -f lib/node_modules && ln -s /app/discord/node_modules lib/node_modules

# Runtime directories (volumes override these at runtime)
RUN mkdir -p /app/context /app/state/pids /app/logs /app/rag /app/results

# Non-secret config defaults
ENV NODE_ENV=production
ENV HOME=/root

WORKDIR /app/discord
CMD ["node", "discord-bot.js"]
