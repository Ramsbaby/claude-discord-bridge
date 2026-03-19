#!/usr/bin/env bash
# board-insights.sh — 워크그룹 게시판 인사이트 증류기
#
# 원문(data/workgroup/YYYY-MM-DD.md) → Claude 분석 →
# 가치 있으면 ~/Jarvis-Vault/05-insights/workgroup/YYYY-MM-DD.md 저장
# → rag-watch가 자동 인덱싱 (Vault 전체 감시 대상)
#
# 실행: bash ~/.jarvis/bin/board-insights.sh [YYYY-MM-DD]
# 기본값: 오늘 날짜

set -uo pipefail   # set -e 제외 — 파이프 에러 때문에 중간 종료 방지

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
TARGET_DATE="${1:-$(date '+%Y-%m-%d')}"
BOARD_DIR="$BOT_HOME/data/workgroup"
INSIGHTS_DIR="$HOME/Jarvis-Vault/05-insights/workgroup"
BOARD_FILE="$BOARD_DIR/$TARGET_DATE.md"
INSIGHT_FILE="$INSIGHTS_DIR/$TARGET_DATE.md"
LOG="$BOT_HOME/logs/board-insights.log"
MONITORING="$BOT_HOME/config/monitoring.json"
WEBHOOK_URL=$(jq -r '.webhooks["workgroup-board"] // ""' "$MONITORING" 2>/dev/null || echo "")

# 임시 파일 — Claude 원본 응답 저장
CLAUDE_TMP="$BOT_HOME/tmp/board-insights-claude-$$.json"
PY_TMP="$BOT_HOME/tmp/board-insights-py-$$.py"

mkdir -p "$INSIGHTS_DIR" "$(dirname "$LOG")" "$BOT_HOME/tmp"
cleanup() { rm -f "$CLAUDE_TMP" "$PY_TMP" 2>/dev/null || true; }
trap cleanup EXIT

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [board-insights] $*" | tee -a "$LOG"; }

# 로그 5MB 초과 시 마지막 1000줄 유지
if [[ -f "$LOG" ]] && (( $(wc -c < "$LOG") > 5242880 )); then
  tail -n 1000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

discord_notify() {
  local content="$1"
  if [[ -z "$WEBHOOK_URL" ]]; then return 0; fi
  curl -sf --max-time 10 -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg c "$content" \
      '{"content":$c,"username":"자비스-워크그룹","avatar_url":"https://i.imgur.com/4M34hi2.png"}')" \
    >/dev/null 2>&1 || true
}

# ── 원문 존재 확인 ─────────────────────────────────────────────────────────────
if [[ ! -f "$BOARD_FILE" ]]; then
  log "원문 파일 없음: $BOARD_FILE — 건너뜀."
  exit 0
fi

BOARD_SIZE=$(wc -c < "$BOARD_FILE" | tr -d ' ')
if [[ "$BOARD_SIZE" -lt 300 ]]; then
  log "원문 내용 너무 짧음 (${BOARD_SIZE}B). 스킵."
  exit 0
fi

log "분석 시작: $BOARD_FILE (${BOARD_SIZE}B)"

# ── 원문 읽기 (헤더·경고 제외, 앞 8000자 제한) ───────────────────────────────
BOARD_CONTENT=$(grep -v '^---' "$BOARD_FILE" 2>/dev/null | \
  grep -v '^> ⚠️' 2>/dev/null | \
  sed '/^# Workgroup/d' | \
  head -c 8000 || true)

if [[ -z "$BOARD_CONTENT" ]]; then
  log "원문 파싱 후 내용 없음. 스킵."
  exit 0
fi

# ── 시스템 프롬프트 ──────────────────────────────────────────────────────────
SYSTEM_PROMPT='당신은 자비스(Jarvis) AI 시스템의 지식 증류 에이전트입니다.
워크그룹(Workgroup) AI 에이전트 커뮤니티 게시판에서 수집된 원문을 분석해
자비스 프로젝트 개선에 실질적으로 활용 가능한 인사이트만 추출합니다.

【추출 기준 — 포함해야 할 것】
- AI 에이전트 설계 패턴 (메모리 관리, 컨텍스트 전달, 멀티 에이전트 조율)
- 자비스가 겪고 있거나 겪을 수 있는 공통 문제와 해결 방법
- 자동화 파이프라인 설계 노하우 (크론, 큐, 재시도, 동시성 제어 등)
- LLM 활용 아이디어 (프롬프트 전략, 비용 최적화, 신뢰성)
- 오픈소스 AI 에이전트 커뮤니티의 실전 경험담

【제외 기준 — 버릴 것】
- 단순 인사, 잡담, 감정 표현 (기술적 가치 없음)
- 모든 개인 식별 정보 (이름, 닉네임, 소속, 연락처 등) — 완전 제거
- 특정 개인에 대한 평가
- 반복되는 주제 (새로운 관점 없을 때)

【출력 형식 — JSON 한 줄만】
가치 있는 인사이트가 있을 때:
{"hasInsight":true,"insights":[{"title":"제목(20자 이내)","summary":"핵심 내용 (200자 이내, 개인정보 완전 제거)","applicableToJarvis":"자비스 적용 방안 (100자 이내)","priority":"high|medium|low"}]}

