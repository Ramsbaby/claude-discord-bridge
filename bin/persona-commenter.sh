#!/usr/bin/env bash
# persona-commenter.sh — 특정 페르소나가 특정 게시글에 댓글 작성
#
# Usage: persona-commenter.sh <persona_id> <post_id>
# Env:   BOT_HOME, BOARD_URL, AGENT_API_KEY, ANTHROPIC_API_KEY
#
# 1. board-personas.json 에서 페르소나 정보 로드
# 2. Board API 에서 게시글+댓글 조회
# 3. 라우팅 조건 검사 (post_type, keywords)
# 4. claude -p 로 댓글 생성
# 5. Board API 로 댓글 POST
# 6. discussion_comments 에 결과 기록

set -euo pipefail

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
PERSONAS_JSON="$BOT_HOME/config/board-personas.json"
DB="$BOT_HOME/data/board-discussion.db"
LOG="$BOT_HOME/logs/discussion.log"
BOARD_URL="${BOARD_URL:-https://jarvis-board-production.up.railway.app}"
RESP_TMP="$BOT_HOME/tmp/persona-commenter-resp-$$.json"

mkdir -p "$(dirname "$LOG")" "$BOT_HOME/tmp"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [persona-commenter] $*" | tee -a "$LOG"; }

trap 'rm -f "$RESP_TMP"' EXIT

# ── 인수 ──────────────────────────────────────────────────────────────────────
PERSONA_ID="${1:-}"
POST_ID="${2:-}"

if [[ -z "$PERSONA_ID" || -z "$POST_ID" ]]; then
  log "Usage: $0 <persona_id> <post_id>"
  exit 1
fi

# ── AGENT_API_KEY 로드 ────────────────────────────────────────────────────────
if [[ -z "${AGENT_API_KEY:-}" ]]; then
  if [[ -f "$BOT_HOME/.env" ]]; then
    # shellcheck disable=SC1090
    set +u; source "$BOT_HOME/.env"; set -u
  fi
fi
if [[ -z "${AGENT_API_KEY:-}" ]]; then
  log "AGENT_API_KEY 없음 — 건너뜀"
  exit 0
fi

# ── 페르소나 로드 ─────────────────────────────────────────────────────────────
PERSONA=$(jq -r --arg id "$PERSONA_ID" '.personas[] | select(.id == $id)' "$PERSONAS_JSON")
if [[ -z "$PERSONA" ]]; then
  log "페르소나 없음: $PERSONA_ID"
  exit 1
fi
PERSONA_NAME=$(echo "$PERSONA" | jq -r '.name')
PERSONA_TITLE=$(echo "$PERSONA" | jq -r '.title')
PERSONA_SYSTEM=$(echo "$PERSONA" | jq -r '.system_prompt')
PERSONA_POST_TYPES=$(echo "$PERSONA" | jq -r '[.post_types[]? ] | join(",")' 2>/dev/null || echo "")
PERSONA_KEYWORDS=$(echo "$PERSONA" | jq -r '[.route_keywords[]?] | join(",")' 2>/dev/null || echo "")
AVOID_TYPES=$(echo "$PERSONA" | jq -r '[.avoid_post_types[]?] | join(",")' 2>/dev/null || echo "")

# ── 중복 체크 (DB) ────────────────────────────────────────────────────────────
EXISTING=$(sqlite3 "$DB" \
  "SELECT count(*) FROM discussion_comments WHERE discussion_id='${POST_ID//\'/\'\'}' AND persona_id='${PERSONA_ID//\'/\'\'}';")
if [[ "$EXISTING" != "0" ]]; then
  log "${PERSONA_NAME} 이미 댓글 달음 — post:${POST_ID}"
  exit 0
fi

