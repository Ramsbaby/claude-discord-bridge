#!/usr/bin/env bash
set -euo pipefail
BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
# 7일 이상 된 로그 파일 삭제
before=$(du -sh "$BOT_HOME/logs" | awk '{print $1}')
find "$BOT_HOME/logs" -name "*.log" -mtime +7 -delete
find "$BOT_HOME/logs" -name "*.jsonl" -mtime +7 -delete
after=$(du -sh "$BOT_HOME/logs" | awk '{print $1}')
echo "로그 정리 완료: ${before} → ${after}"
