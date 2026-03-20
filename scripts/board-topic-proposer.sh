#!/usr/bin/env bash
# board-topic-proposer.sh — 매시간 자비스 보드에 토론 주제 자동 제안
#
# Jarvis 크론: 0 * * * *
# 흐름:
#   1. 최근 컨텍스트 수집 (context-bus.md, 최근 insights, board-minutes, 채팅 기록 요약)
#   2. Claude에게 토론 주제 1개 제안 요청
#   3. jarvis-board API에 포스트 생성 (type=discussion, author=jarvis-proposer)
#   4. discussion-opener.sh로 30분 토론 윈도우 등록
#   5. Discord 알림
#
# 필요 env (~/.jarvis/.env):
#   BOARD_URL      — 보드 API 기본 URL
#   AGENT_API_KEY  — x-agent-key 헤더 인증키
#   ANTHROPIC_API_KEY — Claude API (ask-claude.sh 경유)

set -euo pipefail

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# --- .env 로드 ---
if [[ -f "${BOT_HOME}/.env" ]]; then
  # shellcheck disable=SC1090
  set -a; source "${BOT_HOME}/.env"; set +a
fi

: "${BOARD_URL:?BOARD_URL not set}"
: "${AGENT_API_KEY:?AGENT_API_KEY not set}"

LOG="${BOT_HOME}/logs/board-topic-proposer.log"
MCP_CONFIG="${BOT_HOME}/config/empty-mcp.json"
WORK_DIR="/tmp/board-topic-proposer-$$"
STATE_FILE="${BOT_HOME}/state/board-topic-proposer.json"

mkdir -p "$(dirname "$LOG")" "$WORK_DIR"
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >> "$LOG"; }
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

# 로그 5MB 초과 시 최근 1000줄만 유지
if [[ -f "$LOG" ]] && (( $(wc -c < "$LOG") > 5242880 )); then
  tail -n 1000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

# ── 1. 중복 실행 방지 (같은 시간대에 이미 포스팅했으면 스킵) ───────────────────
CURRENT_HOUR=$(date '+%Y-%m-%d %H')
LAST_HOUR=$(jq -r '.last_proposed_hour // ""' "$STATE_FILE" 2>/dev/null || echo "")
if [[ "$LAST_HOUR" == "$CURRENT_HOUR" ]]; then
  log "이미 이번 시간대에 제안 완료 — 스킵 ($CURRENT_HOUR)"
  exit 0
fi

# ── 2. 현재 보드 포스트 목록 조회 (중복 주제 방지) ─────────────────────────────
EXISTING_POSTS=$(curl -sf --max-time 15 \
  -H "x-agent-key: $AGENT_API_KEY" \
  "${BOARD_URL}/api/posts" 2>/dev/null || echo "[]")

EXISTING_TITLES=$(echo "$EXISTING_POSTS" | jq -r '[.[].title] | join("\n")' 2>/dev/null || echo "")

# ── 3. 컨텍스트 수집 ──────────────────────────────────────────────────────────
# context-bus.md (시스템 상태 + 팀 지시)
CONTEXT_BUS=""
if [[ -f "${BOT_HOME}/state/context-bus.md" ]]; then
  CONTEXT_BUS=$(head -c 2000 "${BOT_HOME}/state/context-bus.md")
fi

# 최근 board-minutes (어제, 오늘)
BOARD_MINUTES=""
for f in $(ls "${BOT_HOME}/state/board-minutes/"*.md 2>/dev/null | tail -2); do
  BOARD_MINUTES="${BOARD_MINUTES}\n$(head -c 800 "$f")"
done

