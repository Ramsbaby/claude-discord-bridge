#!/usr/bin/env bash
# boram-briefing.sh — 보람님 채널 아침 브리핑 (오늘 Preply 수업 일정 + 수입)
# Usage: boram-briefing.sh [YYYY-MM-DD]
# 매일 07:30 launchd(ai.jarvis.boram-briefing)에서 자동 실행

set -euo pipefail

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
TARGET_DATE="${1:-$(TZ=Asia/Seoul date +%Y-%m-%d)}"
WEBHOOK="https://discord.com/api/webhooks/1482899334940069953/luZX4DSYDvXvcZlIoyUEwyzqCXhdgoWSslHHM0LEmH_VW2JKHUT8Sjw_U9YQ8hAjcchr"
LOGFILE="$BOT_HOME/logs/cron.log"

log() { echo "[$(TZ=Asia/Seoul date '+%F %T')] boram-briefing: $*" >> "$LOGFILE"; }

send_discord() {
  local msg="$1"
  local payload
  payload=$(python3 -c "import json, sys; print(json.dumps({'content': sys.argv[1]}))" "$msg")
  curl -sS -X POST "$WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    -o /dev/null
}

# Preply API 조회 (금액 포함 실시간 데이터)
RAW=$(bash "$BOT_HOME/scripts/preply-today.sh" "$TARGET_DATE" 2>/dev/null \
  || echo '{"error":"preply-today failed"}')

# 에러 체크
ERR=$(echo "$RAW" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null || echo "parse_error")
if [[ -n "$ERR" ]]; then
  send_discord "📅 오늘 수업 일정 조회 실패 😅 ($ERR)"
  log "FAIL — $ERR"
  exit 1
fi

# 메시지 빌드
MSG=$(echo "$RAW" | python3 "$BOT_HOME/scripts/_boram_briefing_fmt.py" "$TARGET_DATE" 2>/dev/null \
  || echo "📅 일정 파싱 실패 😅")

send_discord "$MSG"
log "SUCCESS — $TARGET_DATE"
