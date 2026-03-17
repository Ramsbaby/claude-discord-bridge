#!/usr/bin/env bash
# boram-meds-reminder.sh — 약 복용 알림 (보람님 전용)
# Usage: boram-meds-reminder.sh [아침|점심|저녁]
# 5일 한정: END_DATE 이후 자동 종료

set -euo pipefail
BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
PERIOD="${1:-아침}"
END_DATE="2026-03-21"
WEBHOOK="https://discord.com/api/webhooks/1482899334940069953/luZX4DSYDvXvcZlIoyUEwyzqCXhdgoWSslHHM0LEmH_VW2JKHUT8Sjw_U9YQ8hAjcchr"

TODAY=$(TZ=Asia/Seoul date +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
if [[ "$TODAY" > "$END_DATE" ]]; then
  exit 0
fi

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
