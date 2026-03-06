#!/usr/bin/env bash
set -euo pipefail

# route-result.sh - Route results to Discord, ntfy, file, or alert
# Usage: route-result.sh <mode> <task-id> <message>

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONFIG="${BOT_HOME}/config/monitoring.json"

# --- Config check ---
[[ -f "$CONFIG" ]] || { echo "ERROR: $CONFIG not found" >&2; exit 1; }

# --- Arguments ---
MODE="${1:?Usage: route-result.sh <discord|ntfy|alert|file|all> TASK_ID MESSAGE [CHANNEL]}"
TASK_ID="${2:?Usage: route-result.sh MODE TASK_ID MESSAGE}"
MESSAGE="${3:?Usage: route-result.sh MODE TASK_ID MESSAGE}"
CHANNEL="${4:-}"  # optional: channel name from tasks.json discordChannel field

# --- Message quality filter (central pre-send hook) ---
# Strips internal debug/noise lines before sending to any external channel
clean_message() {
    local msg="$1"
    # Remove noise patterns: internal paths, debug logs, SQL artifacts
    msg=$(echo "$msg" | grep -vE \
        '^\[insight\] Saved to |^sent id=|^SELECT .last_insert|^\[debug\]|^\[trace\]|^Fallback:|^NODE_PATH=|^cd /tmp/' \
        || true)
    # Trim leading/trailing blank lines
    msg=$(echo "$msg" | sed -e '/./,$!d' -e ':a' -e '/^[[:space:]]*$/{ $d; N; ba' -e '}')
    # Strip URLs (Discord 썸네일/임베드 방지)
    msg=$(echo "$msg" | sed -E 's|https?://[^ )>]+||g')
    # If everything got filtered, keep original (safety)
    if [[ -z "$msg" ]]; then msg="$1"; fi
    echo "$msg"
}

MESSAGE=$(clean_message "$MESSAGE")

# --- Discord: 2000-char chunking ---
send_discord() {
    local message="$1"
    local webhook_url
    # Channel-specific webhook lookup (falls back to default if empty or missing)
    if [[ -n "$CHANNEL" ]]; then
        webhook_url=$(jq -r --arg ch "$CHANNEL" '.webhooks[$ch] // .webhook.url' "$CONFIG")
        # If channel webhook is empty string, fallback to default
        if [[ -z "$webhook_url" || "$webhook_url" == "null" ]]; then webhook_url=$(jq -r '.webhook.url' "$CONFIG"); fi
    else
        webhook_url=$(jq -r '.webhook.url' "$CONFIG")
    fi
    local total=${#message}
    local offset=0

    while [[ $offset -lt $total ]]; do
        local chunk="${message:$offset:1990}"
        local payload
        payload=$(jq -n --arg content "$chunk" '{"content": $content, "flags": 4}')
        local http_code
        http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$webhook_url" \
            -H "Content-Type: application/json" \
            -d "$payload") || true
        if [[ "$http_code" != "200" && "$http_code" != "204" ]]; then
            echo "ERROR: Discord webhook returned HTTP $http_code for task $TASK_ID" >&2
        fi
        offset=$((offset + 1990))
        # Rate limit protection between chunks
        if [[ $offset -lt $total ]]; then sleep 1; fi
    done
}

# --- ntfy push ---
send_ntfy() {
    local title="$1"
    local message="$2"
    local server
    local topic
    server=$(jq -r '.ntfy.server' "$CONFIG")
    topic=$(jq -r '.ntfy.topic' "$CONFIG")
    curl -s -m 5 \
        -H "Title: $title" \
        -H "Priority: default" \
        -d "$message" \
        "${server}/${topic}" > /dev/null 2>&1
}

# --- Route by mode ---
case "$MODE" in
    discord)
        send_discord "$MESSAGE"
        ;;
    ntfy)
        send_ntfy "${BOT_NAME:-Bot}: $TASK_ID" "$MESSAGE"
        ;;
    alert)
        "$BOT_HOME/scripts/alert.sh" warning "$TASK_ID" "$MESSAGE"
        ;;
    file)
        # No-op: results already saved by ask-claude.sh
        echo "Result for $TASK_ID saved to results directory."
        ;;
    all)
        send_discord "$MESSAGE"
        send_ntfy "${BOT_NAME:-Bot}: $TASK_ID" "$MESSAGE"
        echo "Result for $TASK_ID saved to results directory."
        ;;
    *)
        echo "Unknown mode: $MODE" >&2
        echo "Valid modes: discord, ntfy, alert, file, all" >&2
        exit 2
        ;;
esac
