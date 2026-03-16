#!/usr/bin/env bash
# auto-diagnose.sh — 크론 실패 감지 후 요약 출력
# 실패 없으면 아무 출력 없이 종료 → Discord 전송 안 됨

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
CRON_LOG="$BOT_HOME/logs/cron.log"

# 최근 1시간 내 FAILED/ABORTED 확인
FAILURES=$(grep -E "FAILED|ABORTED" "$CRON_LOG" 2>/dev/null \
  | awk -v cutoff="$(date -v-1H '+%F %H:%M' 2>/dev/null || date -d '-1 hour' '+%F %H:%M' 2>/dev/null)" \
    '$0 >= "[" cutoff' \
  | tail -10)

# 실패 없으면 조용히 종료
[[ -z "$FAILURES" ]] && exit 0

# 실패 있을 때만 출력
echo "⚠️ 크론 태스크 실패 감지"
echo ""
echo "$FAILURES" | while IFS= read -r line; do
  # 태스크 ID 추출
  task=$(echo "$line" | grep -oE 'FAILED.*$|ABORTED.*$' | head -1)
  echo "- $task"
done
