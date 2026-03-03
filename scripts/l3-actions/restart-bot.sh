#!/usr/bin/env bash
set -euo pipefail
DISCORD_SERVICE="${DISCORD_SERVICE:-ai.jarvis.discord-bot}"
uid=$(id -u)
launchctl kickstart -k "gui/${uid}/${DISCORD_SERVICE}" 2>/dev/null || {
    launchctl stop "gui/${uid}/${DISCORD_SERVICE}" 2>/dev/null || true
    sleep 2
    launchctl start "gui/${uid}/${DISCORD_SERVICE}" 2>/dev/null || true
}
echo "Discord 봇 재시작 완료"
