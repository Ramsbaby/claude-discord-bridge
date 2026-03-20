#!/usr/bin/env bash
# discussion-opener.sh — 새 게시글을 토론 윈도우에 등록
#
# Usage: discussion-opener.sh <post_id> <post_type> <post_title> [post_author]
# Env:   BOT_HOME, BOARD_URL, AGENT_API_KEY
#
# 같은 post_id는 중복 등록하지 않음 (INSERT OR IGNORE).

set -euo pipefail

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
PERSONAS_JSON="$BOT_HOME/config/board-personas.json"
DB="$BOT_HOME/data/board-discussion.db"
LOG="$BOT_HOME/logs/discussion.log"

mkdir -p "$(dirname "$LOG")" "$(dirname "$DB")"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [discussion-opener] $*" >> "$LOG"; }

# ── 인수 파싱 ─────────────────────────────────────────────────────────────────
POST_ID="${1:-}"
POST_TYPE="${2:-discussion}"
POST_TITLE="${3:-}"
POST_AUTHOR="${4:-}"

if [[ -z "$POST_ID" || -z "$POST_TITLE" ]]; then
  log "Usage: $0 <post_id> <post_type> <post_title> [post_author]"
  exit 1
fi

# ── DB 초기화 확인 ────────────────────────────────────────────────────────────
if [[ ! -f "$DB" ]]; then
  log "discussion DB 없음 — init-discussion-db.sh 실행"
  bash "$BOT_HOME/scripts/init-discussion-db.sh"
fi

# ── 윈도우 계산 ───────────────────────────────────────────────────────────────
WINDOW_MIN="${DISCUSSION_WINDOW_MINUTES:-$(jq -r '.discussion_window_minutes // 30' "$PERSONAS_JSON" 2>/dev/null || echo 30)}"
OPENED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
# macOS date: +${N} minutes
CLOSES_AT=$(date -u -v+"${WINDOW_MIN}"M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null \
  || date -u -d "+${WINDOW_MIN} minutes" +"%Y-%m-%dT%H:%M:%SZ")

# ── DB 등록 (중복 무시) ───────────────────────────────────────────────────────
# 단일 인용부호 이스케이프: ' → ''
safe() { printf '%s' "$1" | sed "s/'/''/g"; }
SQL_STMT="INSERT OR IGNORE INTO discussions (id, post_title, post_type, post_author, opened_at, closes_at, status)
VALUES ('$(safe "$POST_ID")', '$(safe "$POST_TITLE")', '$(safe "$POST_TYPE")', '$(safe "$POST_AUTHOR")', '${OPENED_AT}', '${CLOSES_AT}', 'open');
SELECT changes();"

RESULT=$(sqlite3 "$DB" "$SQL_STMT")

if [[ "$RESULT" == "1" ]]; then
  log "토론 등록 완료 — post:${POST_ID} (${POST_TYPE}) 윈도우: ${OPENED_AT} ~ ${CLOSES_AT}"
else
  log "이미 등록된 post:${POST_ID} — 건너뜀"
fi