없을 때:
{"hasInsight":false,"reason":"이유"}

priority 기준:
- high: 즉시 검토·적용 가치 있음
- medium: 기회 되면 검토
- low: 참고용'

USER_PROMPT="아래는 ${TARGET_DATE} 워크그룹 게시판 원문 데이터입니다.
자비스 개선에 활용할 만한 기술 인사이트를 추출해주세요.

⚠️ 주의사항:
- 모든 개인 식별 정보(이름, 닉네임 포함)를 요약에서 완전히 제거하세요.
- 자비스 집사 시스템의 오너에 관한 내용은 추출하지 마세요.
- 기술적 본질만 담아주세요.

--- 원문 데이터 시작 ---
${BOARD_CONTENT}
--- 원문 데이터 끝 ---

JSON 한 줄만 출력:"

# ── Claude 호출 → tmp 파일 저장 ──────────────────────────────────────────────
unset CLAUDECODE CLAUDE_CODE_ENTRYPOINT 2>/dev/null || true

log "Claude 인사이트 분석 중..."
printf '%s' "$USER_PROMPT" | \
  claude -p \
    --system-prompt "$SYSTEM_PROMPT" \
    --mcp-config "$BOT_HOME/config/empty-mcp.json" \
    --output-format text \
    2>/dev/null > "$CLAUDE_TMP" || true

# ── Python으로 JSON 추출 ──────────────────────────────────────────────────────
cat > "$PY_TMP" << 'PYEOF'
import sys, json, re

with open(sys.argv[1], 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(r'```(?:json)?\n?', '', text).replace('```', '').strip()
result = {"hasInsight": False, "reason": "parse_failed"}
for m in re.finditer(r'\{.+\}', text, re.DOTALL):
    try:
        d = json.loads(m.group())
        if "hasInsight" in d:
            result = d
            break
    except Exception:
        continue

print(json.dumps(result, ensure_ascii=False))
PYEOF

RESPONSE=$(python3 "$PY_TMP" "$CLAUDE_TMP" 2>/dev/null || echo '{"hasInsight":false,"reason":"python_failed"}')

HAS_INSIGHT=$(echo "$RESPONSE" | jq -r '.hasInsight // "false"' 2>/dev/null || echo "false")

if [[ "$HAS_INSIGHT" != "true" ]]; then
  REASON=$(echo "$RESPONSE" | jq -r '.reason // "기술 인사이트 없음"' 2>/dev/null || echo "기술 인사이트 없음")
  log "인사이트 없음: $REASON"
  exit 0
fi

INSIGHT_COUNT=$(echo "$RESPONSE" | jq '.insights | length' 2>/dev/null || echo 0)
log "인사이트 ${INSIGHT_COUNT}건 추출됨. Vault에 저장합니다: $INSIGHT_FILE"

# ── Vault에 마크다운으로 저장 ─────────────────────────────────────────────────
# RESPONSE를 파일로 전달 (bash 인라인 이스케이핑 완전 회피)
echo "$RESPONSE" > "${CLAUDE_TMP}.parsed"

python3 << PYEOF2 > "$INSIGHT_FILE"
import json, sys

with open('${CLAUDE_TMP}.parsed', 'r', encoding='utf-8') as f:
    data = json.load(f)

target_date = '${TARGET_DATE}'
insights = data.get('insights', [])
priority_emoji = {'high': '🔴', 'medium': '🟡', 'low': '🟢'}

lines = [
    '---',
    f'title: "Workgroup 인사이트 — {target_date}"',
    'tags: [area/insights, type/board-insight, source/workgroup]',
    f'created: {target_date}',
    '---',
    '',
    f'# Workgroup 게시판 인사이트 — {target_date}',
    '',
    '> 자비스 AI가 증류한 기술 인사이트. 개인정보 제거, 기술 핵심만 보존.',
    '',
]

for i, ins in enumerate(insights, 1):
    p = ins.get('priority', 'low')
    emoji = priority_emoji.get(p, '⚪')
    lines.append(f'## {i}. {ins.get("title", "인사이트")} {emoji}')
    lines.append('')
    lines.append(f'- **요약**: {ins.get("summary", "")}')
    lines.append(f'- **자비스 적용**: {ins.get("applicableToJarvis", "")}')
    lines.append(f'- **우선순위**: {p}')
    lines.append('')

print('\n'.join(lines))
PYEOF2

log "저장 완료: $INSIGHT_FILE"

# ── Discord 알림 ──────────────────────────────────────────────────────────────
HIGH_COUNT=$(echo "$RESPONSE" | jq '[.insights[] | select(.priority=="high")] | length' 2>/dev/null || echo 0)
SUMMARY=$(echo "$RESPONSE" | jq -r '.insights[0].title // ""' 2>/dev/null || echo "")
MSG="💡 **Workgroup 인사이트 ${INSIGHT_COUNT}건 추출** (${TARGET_DATE})"
if [[ "$HIGH_COUNT" -gt 0 ]]; then
  MSG="${MSG} — 🔴 고우선순위 ${HIGH_COUNT}건"
fi
if [[ -n "$SUMMARY" ]]; then
  MSG="${MSG}\n> 예시: ${SUMMARY}"
fi
discord_notify "$MSG"

log "완료."
