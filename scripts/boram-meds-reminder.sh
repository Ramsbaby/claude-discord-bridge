#!/usr/bin/env bash
# boram-meds-reminder.sh — 약 복용 알림 (보람님 전용)
# Usage: boram-meds-reminder.sh [아침|점심|저녁]

set -euo pipefail
BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
PERIOD="${1:-아침}"
WEBHOOK="https://discord.com/api/webhooks/1482899334940069953/luZX4DSYDvXvcZlIoyUEwyzqCXhdgoWSslHHM0LEmH_VW2JKHUT8Sjw_U9YQ8hAjcchr"

case "$PERIOD" in
  아침) MSG="☀️ 보람님, 아침 약 드실 시간이에요! 💊💕" ;;
  점심) MSG="🌤️ 보람님, 점심 약 드실 시간이에요! 💊💕" ;;
  저녁) MSG="🌙 보람님, 저녁 약 드실 시간이에요! 💊💕" ;;
  *) echo "Unknown period: $PERIOD" >&2; exit 1 ;;
esac

curl -sS -X POST "$WEBHOOK" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"$MSG\"}" \
  -o /dev/null

echo "[$(date '+%F %T')] boram-meds: $PERIOD 알림 전송 완료" >> "$BOT_HOME/logs/cron.log"
