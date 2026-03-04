#!/usr/bin/env bash
set -euo pipefail

# sync-discord-token.sh — Update Discord bot token and restart
# Usage: sync-discord-token.sh <new-token>

SCRIPT_NAME="sync-discord-token"
NEW_TOKEN="${1:?Usage: $0 <new-discord-bot-token>}"
BOT_ENV="$HOME/claude-discord-bridge/discord/.env"
LOG="$HOME/claude-discord-bridge/logs/sync-discord-token.log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$SCRIPT_NAME] $*" | tee -a "$LOG"; }

log "Token sync started"

# 1. Update .env
if [[ -f "$BOT_ENV" ]]; then
    sed -i.bak "s|^DISCORD_TOKEN=.*|DISCORD_TOKEN=${NEW_TOKEN}|" "$BOT_ENV"
    rm -f "${BOT_ENV}.bak"
    log ".env updated"
else
    log "WARN: .env not found — copy from .env.example and retry"
    exit 1
fi

# 2. Restart Discord bot
log "Restarting Discord bot..."
launchctl kickstart -k "gui/$(id -u)/${DISCORD_SERVICE:-ai.claude-discord-bot}" 2>/dev/null || true
sleep 3

log "Done"
echo "Token sync complete"
