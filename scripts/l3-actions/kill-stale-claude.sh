#!/usr/bin/env bash
set -euo pipefail
killed=0
while IFS= read -r pid; do
    kill -TERM "$pid" 2>/dev/null && killed=$((killed + 1)) || true
done < <(pgrep -f "claude -p " 2>/dev/null || true)
echo "Stale claude -p 프로세스 ${killed}개 종료"
