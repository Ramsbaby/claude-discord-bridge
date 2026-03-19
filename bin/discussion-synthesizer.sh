#!/usr/bin/env bash
# discussion-synthesizer.sh — 토론 윈도우 종료 후 이사회 최종 의견 합성
#
# discussion-daemon.sh가 호출. 조건: 모든 페르소나 댓글 완료 OR 윈도우 만료.
# 1. discussion_comments 에서 이 토론의 모든 댓글 수집
# 2. claude -p 로 종합 결의안 생성
# 3. Board API에 board-synthesizer 명의로 댓글 POST
# 4. discussions.status = 'resolved', resolution 저장

set -euo pipefail

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
PERSONAS_JSON="$BOT_HOME/config/board-personas.json"
DB="$BOT_HOME/data/board-discussion.db"
LOG="$BOT_HOME/logs/discussion.log"
BOARD_URL="${BOARD_URL:-https://jarvis-board-production.up.railway.app}"
RESP_TMP="$BOT_HOME/tmp/synthesizer-resp-$$.json"

mkdir -p "$(dirname "$LOG")" "$BOT_HOME/tmp"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [synthesizer] $*" | tee -a "$LOG"; }

trap 'rm -f "$RESP_TMP"' EXIT

POST_ID="${1:-}"
if [[ -z "$POST_ID" ]]; then
  log "Usage: $0 <post_id>"
  exit 1
fi

# ── AGENT_API_KEY 로드 ────────────────────────────────────────────────────────
if [[ -z "${AGENT_API_KEY:-}" ]] && [[ -f "$BOT_HOME/.env" ]]; then
  # shellcheck disable=SC1090
  set +u; source "$BOT_HOME/.env"; set -u
fi
if [[ -z "${AGENT_API_KEY:-}" ]]; then
  log "AGENT_API_KEY 없음 — 건너뜀"
  exit 0
fi

# ── 합성자 설정 ───────────────────────────────────────────────────────────────
SYNTH_ENABLED=$(jq -r '.synthesizer.enabled // false' "$PERSONAS_JSON")
if [[ "$SYNTH_ENABLED" != "true" ]]; then
  log "synthesizer 비활성화 — 건너뜀"
  exit 0
fi

SYNTH_SYSTEM=$(jq -r '.synthesizer.system_prompt' "$PERSONAS_JSON")
SYNTH_ID=$(jq -r '.synthesizer.id' "$PERSONAS_JSON")
SYNTH_NAME=$(jq -r '.synthesizer.name' "$PERSONAS_JSON")
SYNTH_TITLE=$(jq -r '.synthesizer.title // ""' "$PERSONAS_JSON")

# ── 이미 합성됐는지 확인 ──────────────────────────────────────────────────────
ALREADY=$(sqlite3 "$DB" \
  "SELECT count(*) FROM discussion_comments
   WHERE discussion_id='${POST_ID}' AND persona_id='${SYNTH_ID}';" 2>/dev/null || echo 0)
if [[ "$ALREADY" != "0" ]]; then
  log "이미 합성 완료 — post:${POST_ID}"
  exit 0
fi

# ── 게시글 + 페르소나 댓글 조회 ──────────────────────────────────────────────
HTTP_CODE=$(curl -s -o "$RESP_TMP" -w "%{http_code}" \
  -H "x-agent-key: ${AGENT_API_KEY}" \
  "${BOARD_URL}/api/posts/${POST_ID}" 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" != "200" ]]; then
  log "게시글 조회 실패 (HTTP ${HTTP_CODE}) — post:${POST_ID}"
  exit 0
fi

POST_TITLE=$(jq -r '.title // "제목 없음"' "$RESP_TMP")
POST_TYPE=$(jq -r '.type // "discussion"' "$RESP_TMP")
POST_CONTENT=$(jq -r '.content // ""' "$RESP_TMP" | head -c 1500)

# DB에서 실제 게시된 댓글 내용 가져오기
COMMENTS_TEXT=$(sqlite3 "$DB" \
  "SELECT persona_name || ': ' || content
   FROM discussion_comments
   WHERE discussion_id='${POST_ID}' AND status='posted'
   ORDER BY created_at;" 2>/dev/null || echo "")

if [[ -z "$COMMENTS_TEXT" ]]; then
  log "댓글 없음 — 합성 건너뜀 (post:${POST_ID})"
  exit 0
fi

COMMENT_COUNT=$(echo "$COMMENTS_TEXT" | grep -c '^' || echo 0)
log "${COMMENT_COUNT}개 댓글 합성 시작 — post:${POST_ID}"

# ── Claude 합성 ───────────────────────────────────────────────────────────────
USER_PROMPT="## 토론 게시글

**제목**: ${POST_TITLE}
**유형**: ${POST_TYPE}

**내용**:
${POST_CONTENT}

## 팀장 의견 목록

${COMMENTS_TEXT}

---
위 토론의 모든 팀장 의견을 종합하여 이사회 최종 결의안을 작성해주세요.
지정된 마크다운 형식을 정확히 따르세요."

RESOLUTION=$(echo "$USER_PROMPT" | \
  claude -p "$SYNTH_SYSTEM" --output-format text 2>/dev/null || echo "")

if [[ -z "$RESOLUTION" || ${#RESOLUTION} -lt 30 ]]; then
  log "합성 실패 — 응답 너무 짧음"
  exit 0
fi

# ── Board API에 합성 댓글 POST ────────────────────────────────────────────────
AUTHOR_DISPLAY="${SYNTH_NAME}"
if [[ -n "$SYNTH_TITLE" ]]; then
  AUTHOR_DISPLAY="${SYNTH_NAME}(${SYNTH_TITLE})"
fi

COMMENT_BODY=$(jq -n \
  --arg content "$RESOLUTION" \
  --arg author "$SYNTH_ID" \
  --arg author_display "$AUTHOR_DISPLAY" \
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

  # DB에 합성 결과 기록
  safe() { printf '%s' "$1" | sed "s/'/''/g"; }
  sqlite3 "$DB" \
    "INSERT OR IGNORE INTO discussion_comments (discussion_id, persona_id, persona_name, board_comment_id, content, status, posted_at)
     VALUES ('$(safe "$POST_ID")', '$(safe "$SYNTH_ID")', '$(safe "$SYNTH_NAME")', '$(safe "$BOARD_COMMENT_ID")', '$(safe "$RESOLUTION")', 'posted', '${POSTED_AT}');
     UPDATE discussions SET status='resolved', resolution='$(safe "$RESOLUTION")' WHERE id='$(safe "$POST_ID")';"

  log "이사회 결의 게시 완료 — board_comment:${BOARD_COMMENT_ID} post:${POST_ID}"
else
  log "이사회 댓글 실패 (HTTP ${HTTP_CODE})"
fi
