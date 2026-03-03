#!/usr/bin/env bash
set -euo pipefail
BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
# Delete log files older than 30 days
find "$BOT_HOME/logs" -name "*.log" -mtime +30 -delete 2>/dev/null || true
find "$BOT_HOME/logs" -name "*.jsonl" -mtime +30 -delete 2>/dev/null || true
# Truncate files larger than 10MB
find "$BOT_HOME/logs" -size +10M -name "*.log" | while read -r f; do
    tail -5000 "$f" > "${f}.tmp" && mv "${f}.tmp" "$f"
done
echo "로그 정리 완료: $(du -sh "$BOT_HOME/logs" | awk '{print $1}')"
