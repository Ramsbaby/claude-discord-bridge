#!/usr/bin/env bash
# board-conclude.sh — 30분 만료된 토론 자동 결론 처리
#
# Jarvis 크론 board-conclude 태스크에서 5분마다 호출.
# 출력: 결론 처리된 경우만 Discord 전송 (빈 출력 = 조용히 종료, Discord 스팸 없음)
#
# 필요 env (~/.jarvis/.env):
#   BOARD_URL      — 보드 API 기본 URL
#   AGENT_API_KEY  — x-agent-key 헤더 인증키

set -euo pipefail

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# --- .env 로드 ---
if [[ -f "${BOT_HOME}/.env" ]]; then
    # shellcheck disable=SC1090
    set -a; source "${BOT_HOME}/.env"; set +a
fi

: "${BOARD_URL:?BOARD_URL not set in .env}"
: "${AGENT_API_KEY:?AGENT_API_KEY not set in .env}"

MCP_CONFIG="${BOT_HOME}/config/empty-mcp.json"
LOG="${BOT_HOME}/logs/board-conclude.log"
WORK_DIR="/tmp/board-conclude-$$"

# --- 로그 헬퍼 ---
log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" >> "$LOG"; }

# --- 정리 ---
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

mkdir -p "$WORK_DIR" "$(dirname "$LOG")"


# ── 1. 만료된 토론 조회 ────────────────────────────────────────────
PENDING="$WORK_DIR/pending.json"
if ! curl -sf --max-time 15 \
    -H "x-agent-key: $AGENT_API_KEY" \
    "${BOARD_URL}/api/posts/pending-conclude" \
    -o "$PENDING" 2>>"$LOG"; then
    log "WARN board API 연결 실패 — 스킵"
    exit 0
fi

COUNT=$(jq 'length' "$PENDING")
if [[ "$COUNT" -eq 0 ]]; then
    exit 0  # 할 일 없으면 조용히 종료 (Discord 스팸 방지)
fi

log "INFO ${COUNT}개 만료 토론 처리 시작"


# ── 2. 각 토론 처리 ────────────────────────────────────────────────
CONCLUDED=0
FAILED=0
CONCLUDED_TITLES=()

for i in $(seq 0 $((COUNT - 1))); do
    # 포스트 데이터 추출
    POST="$WORK_DIR/post_${i}.json"
    jq ".[$i]" "$PENDING" > "$POST"

    POST_ID=$(jq -r '.id'      "$POST")
    POST_TITLE=$(jq -r '.title' "$POST")
    POST_TYPE=$(jq -r '.type'   "$POST")
    POST_CONTENT=$(jq -r '.content' "$POST" | head -c 600)
    COMMENT_COUNT=$(jq '.comments | length' "$POST")

    # 댓글 목록 포맷 (최대 30개, 각 300자 제한)
    COMMENTS_TEXT=$(jq -r \
        '[.comments[:30][] | "[\(.author_display)]: \(.content[:300])"] | join("\n")' \
        "$POST" 2>/dev/null) || COMMENTS_TEXT=""
    if [[ -z "$COMMENTS_TEXT" ]]; then COMMENTS_TEXT="(토론 기간 내 참여 의견 없음)"; fi

    # discussion-daemon이 관리하는 포스트면 스킵 (synthesizer가 담당)
    DISCUSSION_DB="${BOT_HOME}/data/board-discussion.db"
    if [[ -f "$DISCUSSION_DB" ]]; then
        DISC_STATUS=$(sqlite3 "$DISCUSSION_DB" \
            "SELECT status FROM discussions WHERE id='${POST_ID//\'/\'\'}'" 2>/dev/null || echo "")
        if [[ -n "$DISC_STATUS" ]]; then
            log "INFO discussion-daemon 관리 포스트 — board-conclude 스킵: ${POST_TITLE} (disc_status:${DISC_STATUS})"
            continue
        fi
    fi

    # 이미 is_resolution 댓글 있으면 스킵 (synthesizer가 먼저 처리한 경우)
    ALREADY_RESOLVED=$(jq '.comments[] | select(.is_resolution == 1) | .id' "$POST" 2>/dev/null | head -1)
    if [[ -n "$ALREADY_RESOLVED" ]]; then
        log "INFO 이미 결론 처리됨 스킵: ${POST_TITLE}"
        continue
    fi

    # ── Claude 프롬프트 구성 ────────────────────────────────────────
    PROMPT="당신은 자비스 컴퍼니의 회의 진행자입니다.
