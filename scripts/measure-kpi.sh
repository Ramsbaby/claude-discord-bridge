#!/usr/bin/env bash
set -euo pipefail

# measure-kpi.sh - Bot system team KPI measurement
# Usage: measure-kpi.sh [--discord] [--days N]

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG="${BOT_HOME}/logs/task-runner.jsonl"
MONITORING="${BOT_HOME}/config/monitoring.json"
DAYS=7
SEND_DISCORD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --discord) SEND_DISCORD=true; shift ;;
        --days)    DAYS="$2"; shift 2 ;;
        *)         shift ;;
    esac
done

# Per-team SUCCESS/FAIL aggregation (bash 3.x compatible, explicit local vars)
team_kpi() {
    local label="$1"; shift
    local total=0 ok=0 t_total t_ok matched
    for task_id in "$@"; do
        matched=$(grep "\"task\":\"${task_id}\"" "$LOG" 2>/dev/null) || matched=""
        if [[ -n "$matched" ]]; then
            t_total=$(printf '%s\n' "$matched" | grep -cv "\"status\":\"start\"" 2>/dev/null) || t_total=0
            t_ok=$(printf '%s\n' "$matched" | grep -c  "\"status\":\"success\"" 2>/dev/null) || t_ok=0
            total=$((total + t_total))
            ok=$((ok + t_ok))
        fi
    done
    if [[ $total -eq 0 ]]; then
        printf '%-20s NO_DATA\n' "$label"
    else
        local rate=$((ok * 100 / total))
        local icon="RED   "
        [[ $rate -ge 90 ]] && icon="GREEN "
        [[ $rate -ge 70 && $rate -lt 90 ]] && icon="YELLOW"
        printf '%-20s %s %3d%% (%d/%d)\n' "$label" "$icon" "$rate" "$ok" "$total"
    fi
}

# Generate report
NOW=$(date '+%Y-%m-%d %H:%M')
REPORT=$(
    echo "Bot System KPI Report (last ${DAYS} days)"
    echo "${NOW}"
    echo "================================="
    team_kpi "Council"    council-insight weekly-kpi
    team_kpi "Trend"      news-briefing
    team_kpi "Career"     career-weekly
    team_kpi "Academy"    academy-support
    team_kpi "Record"     record-daily memory-cleanup
    team_kpi "Infra"      infra-daily system-health security-scan rag-health disk-alert
    team_kpi "Brand"      brand-weekly weekly-report
    echo "================================="
)

# Final verdict
if echo "$REPORT" | grep -q "RED"; then
    VERDICT="WARNING: RED team detected -- check detailed council report"
elif echo "$REPORT" | grep -q "YELLOW"; then
    VERDICT="NOTICE: Some teams need improvement"
else
    VERDICT="OK: All teams meeting targets"
fi

REPORT="${REPORT}
${VERDICT}"

echo "$REPORT"

# Discord delivery
if $SEND_DISCORD; then
    WEBHOOK=$(jq -r '.webhooks["bot-ceo"]' "$MONITORING" 2>/dev/null || echo "")
    if [[ -n "$WEBHOOK" && "$WEBHOOK" != "null" ]]; then
        PAYLOAD=$(jq -n --arg c "$REPORT" '{"content":$c}')
        HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK" \
            -H "Content-Type: application/json" -d "$PAYLOAD")
        if [[ "$HTTP" != "204" ]]; then echo "WARNING: Discord delivery failed: HTTP $HTTP" >&2; fi
    fi
fi
