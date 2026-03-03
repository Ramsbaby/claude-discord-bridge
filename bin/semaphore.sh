#!/usr/bin/env bash
set -euo pipefail

# semaphore.sh - mkdir-based slot locking for concurrency control (max 2 concurrent)
# Usage: source ~/claude-discord-bridge/bin/semaphore.sh

LOCK_DIR="/tmp/claude-discord-locks"
MAX_SLOTS=2
STALE_TIMEOUT=600  # 10 minutes

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
            continue
        fi
        # Check if lock is older than STALE_TIMEOUT
        mtime=$(stat -f %m "$slot_dir")
        if (( now - mtime > STALE_TIMEOUT )); then
            rm -rf "$slot_dir"
        fi
    done
}

acquire_slot() {
    local i slot_dir
    mkdir -p "$LOCK_DIR"
    # Try each slot
    for i in $(seq 1 "$MAX_SLOTS"); do
        slot_dir="${LOCK_DIR}/slot-${i}"
        if mkdir "$slot_dir" 2>/dev/null; then
            echo $$ > "${slot_dir}/pid"
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
            echo "$i"
            return 0
        fi
    done
    return 1
}

release_slot() {
    local slot_num="${1:?Usage: release_slot SLOT_NUMBER}"
    rm -rf "${LOCK_DIR}/slot-${slot_num}"
}
