#!/usr/bin/env bash
set -euo pipefail
BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
before=$(du -sh "$BOT_HOME/results" 2>/dev/null | awk '{print $1}')
find "$BOT_HOME/results" -name "*.md" -mtime +30 -delete 2>/dev/null || true
after=$(du -sh "$BOT_HOME/results" 2>/dev/null | awk '{print $1}')
echo "결과 파일 정리 완료: ${before} → ${after}"
