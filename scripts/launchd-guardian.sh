#!/usr/bin/env bash
set -euo pipefail

# launchd-guardian.sh - Cron-based LaunchAgent watchdog (SPOF safety net)
# Runs every 3 minutes via cron. Detects unloaded launchd services and re-registers them.
# Ensures critical LaunchAgents remain registered after system sleep or restart.

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOG_FILE="$BOT_HOME/logs/launchd-guardian.log"
ROUTE_RESULT="$BOT_HOME/bin/route-result.sh"
UID_NUM=$(id -u)

# KeepAlive services: must always have a running PID
KEEPALIVE_SERVICES=(
    "ai.jarvis.discord-bot"
)

# StartInterval services: run periodically, PID=- between runs is normal
INTERVAL_SERVICES=(
    "ai.jarvis.watchdog"
)

PLIST_DIR="$HOME/Library/LaunchAgents"

mkdir -p "$(dirname "$LOG_FILE")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [guardian] $*" >> "$LOG_FILE"; }

# Hourly heartbeat only (minute 00-02 to match */3 cron)
minute=$(date +%M)
is_heartbeat=false
if [[ "$minute" == "00" || "$minute" == "01" || "$minute" == "02" ]]; then
    is_heartbeat=true
fi

recovered=0

check_loaded() {
    local service="$1"
    local plist_file="${PLIST_DIR}/${service}.plist"
    [[ ! -f "$plist_file" ]] && return 0
    local status_line
    status_line=$(launchctl list 2>/dev/null | grep "$service" || true)
    if [[ -z "$status_line" ]]; then
        log "RECOVERY: $service not loaded, re-registering"
        if launchctl bootstrap "gui/${UID_NUM}" "$plist_file" 2>/dev/null; then
            log "RECOVERY: $service registered via bootstrap"
        elif launchctl load "$plist_file" 2>/dev/null; then
            log "RECOVERY: $service registered via load (fallback)"
        else
            log "ERROR: Failed to register $service"
            return 0
        fi
        recovered=$(( recovered + 1 ))
    fi
}

# KeepAlive: must always have a running PID — kickstart if PID=-
for service in "${KEEPALIVE_SERVICES[@]}"; do
    plist_file="${PLIST_DIR}/${service}.plist"
    [[ ! -f "$plist_file" ]] && continue
    status_line=$(launchctl list 2>/dev/null | grep "$service" || true)
    if [[ -z "$status_line" ]]; then
        log "RECOVERY: $service not loaded, re-registering"
        if launchctl bootstrap "gui/${UID_NUM}" "$plist_file" 2>/dev/null; then
            log "RECOVERY: $service registered via bootstrap"
        elif launchctl load "$plist_file" 2>/dev/null; then
            log "RECOVERY: $service registered via load (fallback)"
        else
            log "ERROR: Failed to register $service"
            continue
        fi
        recovered=$(( recovered + 1 ))
    else
        pid=$(echo "$status_line" | awk '{print $1}')
        if [[ "$pid" == "-" ]]; then
            log "RECOVERY: $service not running (PID=-), kickstarting"
            launchctl kickstart -k "gui/${UID_NUM}/${service}" 2>/dev/null || true
            recovered=$(( recovered + 1 ))
        fi
    fi
done

# StartInterval: periodic services — only check if loaded, never kickstart for PID=-
for service in "${INTERVAL_SERVICES[@]}"; do
    check_loaded "$service"
done

# Send alert on recovery
if (( recovered > 0 )); then
    if [[ -x "$ROUTE_RESULT" ]]; then
        "$ROUTE_RESULT" discord "guardian" "[Bot Guardian] Recovered ${recovered} service(s)" 2>/dev/null || true
    fi
fi

# Heartbeat log (hourly only)
if [[ "$is_heartbeat" == "true" ]]; then
    total=$(( ${#KEEPALIVE_SERVICES[@]} + ${#INTERVAL_SERVICES[@]} ))
    log "Heartbeat: checked ${total} services, recovered=$recovered"
fi
