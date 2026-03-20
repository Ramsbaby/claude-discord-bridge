#!/usr/bin/env bash
# board-action-dispatcher.sh — 토론 결론 → 실제 Jarvis 행동 파이프라인
#
# Usage: board-action-dispatcher.sh <post_id>
# discussion-synthesizer.sh가 결론 게시 후 호출, 또는 board-conclude.sh 완료 후 호출.
#
# 흐름:
#   1. 결론 텍스트 + 포스트 메타데이터 조회
#   2. Claude가 결론을 분석해 실행 유형 분류:
#      - DEV_TASK   : 새 기능/수정 개발 태스크 → dev-queue.json 추가
#      - CONFIG     : 설정 변경 제안 → config-bus.md에 기록
#      - CRON       : 새 크론/자동화 → context-bus.md에 기록 + Discord 알림
#      - INSIGHT    : 중요 인사이트 → context-bus.md + Vault 기록
#      - NO_ACTION  : 기록만 (결론은 유용하나 즉시 행동 불필요)
#   3. 분류된 행동 실행
#   4. Discord 알림 (행동 발생 시에만)
#
# 필요 env: BOARD_URL, AGENT_API_KEY, BOT_HOME

set -euo pipefail

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

if [[ -f "${BOT_HOME}/.env" ]]; then
  # shellcheck disable=SC1090
  set -a; source "${BOT_HOME}/.env"; set +a
fi

: "${BOARD_URL:?BOARD_URL not set}"
: "${AGENT_API_KEY:?AGENT_API_KEY not set}"

POST_ID="${1:-}"
if [[ -z "$POST_ID" ]]; then
  echo "Usage: $0 <post_id>" >&2
  exit 1
fi

LOG="${BOT_HOME}/logs/board-action-dispatcher.log"
MCP_CONFIG="${BOT_HOME}/config/empty-mcp.json"
WORK_DIR="/tmp/board-dispatcher-$$"
DEV_QUEUE="${BOT_HOME}/state/dev-queue.json"
CONFIG_BUS="${BOT_HOME}/state/config-bus.md"

mkdir -p "$(dirname "$LOG")" "$WORK_DIR"
log() { printf '[%s] [dispatcher] %s\n' "$(date '+%H:%M:%S')" "$*" >> "$LOG"; }
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

# 로그 5MB 초과 시 최근 1000줄만 유지
if [[ -f "$LOG" ]] && (( $(wc -c < "$LOG") > 5242880 )); then
  tail -n 1000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

log "INFO 시작 — post:${POST_ID}"

# ── 1. 포스트 + 결론 댓글 조회 ──────────────────────────────────────────────
POST_DATA="$WORK_DIR/post.json"
if ! curl -sf --max-time 15 \
  -H "x-agent-key: $AGENT_API_KEY" \
  "${BOARD_URL}/api/posts/${POST_ID}" \
  -o "$POST_DATA" 2>>"$LOG"; then
  log "WARN 포스트 조회 실패"
  exit 0
fi

POST_TITLE=$(jq -r '.title // ""' "$POST_DATA")
POST_TYPE=$(jq -r '.type // "discussion"' "$POST_DATA")
POST_CONTENT=$(jq -r '.content // ""' "$POST_DATA" | head -c 500)

# is_resolution 댓글 추출
RESOLUTION=$(jq -r '[.comments // [] | .[] | select(.is_resolution == 1 or .is_resolution == true) | .content] | last // ""' "$POST_DATA" 2>/dev/null || echo "")

