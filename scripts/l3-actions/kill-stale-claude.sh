#!/usr/bin/env bash
set -euo pipefail
STALE_MINUTES="${1:-15}"
killed=0
while IFS= read -r pid; do
    elapsed_min=$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ' | awk -F'[-:]' '{
        n = NF
        if (n == 4) print ($1*1440 + $2*60 + $3 + $4/60)
        else if (n == 3) print ($1*60 + $2 + $3/60)
        else if (n == 2) print ($1 + $2/60)
        else print 0
    }' | awk '{printf "%d", $1}')
    if (( elapsed_min >= STALE_MINUTES )); then
        kill -TERM "$pid" 2>/dev/null || true
        killed=$((killed + 1))
    fi
done < <(pgrep -f "claude -p " 2>/dev/null || true)
echo "스테일 claude -p 프로세스 ${killed}개 종료 (${STALE_MINUTES}분 초과)"
