#!/usr/bin/env bash
set -euo pipefail

QUEUE_DIR="$HOME/claude-discord-bridge/queue"
PROCESSED_DIR="$QUEUE_DIR/processed"
WEBHOOK_URL=$(python3 -c "import json; print(json.load(open('$HOME/claude-discord-bridge/config/monitoring.json'))['webhooks']['bot'])" 2>/dev/null || echo "")

mkdir -p "$QUEUE_DIR" "$PROCESSED_DIR"

NOW_EPOCH=$(date +%s)

for f in "$QUEUE_DIR"/*.json; do
  [ -f "$f" ] || continue

  SCHEDULE_AT=$(python3 -c "import json,sys; print(json.load(open('$f'))['schedule_at'])" 2>/dev/null || echo "")
  [ -z "$SCHEDULE_AT" ] && continue

  # Convert ISO to epoch
  TARGET_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${SCHEDULE_AT%%.*}" +%s 2>/dev/null || echo "0")
  if [ "$NOW_EPOCH" -lt "$TARGET_EPOCH" ]; then
    continue
  fi

  PROMPT=$(python3 -c "import json; print(json.load(open('$f'))['prompt'])" 2>/dev/null || echo "")
  CHANNEL=$(python3 -c "import json; print(json.load(open('$f')).get('channel',''))" 2>/dev/null || echo "")
  [ -z "$PROMPT" ] && continue

  # Run via ask-claude.sh
  RESULT=$(/bin/bash "$HOME/claude-discord-bridge/bin/ask-claude.sh" "$PROMPT" 2>&1 | head -c 1800 || echo "실행 실패")

  # Send result to Discord webhook
  if [ -n "$WEBHOOK_URL" ]; then
    PAYLOAD=$(python3 -c "
import json,sys
msg = '📋 **예약 태스크 완료**\n> ' + sys.argv[1][:200] + '\n\n' + sys.argv[2][:1500]
print(json.dumps({'content': msg}))
" "$PROMPT" "$RESULT" 2>/dev/null || echo '{"content":"예약 태스크 완료 (결과 파싱 실패)"}')
    curl -s -H "Content-Type: application/json" -d "$PAYLOAD" "$WEBHOOK_URL" >/dev/null 2>&1 || true
  fi

  # Move to processed
  mv "$f" "$PROCESSED_DIR/" 2>/dev/null || rm -f "$f"
done