if [[ -z "$RESOLUTION" || ${#RESOLUTION} -lt 20 ]]; then
  log "INFO 결론 없음 또는 너무 짧음 — 스킵"
  exit 0
fi

log "INFO 결론 확인 (${#RESOLUTION}자): $(echo "$RESOLUTION" | head -c 100)..."

# ── 2. 실행 항목 파싱 (구조화 섹션 우선, 폴백: Claude 분류) ─────────────────
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
NOW_DATE=$(date '+%Y-%m-%d')

# synthesizer가 "## ⚡ 실행 항목" 섹션을 출력했는지 확인
STRUCTURED_ACTIONS=$(echo "$RESOLUTION" | \
  awk '/^## ⚡ 실행 항목/{found=1; next} /^---/{found=0} found && /^- /' \
  2>/dev/null || true)

if [[ -z "$STRUCTURED_ACTIONS" ]]; then
  # 폴백: 기존 Claude 단일 분류
  log "INFO 구조화 섹션 없음 — Claude 폴백 분류 사용"
  CLASSIFY_PROMPT="자비스 AI 시스템의 행동 분류 에이전트입니다.
아래 토론 결론을 읽고, 즉시 실행해야 할 행동 유형을 JSON으로 분류하세요.

## 포스트 정보
제목: ${POST_TITLE}
유형: ${POST_TYPE}
배경: ${POST_CONTENT}

## 토론 결론
${RESOLUTION}

## 분류 기준
- DEV_TASK: 코드/스크립트 개발이 필요한 구체적 기능
- CONFIG: 설정값 변경만으로 해결 가능
- CRON: 새 크론 태스크나 스케줄 변경 필요
- INSIGHT: 중요 인사이트/방향성 (코드 변경 불필요)
- NO_ACTION: 기록만

## 출력 형식 (JSON만)
{
  \"action_type\": \"DEV_TASK | CONFIG | CRON | INSIGHT | NO_ACTION\",
  \"summary\": \"30자 이내 행동 요약\",
  \"detail\": \"구체적 실행 방법 (최대 200자)\",
  \"priority\": \"urgent | high | medium | low\",
  \"assignee\": \"담당 팀 또는 에이전트\"
}"

  CLASSIFY_OUT="$WORK_DIR/classify.json"
  if ! ANTHROPIC_API_KEY="" CLAUDECODE="" \
    claude -p "$CLASSIFY_PROMPT" \
      --output-format json \
      --permission-mode bypassPermissions \
      --strict-mcp-config \
      --mcp-config "$MCP_CONFIG" \
      --allowedTools "" \
      < /dev/null > "$CLASSIFY_OUT" 2>>"$LOG"; then
    log "WARN Claude 분류 실패"
    exit 0
  fi

  RAW_CLASSIFY=$(jq -r '.result // ""' "$CLASSIFY_OUT" 2>/dev/null || echo "")
  ACTION_JSON="$WORK_DIR/action.json"
  if echo "$RAW_CLASSIFY" | jq '.' > "$ACTION_JSON" 2>/dev/null; then
    :
  elif echo "$RAW_CLASSIFY" | grep -q '```json'; then
    echo "$RAW_CLASSIFY" | sed -n '/```json/,/```/p' | sed '1d;$d' > "$ACTION_JSON" 2>/dev/null || true
  else
    echo "$RAW_CLASSIFY" | grep -o '{[^}]*}' | head -1 > "$ACTION_JSON" 2>/dev/null || true
  fi

  if [[ ! -s "$ACTION_JSON" ]]; then
    log "WARN 분류 JSON 파싱 실패"
    exit 0
  fi

  FALLBACK_TYPE=$(jq -r '.action_type // "NO_ACTION"' "$ACTION_JSON")
  FALLBACK_SUMMARY=$(jq -r '.summary // ""' "$ACTION_JSON")
  FALLBACK_DETAIL=$(jq -r '.detail // ""' "$ACTION_JSON")
  FALLBACK_PRIORITY=$(jq -r '.priority // "medium"' "$ACTION_JSON")
  FALLBACK_ASSIGNEE=$(jq -r '.assignee // "council"' "$ACTION_JSON")
  STRUCTURED_ACTIONS="- ${FALLBACK_TYPE}: [${FALLBACK_ASSIGNEE}] ${FALLBACK_SUMMARY} — ${FALLBACK_DETAIL}"
fi

log "INFO 실행 항목 파싱: $(echo "$STRUCTURED_ACTIONS" | wc -l | tr -d ' ')개"

# ── 3. 행동 실행 (항목별 루프) ───────────────────────────────────────────────
ACTIONS_EXECUTED=0

while IFS= read -r action_line; do
  if [[ -z "$action_line" ]]; then continue; fi

  # "- TYPE: [팀명] 설명" 파싱
  ACTION_TYPE=$(echo "$action_line" | sed 's/^[[:space:]]*-[[:space:]]*//' | cut -d: -f1)
  FULL_DESC=$(echo "$action_line" | sed "s/^[[:space:]]*-[[:space:]]*${ACTION_TYPE}:[[:space:]]*//" | sed 's/ — .*//')
  ASSIGNEE=$(echo "$FULL_DESC" | grep -o '\[[^]]*\]' | head -1 | tr -d '[]' || echo "council")
  SUMMARY=$(echo "$FULL_DESC" | sed 's/\[[^]]*\][[:space:]]*//' | cut -c1-60)
  DETAIL=$(echo "$action_line" | sed 's/.*— //')
  if [[ "$DETAIL" == "$action_line" ]]; then DETAIL="$FULL_DESC"; fi
  PRIORITY="medium"

  log "INFO 실행: $ACTION_TYPE | $SUMMARY"

  case "$ACTION_TYPE" in

    DEV_TASK)
      NEW_TASK=$(jq -n \
        --arg id       "dispatch-$(date +%s)-${ACTIONS_EXECUTED}" \
        --arg title    "$SUMMARY" \
        --arg detail   "$DETAIL" \
        --arg priority "$PRIORITY" \
        --arg source   "board:${POST_ID}" \
        --arg created  "$NOW_ISO" \
        --arg assignee "$ASSIGNEE" \
        '{id:$id, title:$title, detail:$detail, priority:$priority,
          source:$source, created:$created, assignee:$assignee, status:"pending"}')

      if [[ ! -f "$DEV_QUEUE" ]]; then
        echo '{"version":"1.0","tasks":[]}' > "$DEV_QUEUE"
      fi
      # dev-queue.json은 {tasks:[...]} 구조 또는 레거시 [...] 배열 형식 모두 지원
      if jq -e 'type == "array"' "$DEV_QUEUE" > /dev/null 2>&1; then
        UPDATED=$(jq --argjson task "$NEW_TASK" '. + [$task]' "$DEV_QUEUE")
      else
        UPDATED=$(jq --argjson task "$NEW_TASK" '.tasks += [$task]' "$DEV_QUEUE")
      fi
      echo "$UPDATED" > "$DEV_QUEUE"
      log "INFO DEV_TASK 등록: $SUMMARY"

      printf '\n## 🔧 개발 태스크 요청 (%s)\n**[%s] %s**\n%s\n담당: %s\n' \
        "$NOW_DATE" "$PRIORITY" "$SUMMARY" "$DETAIL" "$ASSIGNEE" \
        >> "${BOT_HOME}/state/context-bus.md"
      ;;

    CONFIG)
      if [[ ! -f "$CONFIG_BUS" ]]; then
        printf '# Config Bus — 설정 변경 제안\n\n' > "$CONFIG_BUS"
      fi
      printf '\n## [%s] %s\n- **출처**: board:%s\n- **내용**: %s\n- **우선순위**: %s\n' \
        "$NOW_DATE" "$SUMMARY" "$POST_ID" "$DETAIL" "$PRIORITY" \
        >> "$CONFIG_BUS"
      log "INFO CONFIG 제안 기록: $SUMMARY"
      ;;

    CRON)
      printf '\n## ⏰ 크론/스케줄 변경 요청 (%s)\n**%s**\n%s\n' \
        "$NOW_DATE" "$SUMMARY" "$DETAIL" \
        >> "${BOT_HOME}/state/context-bus.md"
      log "INFO CRON 변경 요청 기록: $SUMMARY"
      ;;

    INSIGHT)
      INSIGHT_DIR="${HOME}/Jarvis-Vault/03-teams/board-insights"
      mkdir -p "$INSIGHT_DIR"
      INSIGHT_FILE="${INSIGHT_DIR}/${NOW_DATE}-${POST_ID}.md"
      # 여러 INSIGHT면 같은 파일에 추가
      if [[ ! -f "$INSIGHT_FILE" ]]; then
        printf '# 토론 인사이트 — %s\n\n_출처: board:%s | %s_\n\n' \
          "$POST_TITLE" "$POST_ID" "$NOW_ISO" > "$INSIGHT_FILE"
      fi
      printf '## %s\n%s\n\n' "$SUMMARY" "$DETAIL" >> "$INSIGHT_FILE"
      log "INFO INSIGHT 저장: $INSIGHT_FILE"
      ;;

    NO_ACTION)
      log "INFO NO_ACTION — 기록만 완료"
      ;;

    *)
      log "WARN 알 수 없는 행동 유형: $ACTION_TYPE"
      ;;
  esac

  # decisions.jsonl 감사 로그
  DECISIONS_DIR="${BOT_HOME}/state/decisions"
  mkdir -p "$DECISIONS_DIR"
  jq -n \
    --arg date     "$NOW_ISO" \
    --arg post_id  "$POST_ID" \
    --arg title    "$POST_TITLE" \
    --arg action   "$ACTION_TYPE" \
    --arg summary  "$SUMMARY" \
    --arg detail   "$DETAIL" \
    --arg priority "$PRIORITY" \
    '{date:$date, post_id:$post_id, title:$title, action:$action,
      summary:$summary, detail:$detail, priority:$priority}' \
    >> "${DECISIONS_DIR}/${NOW_DATE}.jsonl"

  (( ACTIONS_EXECUTED++ )) || true

done <<< "$STRUCTURED_ACTIONS"

# ── 4. Discord 알림 (행동이 있을 때만) ──────────────────────────────────────
if (( ACTIONS_EXECUTED > 0 )); then
  MONITORING="${BOT_HOME}/config/monitoring.json"
  DISCORD_WEBHOOK=$(jq -r '.webhooks["discord-general"] // .webhooks["general"] // ""' "$MONITORING" 2>/dev/null || echo "")
  if [[ -n "$DISCORD_WEBHOOK" ]]; then
    DISCORD_PAYLOAD=$(jq -n \
      --arg title "📋 토론 결론 → 행동 실행" \
      --arg desc  "${ACTIONS_EXECUTED}개 행동 실행됨\n\n_출처: ${POST_TITLE}_" \
      '{embeds:[{title:$title,description:$desc,color:5763719}]}')
    curl -sf --max-time 10 -X POST "$DISCORD_WEBHOOK" \
      -H "Content-Type: application/json" \
      -d "$DISCORD_PAYLOAD" > /dev/null 2>&1 || true
  fi

  echo "${ACTIONS_EXECUTED}개 실행 완료"
fi

log "INFO 완료 — executed:${ACTIONS_EXECUTED}"
