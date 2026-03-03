#!/usr/bin/env bash
set -euo pipefail
BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
# Delete result files older than 7 days
find "$BOT_HOME/results" -mtime +7 -type f -delete 2>/dev/null || true
find "$BOT_HOME/results" -empty -type d -delete 2>/dev/null || true
echo "결과 파일 정리 완료"