# 최근 decisions.jsonl (최근 5개)
RECENT_DECISIONS=""
for f in $(ls "${BOT_HOME}/state/decisions/"*.jsonl 2>/dev/null | tail -2); do
  while IFS= read -r line; do
    RECENT_DECISIONS="${RECENT_DECISIONS}\n$(echo "$line" | jq -r '"\(.date // "") \(.title // .summary // "")"' 2>/dev/null || true)"
  done < <(tail -5 "$f" 2>/dev/null || true)
done

# 최근 morning-standup 결과
STANDUP=""
STANDUP_LOG=$(ls "${BOT_HOME}/logs/claude-stderr-morning-standup-"*.log 2>/dev/null | sort | tail -1 || true)
if [[ -n "$STANDUP_LOG" ]]; then
  STANDUP=$(tail -c 1500 "$STANDUP_LOG")
fi

# ── 4. Claude에게 주제 제안 요청 ────────────────────────────────────────────────
PROMPT="당신은 자비스 컴퍼니의 주제 제안 에이전트입니다.
아래 컨텍스트를 읽고, 자비스(AI 어시스턴트 시스템) 개선이나 대표(이정우)의 삶의 질 향상에 가장 유용한 토론 주제 1개를 한국어로 제안하세요.

## 규칙
- 기존 게시글과 중복되지 않는 새로운 주제
- 30분 내 에이전트들이 구체적 의견을 낼 수 있는 주제
- 실행 가능한 결론으로 이어질 수 있는 주제 (DEV_TASK, CONFIG, INSIGHT 중 하나)
- **가격/수치 데이터 절대 금지**: "$49.14", "+2.36%" 같은 실시간 가격은 주제에 포함하지 마십시오. 주제가 즉시 오래됩니다.
- **구조적 질문으로 작성**: 현재 수치가 아닌, 시제가 없는 프레임 질문으로 작성하십시오.
- 우선 순위: (1) Jarvis 기술적 개선점 (2) 자동화/워크플로우 개선 (3) 대표 삶의 질/커리어 향상 (4) 투자 전략은 구조적 프레임 질문에 한해 허용

## 현재 시스템 상태
${CONTEXT_BUS}

## 최근 회의록 요약
${BOARD_MINUTES}

## 최근 의사결정
${RECENT_DECISIONS}

## 오늘 아침 스탠드업
${STANDUP}

## 기존 게시글 (중복 금지)
${EXISTING_TITLES}

## 출력 형식 (JSON만, 다른 텍스트 없이)
{
  \"title\": \"[팀명] 제목 (50자 이내)\",
  \"content\": \"## 배경\\n2-3줄 배경 설명 (가격/수치 데이터 제외)\\n\\n## 토론 포인트\\n- 포인트 1\\n- 포인트 2\\n- 포인트 3\\n\\n## 기대 결론\\n어떤 결정이 나오면 좋을지 1줄\",
  \"tags\": [\"태그1\", \"태그2\"],
  \"priority\": \"medium\",
  \"expected_action\": \"DEV_TASK | CONFIG | INSIGHT | NO_ACTION\"
}"

# Claude 호출
CLAUDE_OUT="$WORK_DIR/claude-out.json"
if ! ANTHROPIC_API_KEY="" CLAUDECODE="" \
  claude -p "$PROMPT" \
    --output-format json \
    --permission-mode bypassPermissions \
    --strict-mcp-config \
    --mcp-config "$MCP_CONFIG" \
    --allowedTools "" \
    < /dev/null > "$CLAUDE_OUT" 2>>"$LOG"; then
  log "WARN Claude 호출 실패"
  exit 0
fi

RAW_RESULT=$(jq -r '.result // ""' "$CLAUDE_OUT" 2>/dev/null || echo "")
if [[ -z "$RAW_RESULT" ]]; then
  log "WARN Claude 결과 없음"
  exit 0
fi

# JSON 파싱 (결과에서 JSON 블록 추출)
PROPOSAL="$WORK_DIR/proposal.json"
if echo "$RAW_RESULT" | jq '.' > "$PROPOSAL" 2>/dev/null; then
  : # 이미 JSON
elif echo "$RAW_RESULT" | grep -q '```json'; then
  echo "$RAW_RESULT" | sed -n '/```json/,/```/p' | sed '1d;$d' | jq '.' > "$PROPOSAL" 2>/dev/null || true
else
  # JSON 블록 직접 추출
  echo "$RAW_RESULT" | grep -o '{.*}' | head -1 | jq '.' > "$PROPOSAL" 2>/dev/null || true
fi

if [[ ! -s "$PROPOSAL" ]]; then
  log "WARN JSON 파싱 실패: $(echo "$RAW_RESULT" | head -c 200)"
  exit 0
fi

TITLE=$(jq -r '.title // ""' "$PROPOSAL")
CONTENT=$(jq -r '.content // ""' "$PROPOSAL")
TAGS=$(jq -c '.tags // ["ai","jarvis","discussion"]' "$PROPOSAL")
PRIORITY=$(jq -r '.priority // "medium"' "$PROPOSAL")

if [[ -z "$TITLE" || -z "$CONTENT" ]]; then
  log "WARN 제목 또는 본문 비어 있음"
  exit 0
fi

log "INFO 주제 제안: $TITLE"

# ── 5. jarvis-board API에 포스트 생성 ────────────────────────────────────────
POST_PAYLOAD=$(jq -n \
  --arg title   "$TITLE" \
  --arg content "$CONTENT" \
  --argjson tags    "$TAGS" \
  --arg priority "$PRIORITY" \
  '{
    title:    $title,
    type:     "discussion",
    author:   "jarvis-proposer",
    author_display: "🤖 자비스 (주제제안)",
    content:  $content,
    tags:     $tags,
    priority: $priority,
    status:   "open"
  }')

POST_RESP="$WORK_DIR/post-resp.json"
HTTP_CODE=$(curl -sf --max-time 15 \
  -X POST "${BOARD_URL}/api/posts" \
  -H "Content-Type: application/json" \
  -H "x-agent-key: $AGENT_API_KEY" \
  -d "$POST_PAYLOAD" \
  -o "$POST_RESP" \
  -w "%{http_code}" 2>>"$LOG" || echo "000")

if [[ "$HTTP_CODE" != "200" && "$HTTP_CODE" != "201" ]]; then
  log "WARN 포스트 생성 실패 (HTTP $HTTP_CODE)"
  exit 0
fi

NEW_POST_ID=$(jq -r '.id // ""' "$POST_RESP" 2>/dev/null || echo "")
if [[ -z "$NEW_POST_ID" ]]; then
  log "WARN 포스트 ID 없음"
  exit 0
fi

log "INFO 포스트 생성 완료: $NEW_POST_ID"

# ── 6. discussion-opener.sh로 토론 윈도우 등록 ───────────────────────────────
OPENER="${BOT_HOME}/bin/discussion-opener.sh"
if [[ -x "$OPENER" ]]; then
  BOARD_URL="${BOARD_URL}" AGENT_API_KEY="${AGENT_API_KEY}" \
    bash "$OPENER" "$NEW_POST_ID" "discussion" "$TITLE" "jarvis-proposer" >> "$LOG" 2>&1 || true
  log "INFO 토론 윈도우 등록 완료"
fi

# ── 7. Discord 알림 ──────────────────────────────────────────────────────────
MONITORING="${BOT_HOME}/config/monitoring.json"
DISCORD_WEBHOOK=$(jq -r '.webhooks["discord-general"] // .webhooks["general"] // ""' "$MONITORING" 2>/dev/null || echo "")
if [[ -n "$DISCORD_WEBHOOK" ]]; then
  DISCORD_PAYLOAD=$(jq -n \
    --arg title   "💬 새 토론 주제가 열렸습니다" \
    --arg desc    "**${TITLE}**\n\n30분간 팀원들의 의견을 모읍니다.\n👉 ${BOARD_URL}/posts/${NEW_POST_ID}" \
    '{embeds:[{title:$title,description:$desc,color:3447003}]}')
  curl -sf --max-time 10 -X POST "$DISCORD_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "$DISCORD_PAYLOAD" > /dev/null 2>&1 || true
fi

# ── 8. 상태 저장 ─────────────────────────────────────────────────────────────
jq -n \
  --arg hour  "$CURRENT_HOUR" \
  --arg pid   "$NEW_POST_ID" \
  --arg title "$TITLE" \
  '{last_proposed_hour:$hour, last_post_id:$pid, last_title:$title}' \
  > "$STATE_FILE"

echo "💬 **새 토론 주제**: ${TITLE}"
