#!/usr/bin/env bash
# boram-alarm.sh — 보람님 채널 커스텀 알림 전송
# Usage: boram-alarm.sh "메시지 내용"
# crontab 예시: 34 20 17 3 * bash ~/.jarvis/scripts/boram-alarm.sh "약 드실 시간이에요 💊💕"

set -euo pipefail

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
MSG="${1:-}"

if [[ -z "$MSG" ]]; then
  echo "Usage: boram-alarm.sh '메시지'" >&2
  exit 1
fi

WEBHOOK=$(jq -r '.webhooks["jarvis-boram"]' "$BOT_HOME/config/monitoring.json")

if [[ -z "$WEBHOOK" || "$WEBHOOK" == "null" ]]; then
  echo "ERROR: jarvis-boram webhook not found in monitoring.json" >&2
  exit 1
fi

curl -sS -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"$MSG\"}" \
  -o /dev/null

echo "[$(date '+%F %T')] boram-alarm: 전송 완료 — $MSG" >> "$BOT_HOME/logs/cron.log"
