#!/usr/bin/env bash
set -euo pipefail
SERVICE="ai.jarvis.discord-bot"
uid=$(id -u)
launchctl kickstart -k "gui/${uid}/${SERVICE}" 2>/dev/null
echo "Discord 봇 재시작 완료"
