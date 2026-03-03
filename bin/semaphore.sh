#!/usr/bin/env bash
set -euo pipefail

# semaphore.sh - mkdir-based slot locking with cross-process global counter
# Usage: source ~/.jarvis/bin/semaphore.sh

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
LOCK_DIR="/tmp/claude-discord-locks"
MAX_SLOTS=2
MAX_GLOBAL=4
STALE_TIMEOUT=600  # 10 minutes
GLOBAL_COUNT_FILE="${BOT_HOME}/state/claude-global.count"
GLOBAL_LOCK_FILE="${BOT_HOME}/state/claude-global.lock"

# Ensure state directory exists
mkdir -p "${BOT_HOME}/state"

# --- Global counter helpers (mkdir-based locking, macOS compatible) ---

_read_global_count() {
    local count=0
    if [[ -f "$GLOBAL_COUNT_FILE" ]]; then
        count=$(cat "$GLOBAL_COUNT_FILE" 2>/dev/null || echo "0")
        # Validate numeric
        if ! [[ "$count" =~ ^[0-9]+$ ]]; then
            count=0
        fi
    fi
    echo "$count"
}

# Acquire exclusive lock via mkdir (atomic on all POSIX systems)
_acquire_global_lock() {
    local attempts=0
    while ! mkdir "$GLOBAL_LOCK_FILE" 2>/dev/null; do
        attempts=$(( attempts + 1 ))
        if [[ "$attempts" -ge 50 ]]; then
            # Stale lock check (> 30s old)
            local lock_mtime now_ts
            now_ts=$(date +%s)
            lock_mtime=$(stat -f %m "$GLOBAL_LOCK_FILE" 2>/dev/null || echo "0")
            if (( now_ts - lock_mtime > 30 )); then
                rm -rf "$GLOBAL_LOCK_FILE" 2>/dev/null || true
            else
                return 1
            fi
        fi
        # Brief spin (0.05s)
        sleep 0.05
    done
    return 0
}

_release_global_lock() {
    rm -rf "$GLOBAL_LOCK_FILE" 2>/dev/null || true
}

_increment_global_count() {
    if _acquire_global_lock; then
        local count
        count=$(_read_global_count)
        echo $(( count + 1 )) > "$GLOBAL_COUNT_FILE"
        _release_global_lock
    fi
}

_decrement_global_count() {
    if _acquire_global_lock; then
        local count
        count=$(_read_global_count)
        if [[ "$count" -gt 0 ]]; then
            echo $(( count - 1 )) > "$GLOBAL_COUNT_FILE"
        else
            echo "0" > "$GLOBAL_COUNT_FILE"
        fi
        _release_global_lock
    fi
}

_check_global_available() {
    local count
    count=$(_read_global_count)
    if [[ "$count" -ge "$MAX_GLOBAL" ]]; then
        return 1
    fi
    return 0
}

check_stale_locks() {
    local i slot_dir pid pid_file mtime now
    now=$(date +%s)
    for i in $(seq 1 "$MAX_SLOTS"); do
        slot_dir="${LOCK_DIR}/slot-${i}"
        [[ -d "$slot_dir" ]] || continue
        pid_file="${slot_dir}/pid"
        [[ -f "$pid_file" ]] || { rm -rf "$slot_dir"; continue; }
        pid=$(cat "$pid_file")
        # Check if process is still alive
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -rf "$slot_dir"
            _decrement_global_count
            continue
        fi
        # Check if lock is older than STALE_TIMEOUT
        mtime=$(stat -f %m "$slot_dir")
        if (( now - mtime > STALE_TIMEOUT )); then
            rm -rf "$slot_dir"
            _decrement_global_count
        fi
    done
}

acquire_slot() {
    local i slot_dir wait_elapsed=0
    mkdir -p "$LOCK_DIR"

    # Wait for global availability (max 60s)
    while ! _check_global_available; do
        if [[ "$wait_elapsed" -ge 60 ]]; then
            return 1
        fi
        sleep 2
        wait_elapsed=$(( wait_elapsed + 2 ))
    done

    # Try each slot
    for i in $(seq 1 "$MAX_SLOTS"); do
        slot_dir="${LOCK_DIR}/slot-${i}"
        if mkdir "$slot_dir" 2>/dev/null; then
            echo $$ > "${slot_dir}/pid"
            _increment_global_count
            echo "$i"
            return 0
        fi
    done
    # All slots taken - check for stale locks and retry
    check_stale_locks
    for i in $(seq 1 "$MAX_SLOTS"); do
        slot_dir="${LOCK_DIR}/slot-${i}"
        if mkdir "$slot_dir" 2>/dev/null; then
            echo $$ > "${slot_dir}/pid"
            _increment_global_count
            echo "$i"
            return 0
        fi
    done
    return 1
}

release_slot() {
    local slot_num="${1:?Usage: release_slot SLOT_NUMBER}"
    rm -rf "${LOCK_DIR}/slot-${slot_num}"
    _decrement_global_count
}
