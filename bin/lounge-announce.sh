#!/bin/bash
set -euo pipefail

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
LOUNGE_FILE="${BOT_HOME}/state/lounge.json"
PRUNE_THRESHOLD=600000  # 10 minutes in milliseconds

# Create state directory
mkdir -p "${BOT_HOME}/state"

# Initialize file if it doesn't exist
if [[ ! -f "$LOUNGE_FILE" ]]; then
  echo '{"activities": []}' > "$LOUNGE_FILE"
fi

# Helper function to prune old entries
prune_entries() {
  local json="$1"
  local now=$(python3 -c 'import time; print(int(time.time()*1000))')

  echo "$json" | jq --arg now "$now" '.activities |= map(select(($now | tonumber) - .ts < '"$PRUNE_THRESHOLD"'))'
}

if [[ $# -lt 1 ]]; then
  echo "Usage: lounge-announce.sh TASK_ID [activity text | --done]" >&2
  exit 1
fi

TASK_ID="$1"
CURRENT_STATE=$(cat "$LOUNGE_FILE")

# Prune old entries first
CURRENT_STATE=$(prune_entries "$CURRENT_STATE")

if [[ "${2:-}" == "--done" ]]; then
  # Remove entry for taskId
  NEW_STATE=$(echo "$CURRENT_STATE" | jq --arg taskId "$TASK_ID" '.activities |= map(select(.taskId != $taskId))')
else
  # Announce: add or update entry
  ACTIVITY="${2:-}"
  TIMESTAMP=$(python3 -c 'import time; print(int(time.time()*1000))')

  # Remove existing entry for this taskId
  NEW_STATE=$(echo "$CURRENT_STATE" | jq --arg taskId "$TASK_ID" '.activities |= map(select(.taskId != $taskId))')

  # Add new entry
  NEW_STATE=$(echo "$NEW_STATE" | jq --arg taskId "$TASK_ID" --arg activity "$ACTIVITY" --arg ts "$TIMESTAMP" \
    '.activities += [{ "taskId": $taskId, "activity": $activity, "ts": ($ts | tonumber) }]')
fi

echo "$NEW_STATE" > "$LOUNGE_FILE"
