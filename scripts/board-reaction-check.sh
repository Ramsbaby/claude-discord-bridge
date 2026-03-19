#!/usr/bin/env bash
# board-reaction-check.sh — Standalone script to check all pending board reactions
# across all known agents / task authors.
#
# Usage: board-reaction-check.sh
#
# Required env vars (loaded from ~/.jarvis/.env if present):
#   BOARD_URL      — Board API base URL
#   AGENT_API_KEY  — Agent auth key for x-agent-key header

set -euo pipefail

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# --- Load .env if available ---
if [[ -f "${BOT_HOME}/.env" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${BOT_HOME}/.env"
    set +a
fi

BOARD_URL="${BOARD_URL:-https://jarvis-board-production.up.railway.app}"

# --- Source library ---
source "${BOT_HOME}/lib/board-reaction.sh"

# --- Auth check ---
if [[ -z "${AGENT_API_KEY:-}" ]]; then
    echo "ERROR: AGENT_API_KEY is not set. Set it in ~/.jarvis/.env or environment." >&2
    exit 1
fi

# --- Collect known agent/author names from tasks.json ---
TASKS_FILE="${BOT_HOME}/config/tasks.json"
if [[ -f "${BOT_HOME}/config/effective-tasks.json" ]]; then
    TASKS_FILE="${BOT_HOME}/config/effective-tasks.json"
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required for board-reaction-check.sh" >&2
    exit 2
fi

# Collect unique authors: tasks with explicit "author" field, then fall back to task "id"
mapfile -t AUTHORS < <(
    jq -r '.tasks[] | .author // .id' "$TASKS_FILE" 2>/dev/null | sort -u
)

if [[ ${#AUTHORS[@]} -eq 0 ]]; then
    echo "No tasks found in ${TASKS_FILE}."
    exit 0
fi

echo "=========================================="
echo " Board Reaction Check — $(date '+%F %T')"
echo " Board: ${BOARD_URL}"
echo "=========================================="
echo ""

TOTAL_PENDING=0

for author in "${AUTHORS[@]}"; do
    if [[ -z "$author" ]]; then continue; fi

    pending_json=$(board_get_pending_reactions "$author") || pending_json="[]"

    if [[ "$pending_json" == "[]" || -z "$pending_json" ]]; then
        continue
    fi

    # Count items
    count=0
    if command -v jq >/dev/null 2>&1; then
        count=$(echo "$pending_json" | jq 'length' 2>/dev/null) || count=0
    fi

    if [[ "$count" -eq 0 ]]; then
        continue
    fi

    TOTAL_PENDING=$(( TOTAL_PENDING + count ))

    echo "── Agent: ${author} (${count}건 미처리)"
    board_format_reaction_context "$pending_json"
    echo ""
done

echo "=========================================="
if [[ "$TOTAL_PENDING" -eq 0 ]]; then
    echo " 미처리 반응 없음. 모든 승인/반려가 처리되었습니다."
else
    echo " 총 ${TOTAL_PENDING}건의 미처리 반응이 있습니다."
    echo " 해당 에이전트가 다음 실행 시 자동으로 처리합니다."
fi
echo "=========================================="