# ── 게시글 조회 ───────────────────────────────────────────────────────────────
HTTP_CODE=$(curl -s -o "$RESP_TMP" -w "%{http_code}" \
  -H "x-agent-key: ${AGENT_API_KEY}" \
  "${BOARD_URL}/api/posts/${POST_ID}" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
  log "게시글 조회 실패 (HTTP ${HTTP_CODE}) — post:${POST_ID}"
  exit 0
fi

POST_TITLE=$(jq -r '.title // "제목 없음"' "$RESP_TMP")
POST_TYPE=$(jq -r '.type // "discussion"' "$RESP_TMP")
POST_CONTENT=$(jq -r '.content // ""' "$RESP_TMP" | head -c 2000)
POST_AUTHOR_DISPLAY=$(jq -r '.author_display // .author // "알 수 없음"' "$RESP_TMP")
EXISTING_COMMENTS=$(jq -r '[.comments[]? | "[\(.author_display // .author)]: \(.content)"] | join("\n")' "$RESP_TMP" 2>/dev/null || echo "")

# ── 라우팅 조건 검사 ─────────────────────────────────────────────────────────
# avoid_post_types 체크
if [[ -n "$AVOID_TYPES" ]]; then
  IFS=',' read -ra AVOID_ARR <<< "$AVOID_TYPES"
  for atype in "${AVOID_ARR[@]}"; do
    if [[ "$POST_TYPE" == "$atype" ]]; then
      log "${PERSONA_NAME} — 회피 타입(${POST_TYPE}), 건너뜀"
      exit 0
    fi
  done
fi

# post_types 필터 (설정된 경우)
SHOULD_COMMENT=false
if [[ -z "$PERSONA_POST_TYPES" ]]; then
  SHOULD_COMMENT=true
else
  IFS=',' read -ra TYPE_ARR <<< "$PERSONA_POST_TYPES"
  for ptype in "${TYPE_ARR[@]}"; do
    if [[ "$POST_TYPE" == "$ptype" ]]; then
      SHOULD_COMMENT=true
      break
    fi
  done
fi

# keyword 라우팅 (post_types 통과 못하면 keyword로도 가능)
if [[ "$SHOULD_COMMENT" == "false" && -n "$PERSONA_KEYWORDS" ]]; then
  FULL_TEXT="${POST_TITLE} ${POST_CONTENT}"
  IFS=',' read -ra KW_ARR <<< "$PERSONA_KEYWORDS"
  for kw in "${KW_ARR[@]}"; do
    if echo "$FULL_TEXT" | grep -qi "$kw" 2>/dev/null; then
      SHOULD_COMMENT=true
      break
    fi
  done
fi

if [[ "$SHOULD_COMMENT" == "false" ]]; then
  log "${PERSONA_NAME} — 관련 없는 게시글, 건너뜀 (type:${POST_TYPE})"
  exit 0
fi

# ── Claude 댓글 생성 ──────────────────────────────────────────────────────────
USER_PROMPT="## 게시글 정보

**제목**: ${POST_TITLE}
**유형**: ${POST_TYPE}
**작성자**: ${POST_AUTHOR_DISPLAY}

**내용**:
${POST_CONTENT}
$(if [[ -n "$EXISTING_COMMENTS" ]]; then echo "
## 현재까지의 댓글
${EXISTING_COMMENTS}
"; fi)

---
위 게시글에 대한 당신의 의견을 작성해주세요.
- 당신의 전문 영역에서 핵심 포인트를 짚어주세요.
- 다른 팀원의 댓글이 있다면 그에 대한 보완 의견도 환영합니다.
- 실제로 자비스 컴퍼니 팀 회의에서 말하듯 자연스럽고 구체적으로 작성하세요.
- 반드시 최소 100자 이상 작성하세요."

log "${PERSONA_NAME} 댓글 생성 중 — post:${POST_ID} (${POST_TYPE})"

COMMENT_CONTENT=$(echo "$USER_PROMPT" | \
  claude -p "$PERSONA_SYSTEM" --output-format text 2>/dev/null || echo "")

if [[ -z "$COMMENT_CONTENT" || ${#COMMENT_CONTENT} -lt 20 ]]; then
  log "${PERSONA_NAME} 댓글 생성 실패 또는 너무 짧음"
  sqlite3 "$DB" \
    "INSERT OR IGNORE INTO discussion_comments (discussion_id, persona_id, persona_name, content, status, error_msg)
     VALUES ('${POST_ID//\'/\'\'}', '${PERSONA_ID//\'/\'\'}', '${PERSONA_NAME//\'/\'\'}', '', 'failed', 'empty_response');"
  exit 0
fi

# ── Board API에 댓글 POST ─────────────────────────────────────────────────────
COMMENT_BODY=$(jq -n \
  --arg content "$COMMENT_CONTENT" \
  --arg author "$PERSONA_ID" \
  --arg author_display "${PERSONA_NAME}(${PERSONA_TITLE})" \
  '{"content": $content, "author": $author, "author_display": $author_display}')

HTTP_CODE=$(curl -s -o "$RESP_TMP" -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "x-agent-key: ${AGENT_API_KEY}" \
  -d "$COMMENT_BODY" \
  "${BOARD_URL}/api/posts/${POST_ID}/comments" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" ]]; then
  BOARD_COMMENT_ID=$(jq -r '.id // ""' "$RESP_TMP")
  POSTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  sqlite3 "$DB" \
    "INSERT OR IGNORE INTO discussion_comments (discussion_id, persona_id, persona_name, board_comment_id, content, status, posted_at)
     VALUES ('${POST_ID//\'/\'\'}', '${PERSONA_ID//\'/\'\'}', '${PERSONA_NAME//\'/\'\'}', '${BOARD_COMMENT_ID//\'/\'\'}', '${COMMENT_CONTENT//\'/\'\'}', 'posted', '${POSTED_AT}');"
  log "${PERSONA_NAME} 댓글 게시 완료 — board_comment:${BOARD_COMMENT_ID}"
else
  ERR=$(cat "$RESP_TMP" 2>/dev/null | head -c 200)
  sqlite3 "$DB" \
    "INSERT OR IGNORE INTO discussion_comments (discussion_id, persona_id, persona_name, content, status, error_msg)
     VALUES ('${POST_ID//\'/\'\'}', '${PERSONA_ID//\'/\'\'}', '${PERSONA_NAME//\'/\'\'}', '${COMMENT_CONTENT//\'/\'\'}', 'failed', 'http_${HTTP_CODE}');"
  log "${PERSONA_NAME} 댓글 게시 실패 (HTTP ${HTTP_CODE}): ${ERR}"
fi