아래 토론이 30분 시간제한을 마쳤습니다. 모든 의견을 종합해 최종 결론을 한국어로 작성해주세요.

## 토론 정보
유형: ${POST_TYPE} | 제목: ${POST_TITLE}
배경: ${POST_CONTENT}

## 참여 의견 (${COMMENT_COUNT}개)
${COMMENTS_TEXT}

## 작성 규칙
- 의견이 없으면 주제만으로 최선의 방향을 제시
- 실행 가능한 구체적 다음 단계 포함
- 300자 이내로 간결하게
- 반드시 아래 형식 준수:

✅ 결론: [핵심 합의점 또는 결정사항]
📌 다음 단계: [구체적 실행 계획 1~3가지]"

    # ── Claude 호출 ────────────────────────────────────────────────
    OUTPUT="$WORK_DIR/out_${i}.json"
    if ! ANTHROPIC_API_KEY="" CLAUDECODE="" \
        claude -p "$PROMPT" \
            --output-format json \
            --permission-mode bypassPermissions \
            --strict-mcp-config \
            --mcp-config "$MCP_CONFIG" \
            --allowedTools "" \
            < /dev/null > "$OUTPUT" 2>>"$LOG"; then
        log "WARN Claude 호출 실패: ${POST_TITLE} (${POST_ID})"
        FAILED=$((FAILED + 1))
        continue
    fi

    CONCLUSION=$(jq -r '.result // ""' "$OUTPUT" | head -c 1000)
    if [[ -z "$CONCLUSION" ]]; then
        log "WARN 빈 결론 반환: ${POST_TITLE} (${POST_ID})"
        FAILED=$((FAILED + 1))
        continue
    fi

    # ── 결론 보드에 포스팅 ─────────────────────────────────────────
    PAYLOAD=$(jq -n \
        --arg author  "council-team" \
        --arg display "📋 자비스 회의록" \
        --arg content "$CONCLUSION" \
        '{author:$author, author_display:$display, content:$content, is_resolution:true}')

    if ! curl -sf --max-time 15 \
        -X POST "${BOARD_URL}/api/posts/${POST_ID}/comments" \
        -H "Content-Type: application/json" \
        -H "x-agent-key: $AGENT_API_KEY" \
        -d "$PAYLOAD" > /dev/null 2>>"$LOG"; then
        log "WARN 결론 포스팅 실패: ${POST_TITLE} (${POST_ID})"
        FAILED=$((FAILED + 1))
        continue
    fi

    CONCLUDED=$((CONCLUDED + 1))
    CONCLUDED_TITLES+=("• ${POST_TITLE}")
    log "INFO 결론 완료: ${POST_TITLE} (${POST_ID})"

    # 결론 → 실제 행동 파이프라인 트리거
    DISPATCHER="${BOT_HOME}/scripts/board-action-dispatcher.sh"
    if [[ -x "$DISPATCHER" ]]; then
        log "INFO 행동 디스패처 실행: ${POST_ID}"
        (
            BOT_HOME="$BOT_HOME" \
            BOARD_URL="${BOARD_URL}" \
            AGENT_API_KEY="${AGENT_API_KEY}" \
            bash "$DISPATCHER" "$POST_ID" >> "$LOG" 2>&1
        ) &
    fi
done


# ── 3. Discord 출력 (결론 처리됐을 때만) ────────────────────────────
if [[ $CONCLUDED -eq 0 ]]; then
    if [[ $FAILED -gt 0 ]]; then
        log "WARN 전체 처리 실패: ${FAILED}건"
    fi
    exit 0  # 빈 출력 → jarvis-cron이 Discord 전송 스킵
fi

echo "📋 **자비스 보드 — 토론 결론 ${CONCLUDED}건**"
for title in "${CONCLUDED_TITLES[@]}"; do
    echo "$title"
done
if [[ $FAILED -gt 0 ]]; then echo "⚠️ 처리 실패: ${FAILED}건"; fi
