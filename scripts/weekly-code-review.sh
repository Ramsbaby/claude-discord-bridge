#!/usr/bin/env bash
set -euo pipefail

# weekly-code-review.sh — 주간 LLM 기반 의미론적 코드 리뷰
# 패턴 매칭(auditor)으로 못 잡는 로직 버그, 보안 취약점, SSoT 위반을 LLM이 검증
# 크론: 매주 일요일 05:00

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
REVIEW_DIR="${BOT_HOME}/results/code-review"
TODAY="$(date +%F)"
REVIEW_FILE="${REVIEW_DIR}/${TODAY}.md"
LOG="${BOT_HOME}/logs/weekly-code-review.log"

mkdir -p "$REVIEW_DIR" "$(dirname "$LOG")"

log() { echo "[$(date -u +%FT%TZ)] code-review: $*" >> "$LOG"; }
log "=== Weekly code review started ==="

# 의존성 확인
for _cmd in claude jq gtimeout; do
    if ! command -v "$_cmd" >/dev/null 2>&1; then
        log "FATAL: $_cmd not found"
        exit 2
    fi
done

# --- 리뷰 대상 수집 (최근 7일 변경 파일) ---
CHANGED_FILES=""
if [[ -d "${BOT_HOME}/.git" ]]; then
    COMMIT_COUNT=$(git -C "$BOT_HOME" rev-list --count HEAD 2>/dev/null || echo "0")
    if [[ "$COMMIT_COUNT" -gt 0 ]]; then
        DEPTH=$(( COMMIT_COUNT < 50 ? COMMIT_COUNT : 50 ))
        CHANGED_FILES=$(git -C "$BOT_HOME" diff --name-only "HEAD~${DEPTH}" HEAD 2>/dev/null \
            | grep -E '\.(sh|js|mjs)$' \
            | grep -v node_modules \
            | head -20 || true)
    fi
fi

# 변경 없으면 주요 파일만 리뷰
if [[ -z "$CHANGED_FILES" ]]; then
    CHANGED_FILES="bin/decision-dispatcher.sh
bin/board-meeting.sh
bin/ask-claude.sh
discord/lib/session.js"
fi

log "Review targets: $(echo "$CHANGED_FILES" | wc -l | tr -d ' ') files"

# --- 파일 내용 수집 (토큰 절약: 각 파일 최대 200줄) ---
REVIEW_CONTEXT=""
while IFS= read -r file; do
    if [[ -z "$file" ]]; then continue; fi
    filepath="${BOT_HOME}/${file}"
    if [[ ! -f "$filepath" ]]; then continue; fi

    line_count=$(wc -l < "$filepath" | tr -d ' ')
    if [[ "$line_count" -gt 200 ]]; then
        content=$(head -200 "$filepath")
        REVIEW_CONTEXT="${REVIEW_CONTEXT}
=== ${file} (${line_count} lines, showing first 200) ===
${content}
"
    else
        content=$(cat "$filepath")
        REVIEW_CONTEXT="${REVIEW_CONTEXT}
=== ${file} ===
${content}
"
    fi
done <<< "$CHANGED_FILES"

# --- LLM 리뷰 프롬프트 ---
PROMPT="너는 시니어 보안+인프라 코드 리뷰어다. 긍정편향 절대 금지. 문제만 보고해.

아래는 Jarvis AI 오퍼레이션 시스템의 최근 변경 코드다. 다음 관점으로 검증하라:

## 검증 항목
1. **보안**: bash→Python 변수 주입(\${var}가 Python 문자열에 직접 삽입), JSON 인젝션, 경로 주입
2. **bash set -e 안전성**: 조건부 단축실행(if문 대체 필수), bare (( 0 )), pipe+while 서브쉘 변수 누출
3. **원자적 쓰기**: seek(0)+truncate vs tempfile+os.replace, 중요 파일의 crash safety
4. **로직 결함**: exit code 오분류, 경쟁조건(lock 부재), 중복 실행 방지 실패
5. **SSoT 위반**: 같은 정보가 2곳 이상에 정의되어 수치/내용 불일치
6. **bash 3.x 호환**: declare -A, nameref, [[ =~ ]] 확장 등 macOS 기본 bash 3.2 비호환

## 출력 형식
\`\`\`
# Weekly Code Review — ${TODAY}

## CRITICAL (즉시 수정)
- [파일:줄] 문제 설명 → 수정 방법

## HIGH (이번 주 내 수정)
- [파일:줄] 문제 설명 → 수정 방법

## MEDIUM (개선 권장)
- [파일:줄] 문제 설명

## PASS (문제 없음)
- 검증 통과한 항목 리스트
\`\`\`

문제가 없으면 PASS만 출력. 사소한 스타일 이슈는 무시. 실제 런타임 버그와 보안 위험만 보고.

## 코드
${REVIEW_CONTEXT}"

# --- LLM 실행 ---
log "Calling claude -p for semantic review..."
REVIEW_RESULT=""
if REVIEW_RESULT=$(gtimeout 180 claude -p "$PROMPT" \
    --model claude-sonnet-4-20250514 \
    --max-turns 1 \
    2>/dev/null); then
    log "Review completed successfully"
else
    log "Review failed or timed out"
    REVIEW_RESULT="# Weekly Code Review — ${TODAY}

## ERROR
LLM 리뷰 실행 실패 (timeout 또는 API 오류). 다음 주 재시도."
fi

# --- 결과 저장 ---
echo "$REVIEW_RESULT" > "$REVIEW_FILE"
log "Report saved: ${REVIEW_FILE}"

# --- CRITICAL/HIGH 발견 시 알림 ---
if echo "$REVIEW_RESULT" | grep -qi "## CRITICAL"; then
    "${BOT_HOME}/scripts/alert.sh" critical "Weekly Code Review" \
        "[Code Review] CRITICAL 이슈 발견 — ${REVIEW_FILE} 확인 필요" 2>/dev/null || true
    "${BOT_HOME}/bin/route-result.sh" discord "weekly-code-review" \
        "[Code Review ${TODAY}] CRITICAL 이슈 발견. 상세: results/code-review/${TODAY}.md" \
        "jarvis-system" 2>/dev/null || true
elif echo "$REVIEW_RESULT" | grep -qi "## HIGH"; then
    "${BOT_HOME}/bin/route-result.sh" discord "weekly-code-review" \
        "[Code Review ${TODAY}] HIGH 이슈 발견. 상세: results/code-review/${TODAY}.md" \
        "jarvis-system" 2>/dev/null || true
else
    "${BOT_HOME}/bin/route-result.sh" discord "weekly-code-review" \
        "[Code Review ${TODAY}] 이상 없음." \
        "jarvis-system" 2>/dev/null || true
fi

# --- 오래된 리뷰 정리 (90일) ---
find "$REVIEW_DIR" -name "*.md" -mtime +90 -delete 2>/dev/null || true

log "=== Weekly code review completed ==="
echo "$REVIEW_RESULT"
