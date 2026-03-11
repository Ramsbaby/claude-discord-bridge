#!/usr/bin/env bash
# market-holiday-guard.sh — NYSE market open/close detector
#
# Returns exit 0 if the NYSE market is open (weekday, non-holiday)
# Returns exit 1 if market is closed (weekend or holiday)
#
# Usage:
#   market-holiday-guard.sh              # check today
#   market-holiday-guard.sh 2026-07-03   # check a specific date (YYYY-MM-DD)
#
# Designed for macOS (BSD date). No external API calls.

set -euo pipefail

# --- NYSE holidays hardcoded list ---
# Format: YYYY-MM-DD
NYSE_HOLIDAYS_2026=(
    "2026-01-01"  # New Year's Day
    "2026-01-19"  # MLK Day
    "2026-02-16"  # Presidents Day
    "2026-04-03"  # Good Friday
    "2026-05-25"  # Memorial Day
    "2026-07-03"  # Independence Day (observed, Fri before Sat 4th)
    "2026-09-07"  # Labor Day
    "2026-11-26"  # Thanksgiving Day
    "2026-11-27"  # Day after Thanksgiving (early close → treat as closed)
    "2026-12-25"  # Christmas Day
)

NYSE_HOLIDAYS_2027=(
    "2027-01-01"  # New Year's Day
    "2027-01-18"  # MLK Day
    "2027-02-15"  # Presidents Day
    "2027-03-26"  # Good Friday
    "2027-05-31"  # Memorial Day
    "2027-07-05"  # Independence Day (observed, Mon after Sun 4th)
    "2027-09-06"  # Labor Day
    "2027-11-25"  # Thanksgiving Day
    "2027-11-26"  # Day after Thanksgiving
    "2027-12-24"  # Christmas (observed, Fri before Sat 25th)
)

# --- NYSE 거래 시간 체크 (시간 인수 없을 때만) ---
# NYSE: 9:30-16:00 EST(UTC-5) / EDT(UTC-4). UTC 기준 13:00-21:30 윈도우로 DST 양쪽 커버.
if [[ $# -eq 0 ]]; then
    UTC_H=$(date -u +%H); UTC_M=$(date -u +%M)
    UTC_MINS=$(( UTC_H * 60 + UTC_M ))
    # 13:00 UTC = 780분 (EDT 9:00am), 21:30 UTC = 1290분 (EST 4:30pm)
    if (( UTC_MINS < 780 || UTC_MINS >= 1290 )); then
        echo "[market-holiday-guard] CLOSED — outside NYSE hours (UTC ${UTC_H}:${UTC_M})"
        exit 1
    fi
fi

# --- Resolve target date (NY 로컬 날짜 — EST=UTC-5 기준) ---
if [[ $# -ge 1 ]]; then
    TARGET_DATE="$1"
    # Validate format
    if ! printf '%s' "$TARGET_DATE" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'; then
        echo "ERROR: Invalid date format. Use YYYY-MM-DD." >&2
        exit 2
    fi
else
    # KST 시스템에서도 NYSE 날짜(EST)로 체크 — UTC-5h로 NY 날짜 계산
    TARGET_DATE=$(date -u -v-5H +%Y-%m-%d 2>/dev/null || date -u --date='-5 hours' +%Y-%m-%d)
fi

# --- Weekend check (macOS: date -j to parse, %u = 1=Mon … 7=Sun) ---
# Extract day-of-week from the target date
DOW=$(date -jf "%Y-%m-%d" "$TARGET_DATE" "+%u" 2>/dev/null)

if [[ "$DOW" -ge 6 ]]; then
    echo "[market-holiday-guard] CLOSED — weekend (${TARGET_DATE}, DOW=${DOW})"
    exit 1
fi

# --- Holiday check ---
YEAR="${TARGET_DATE:0:4}"
declare -a HOLIDAYS=()

case "$YEAR" in
    2026)
        HOLIDAYS=("${NYSE_HOLIDAYS_2026[@]}")
        ;;
    2027)
        HOLIDAYS=("${NYSE_HOLIDAYS_2027[@]}")
        ;;
    *)
        # Unknown year: only weekend check applies; assume open
        echo "[market-holiday-guard] OPEN — no holiday data for ${YEAR}, passing weekend check"
        exit 0
        ;;
esac

for holiday in "${HOLIDAYS[@]}"; do
    # Strip inline comment (everything after #)
    clean_holiday="${holiday%% #*}"
    clean_holiday="${clean_holiday//[[:space:]]/}"
    if [[ "$TARGET_DATE" == "$clean_holiday" ]]; then
        echo "[market-holiday-guard] CLOSED — NYSE holiday (${TARGET_DATE})"
        exit 1
    fi
done

echo "[market-holiday-guard] OPEN — market is open (${TARGET_DATE})"
exit 0
