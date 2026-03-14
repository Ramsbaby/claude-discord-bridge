#!/usr/bin/env bash
# gen-demo.sh — Jarvis 데모 GIF 자동 생성
# 출력: docs/demo.gif (README에서 바로 임베드 가능)
#
# 의존성: asciinema, agg (brew install asciinema agg)
# 사용법: ./scripts/gen-demo.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_HOME="$(dirname "$SCRIPT_DIR")"
CAST_FILE="/tmp/jarvis-demo.cast"
OUT_GIF="$BOT_HOME/docs/demo.gif"

# ── 색상 ───────────────────────────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 의존성 체크 ────────────────────────────────────────────────────────────────
for cmd in asciinema agg node; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: $cmd not found."
        if [[ "$cmd" == "asciinema" || "$cmd" == "agg" ]]; then echo "  brew install asciinema agg"; fi
        exit 1
    fi
done

echo -e "${BOLD}Jarvis Demo GIF Generator${NC}"
echo ""

# ── 데모 내용 스크립트 (asciinema가 실행할 bash) ───────────────────────────────
DEMO_SCRIPT="$(cat <<'DEMO_EOF'
#!/usr/bin/env bash
# 실제로 명령을 실행하는 내부 스크립트

_type() {
    local msg="$1"
    local delay="${2:-0.05}"
    for (( i=0; i<${#msg}; i++ )); do
        printf '%s' "${msg:$i:1}"
        sleep "$delay"
    done
    echo ""
}

_pause() { sleep "${1:-0.8}"; }

# 터미널 초기화
clear
_pause 0.5

# ── 섹션 1: Jarvis 소개 ─────────────────────────────────────────────────────
_type "$ # ✨ Jarvis — AI Assistant Powered by Claude"
_pause 0.6
_type "$ # Discord bot + 30+ cron tasks + RAG memory"
_pause 1.0

# ── 섹션 2: CLI 테스트 모드 (토큰 없이) ───────────────────────────────────────
echo ""
_type "$ # No Discord token? Use local test mode:"
_pause 0.4
_type "$ node discord/cli-test.js --run /status" 0.04
_pause 0.3
cd "$BOT_HOME"
node discord/cli-test.js --run /status 2>/dev/null | head -10
_pause 1.2

# ── 섹션 3: 작업 목록 ─────────────────────────────────────────────────────────
echo ""
_type "$ node discord/cli-test.js --run /tasks" 0.04
_pause 0.3
node discord/cli-test.js --run /tasks 2>/dev/null | head -15
_pause 1.2

# ── 섹션 4: RAG 검색 ──────────────────────────────────────────────────────────
echo ""
_type "$ # Semantic search across 344MB of notes:"
_pause 0.4
_type "$ node discord/cli-test.js --run '/search backend API'" 0.04
_pause 0.3
node discord/cli-test.js --run '/search backend API' 2>/dev/null | head -12
_pause 1.2

# ── 섹션 5: 설치 옵션 ─────────────────────────────────────────────────────────
echo ""
_type "$ # Tiered install — pick your footprint:" 0.04
_pause 0.4
_type "$ ./install.sh --tier 0   # 150MB  discord.js only" 0.04
_pause 0.3
_type "$ ./install.sh --tier 1   # 350MB  + SQLite + YAML" 0.04
_pause 0.3
_type "$ ./install.sh --tier 2   # 700MB  + LanceDB + OpenAI (default)" 0.04
_pause 0.3
_type "$ ./install.sh --docker   # Containerized setup" 0.04
_pause 1.0

# ── 섹션 6: Smoke test ────────────────────────────────────────────────────────
echo ""
_type "$ # CI-friendly smoke test (no token needed):" 0.04
_pause 0.4
_type "$ node discord/cli-test.js --smoke-test" 0.04
_pause 0.3
node discord/cli-test.js --smoke-test 2>/dev/null
_pause 1.5

echo ""
_type "$ # ⭐ github.com/Ramsbaby/jarvis" 0.04
_pause 2.0
DEMO_EOF
)"

# ── 임시 파일로 저장 ───────────────────────────────────────────────────────────
INNER_SCRIPT="/tmp/jarvis-demo-inner.sh"
echo "$DEMO_SCRIPT" > "$INNER_SCRIPT"
chmod +x "$INNER_SCRIPT"

# ── 녹화 ──────────────────────────────────────────────────────────────────────
echo -e "  ${CYAN}[1/3]${NC} 터미널 세션 녹화 중..."
rm -f "$CAST_FILE"

# BOT_HOME 주입해서 상대 경로 동작하게
BOT_HOME="$BOT_HOME" asciinema rec \
    --overwrite \
    --cols 90 \
    --rows 30 \
    --command "bash $INNER_SCRIPT" \
    --title "Jarvis AI Assistant Demo" \
    "$CAST_FILE" 2>/dev/null

echo -e "  ${CYAN}[2/3]${NC} GIF 변환 중..."
mkdir -p "$BOT_HOME/docs"

agg \
    --cols 90 \
    --rows 30 \
    --font-size 14 \
    --theme monokai \
    --speed 1.5 \
    "$CAST_FILE" \
    "$OUT_GIF"

# ── 결과 ──────────────────────────────────────────────────────────────────────
echo -e "  ${CYAN}[3/3]${NC} 정리..."
rm -f "$INNER_SCRIPT" "$CAST_FILE"

FILE_SIZE=$(du -sh "$OUT_GIF" | cut -f1)
echo ""
echo -e "${GREEN}${BOLD}완료!${NC} $OUT_GIF (${FILE_SIZE})"
echo ""
echo "README.md에 추가:"
echo "  ![Jarvis Demo](docs/demo.gif)"
echo ""
echo "GIF 미리보기 (macOS):"
echo "  open $OUT_GIF"
