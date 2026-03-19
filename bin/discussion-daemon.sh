#!/usr/bin/env bash
# discussion-daemon.sh — 진행 중인 토론 윈도우 스캔 + 페르소나 댓글 디스패치
#
# 매 1분 cron: * * * * * BOT_HOME=/... bash discussion-daemon.sh
#
# 흐름:
#   1. board-discussion.db 에서 status='open' 인 토론 조회
#   2. 만료된 토론 → status='expired' 갱신
#   3. 진행 중인 토론마다 board-personas.json 순회
#      - delay 미경과 → skip
#      - 이미 댓글 → skip
#      - 조건 충족 → persona-commenter.sh 백그라운드 실행 (세마포어 최대 2)
#
# 동시 실행 방지: tmp/discussion-daemon.lock

set -euo pipefail

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
PERSONAS_JSON="$BOT_HOME/config/board-personas.json"
DB="$BOT_HOME/data/board-discussion.db"
LOG="$BOT_HOME/logs/discussion.log"
LOCK_DIR="$BOT_HOME/tmp/discussion-daemon.lock"
MAX_CONCURRENT=2

mkdir -p "$(dirname "$LOG")" "$BOT_HOME/tmp"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [discussion-daemon] $*" | tee -a "$LOG"; }

# 로그 5MB 초과 시 최근 1000줄만 유지
if [[ -f "$LOG" ]] && (( $(wc -c < "$LOG") > 5242880 )); then
  tail -n 1000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

# ── 중복 실행 방지 ────────────────────────────────────────────────────────────
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  LOCK_PID=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
  if [[ -n "$LOCK_PID" ]] && kill -0 "$LOCK_PID" 2>/dev/null; then
    log "이미 실행 중 (PID $LOCK_PID). 건너뜀."
    exit 0
  fi
  rm -rf "$LOCK_DIR" && mkdir "$LOCK_DIR"
fi
echo $$ > "$LOCK_DIR/pid"
trap 'rm -rf "$LOCK_DIR"' EXIT

# ── DB 존재 확인 ──────────────────────────────────────────────────────────────
if [[ ! -f "$DB" ]]; then
  log "discussion DB 없음 — 건너뜀 (init-discussion-db.sh 먼저 실행 필요)"
  exit 0
fi

# ── 현재 시각 (ISO8601 UTC) ───────────────────────────────────────────────────
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── 만료된 토론 닫기 + 합성자 트리거 ────────────────────────────────────────
# 만료 전에 해당 post_id 목록 추출 (합성자 실행용)
EXPIRED_IDS=()
while IFS= read -r eid; do
  if [[ -n "$eid" ]]; then EXPIRED_IDS+=("$eid"); fi
done < <(sqlite3 "$DB" \
  "SELECT id FROM discussions
   WHERE status='open' AND closes_at <= '${NOW}';" 2>/dev/null || true)

EXPIRED=$(sqlite3 "$DB" \
  "UPDATE discussions SET status='expired'
   WHERE status='open' AND closes_at <= '${NOW}';
   SELECT changes();")
if [[ "$EXPIRED" != "0" ]]; then
  log "만료 토론 ${EXPIRED}건 닫음"
  # 합성자 트리거
  SYNTHESIZER="$BOT_HOME/bin/discussion-synthesizer.sh"
  if [[ -x "$SYNTHESIZER" ]]; then
    for eid in "${EXPIRED_IDS[@]}"; do
      log "합성자 트리거 — post:${eid}"
      (
        BOT_HOME="$BOT_HOME" \
        BOARD_URL="${BOARD_URL:-https://jarvis-board-production.up.railway.app}" \
        AGENT_API_KEY="${AGENT_API_KEY:-}" \
        bash "$SYNTHESIZER" "$eid" >> "$LOG" 2>&1
      ) &
    done
    wait
  fi
fi

# ── 진행 중인 토론 목록 (bash 3.2 호환 — no mapfile) ─────────────────────────
OPEN_POSTS=()
while IFS= read -r row; do
  if [[ -n "$row" ]]; then OPEN_POSTS+=("$row"); fi
done < <(sqlite3 "$DB" \
  "SELECT id, post_type, opened_at FROM discussions
   WHERE status='open' AND closes_at > '${NOW}';" 2>/dev/null || true)

if [[ ${#OPEN_POSTS[@]} -eq 0 ]]; then
  exit 0
fi

log "진행 중인 토론: ${#OPEN_POSTS[@]}건"

# ── 페르소나 목록 로드 ────────────────────────────────────────────────────────
PERSONA_IDS=()
while IFS= read -r pid; do PERSONA_IDS+=("$pid"); done < <(jq -r '.personas[].id' "$PERSONAS_JSON")
PERSONA_DELAYS=()
while IFS= read -r dl; do PERSONA_DELAYS+=("$dl"); done < <(jq -r '.personas[].comment_delay_seconds // 60' "$PERSONAS_JSON")

# ── 세마포어 카운터 (백그라운드 작업 수) ─────────────────────────────────────
RUNNING=0

wait_slot() {
  while (( RUNNING >= MAX_CONCURRENT )); do
    wait -n 2>/dev/null || wait
    (( RUNNING-- )) || true
  done
}

for ROW in "${OPEN_POSTS[@]}"; do
  IFS='|' read -r POST_ID POST_TYPE OPENED_AT <<< "$ROW"

  # opened_at 을 epoch 으로 변환 (macOS 호환)
  OPENED_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$OPENED_AT" +%s 2>/dev/null \
    || date -d "$OPENED_AT" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  ELAPSED=$(( NOW_EPOCH - OPENED_EPOCH ))

  for i in "${!PERSONA_IDS[@]}"; do
    PID_VAL="${PERSONA_IDS[$i]}"
    DELAY="${PERSONA_DELAYS[$i]}"

    # 딜레이 미경과
    if (( ELAPSED < DELAY )); then
      continue
    fi

    # 이미 댓글 달았는지 확인
    DONE=$(sqlite3 "$DB" \
      "SELECT count(*) FROM discussion_comments
       WHERE discussion_id='${POST_ID//\'/\'\'}' AND persona_id='${PID_VAL//\'/\'\'}';")
    if [[ "$DONE" != "0" ]]; then
      continue
    fi

    # 댓글 dispatch
    log "dispatch — persona:${PID_VAL} post:${POST_ID} (elapsed:${ELAPSED}s)"
    wait_slot
    (
      BOT_HOME="$BOT_HOME" \
      BOARD_URL="${BOARD_URL:-https://jarvis-board-production.up.railway.app}" \
      AGENT_API_KEY="${AGENT_API_KEY:-}" \
      bash "$BOT_HOME/bin/persona-commenter.sh" "$PID_VAL" "$POST_ID" \
        2>/dev/null
    ) &
    (( RUNNING++ )) || true
  done
done

# 남은 백그라운드 작업 대기
wait
log "완료"
