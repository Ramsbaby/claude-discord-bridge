#!/usr/bin/env bash
# e2e-cron.sh - E2E self-diagnostic cron wrapper (L1: auto-run, ntfy escalation on failure only)
# Usage: e2e-cron.sh
# Schedule: 30 3 * * * (daily 03:30, runs after rag-health at 03:00)
set -uo pipefail

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG_FILE="${BOT_HOME}/logs/e2e-cron.log"
RESULT_FILE="${BOT_HOME}/results/e2e-health/$(date +%F).txt"
MONITORING="${BOT_HOME}/config/monitoring.json"

mkdir -p "$(dirname "$RESULT_FILE")" "$(dirname "$LOG_FILE")"

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(timestamp)] $1" >> "$LOG_FILE"; }

log "START"

# Run E2E tests (strip ANSI color codes)
OUTPUT=$("${BOT_HOME}/scripts/e2e-test.sh" 2>&1 | sed 's/\x1b\[[0-9;]*m//g') || true
EXIT_CODE=$?

# Save results to file
echo "$OUTPUT" > "$RESULT_FILE"

# Extract statistics
PASS_COUNT=$(echo "$OUTPUT" | grep -c "✅ PASS" || true)
FAIL_COUNT=$(echo "$OUTPUT" | grep -c "❌ FAIL" || true)
SKIP_COUNT=$(echo "$OUTPUT" | grep -c "⏭️  SKIP" || true)
TOTAL=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))

SUMMARY="${PASS_COUNT}/${TOTAL} passed"
[[ $FAIL_COUNT -gt 0 ]] && SUMMARY="${SUMMARY}, ${FAIL_COUNT} FAILED"

log "RESULT: ${SUMMARY} (exit: ${EXIT_CODE})"

if [[ $FAIL_COUNT -gt 0 ]]; then
    # Extract failed items
    FAILED_ITEMS=$(echo "$OUTPUT" | grep "❌ FAIL" | sed 's/❌ FAIL: //' | tr '\n' ', ' | sed 's/,$//')
    ALERT_MSG="E2E self-diagnostic failed (${FAIL_COUNT} items): ${FAILED_ITEMS}"

    log "ALERT: ${ALERT_MSG}"

    # ntfy escalation
    NTFY_SERVER=$(jq -r '.ntfy.server' "$MONITORING" 2>/dev/null || echo "https://ntfy.sh")
    NTFY_TOPIC=$(jq -r '.ntfy.topic' "$MONITORING" 2>/dev/null || echo "")
    if [[ -n "$NTFY_TOPIC" ]]; then
        curl -sf -m 5 \
            -H "Title: ⚠️ E2E Failed" \
            -H "Priority: high" \
            -H "Tags: warning" \
            -d "$ALERT_MSG" \
            "${NTFY_SERVER}/${NTFY_TOPIC}" > /dev/null 2>&1 || true
    fi

    # Clean up old results (older than 30 days)
    find "$(dirname "$RESULT_FILE")" -name "*.txt" -mtime +30 -delete 2>/dev/null || true
    exit 1
fi

log "OK: ${SUMMARY}"

# Clean up old results (older than 30 days)
find "$(dirname "$RESULT_FILE")" -name "*.txt" -mtime +30 -delete 2>/dev/null || true
exit 0
