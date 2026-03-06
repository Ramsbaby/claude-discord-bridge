#!/usr/bin/env bash
set -euo pipefail

# update-broadcast.sh - Git 변경 감지 → jarvis-system Discord 브로드캐스트
# 5분 간격 크론. 새 커밋 감지 시 "뭐가 바뀌었고, 조치가 필요한지" 한눈에 보이게 전송.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin:${PATH}"
export HOME="${HOME:-/Users/$(id -un)}"

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
STATE_FILE="$BOT_HOME/state/triggers/update-broadcast.last-sha"
MONITORING_CONFIG="$BOT_HOME/config/monitoring.json"
LOG="$BOT_HOME/logs/update-broadcast.log"
GITHUB_REPO_URL="$(cd "$BOT_HOME" && git remote get-url origin 2>/dev/null | sed 's/\.git$//' || echo "")"

mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# --- Webhook URL ---
get_webhook_url() {
    [[ -f "$MONITORING_CONFIG" ]] || return 1
    jq -r '.webhooks["jarvis-system"] // .webhook.url // ""' "$MONITORING_CONFIG"
}

# --- Discord Embed 전송 ---
send_embed() {
    local title="$1" description="$2" color="$3"
    local webhook_url
    webhook_url=$(get_webhook_url) || return 1
    [[ -z "$webhook_url" ]] && return 1

    local embed_json
    embed_json=$(jq -n \
        --arg user "Jarvis" \
        --arg title "$title" \
        --arg desc "$description" \
        --argjson color "$color" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
        --arg footer "$(hostname -s) · $(date '+%H:%M')" \
        '{"username":$user,"embeds":[{"title":$title,"description":$desc,"color":$color,"timestamp":$ts,"footer":{"text":$footer}}]}')

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$webhook_url" \
        -H "Content-Type: application/json" -d "$embed_json" 2>&1)

    [[ "$http_code" == "204" ]] || [[ "$http_code" == "200" ]]
}

# --- 변경 내용을 사람이 읽을 수 있게 요약 ---
build_summary() {
    local last_sha="$1"
    local files changed_dirs summary="" action=""
    files=$(git -C "$BOT_HOME" diff --name-only "$last_sha..HEAD" 2>/dev/null || echo "")
    [[ -z "$files" ]] && return

    # 변경된 디렉토리별로 무엇이 바뀌었는지 구체적으로
    local has_bot=false has_cron=false has_config=false has_llm=false
    local has_plugin=false has_infra=false has_rag=false has_install=false
    local has_docs_only=true

    while IFS= read -r f; do
        case "$f" in
            discord/discord-bot.js|discord/lib/*)
                has_bot=true; has_docs_only=false ;;
            bin/jarvis-cron.sh|bin/retry-wrapper.sh|bin/ask-claude.sh)
                has_cron=true; has_docs_only=false ;;
            config/tasks.json|config/monitoring.json|config/company-dna.md|discord/personas.json|discord/locales/*)
                has_config=true; has_docs_only=false ;;
            lib/llm-gateway.sh|lib/context-loader.sh|lib/insight-recorder.sh)
                has_llm=true; has_docs_only=false ;;
            plugins/*|bin/plugin-loader.sh)
                has_plugin=true; has_docs_only=false ;;
            scripts/watchdog.sh|scripts/launchd-guardian.sh|scripts/e2e-test.sh)
                has_infra=true; has_docs_only=false ;;
            scripts/*)
                has_docs_only=false ;;
            lib/rag-*|bin/rag-*)
                has_rag=true; has_docs_only=false ;;
            install.sh|bin/jarvis-init.sh)
                has_install=true; has_docs_only=false ;;
            *.md|*.txt|*.example)
                ;; # docs/examples — don't flip has_docs_only
            *)
                has_docs_only=false ;;
        esac
    done <<< "$files"

    # 요약 문장 조립
    local parts=()
    if $has_bot; then parts+=("봇 응답 처리"); fi
    if $has_cron; then parts+=("크론 엔진"); fi
    if $has_llm; then parts+=("AI 엔진"); fi
    if $has_rag; then parts+=("RAG 검색"); fi
    if $has_plugin; then parts+=("플러그인"); fi
    if $has_infra; then parts+=("안정성 스크립트"); fi
    if $has_install; then parts+=("설치 스크립트"); fi
    if $has_config; then
        # 어떤 설정이 바뀌었는지
        local cfg_list=""
        if echo "$files" | grep -q '^config/tasks\.json$'; then cfg_list+="태스크, "; fi
        if echo "$files" | grep -q '^config/monitoring\.json$'; then cfg_list+="모니터링, "; fi
        if echo "$files" | grep -q '^config/company-dna\.md$'; then cfg_list+="Company DNA, "; fi
        if echo "$files" | grep -q '^discord/personas\.json$'; then cfg_list+="페르소나, "; fi
        if echo "$files" | grep -q '^discord/locales/'; then cfg_list+="언어, "; fi
        cfg_list="${cfg_list%, }"
        if [[ -n "$cfg_list" ]]; then
            parts+=("설정(${cfg_list})")
        fi
    fi

    local summary
    if [[ ${#parts[@]} -eq 0 ]]; then
        if $has_docs_only; then
            summary="문서 업데이트"
        else
            # fallback: 변경된 디렉토리 이름으로
            local top_dir
            top_dir=$(echo "$files" | awk -F/ 'NF>1{print $1}' | sort | uniq | head -1)
            summary="${top_dir:-기타} 코드 개선"
        fi
    elif [[ ${#parts[@]} -le 2 ]]; then
        summary="${parts[0]}${parts[1]:+ + ${parts[1]}} 변경"
    else
        summary="${parts[0]}, ${parts[1]} 외 $((${#parts[@]}-2))건 변경"
    fi

    # 조치 필요 여부
    if $has_bot || $has_config; then
        action="⚠️ 봇 재시작 권장"
    elif $has_cron || $has_llm; then
        action="ℹ️ 다음 크론 실행부터 자동 적용"
    elif $has_docs_only; then
        action="✅ 시스템 영향 없음"
    else
        action="✅ 자동 적용됨"
    fi

    echo "${summary}"
    echo "${action}"
}

# ============================================================================
# Main
# ============================================================================
log "업데이트 브로드캐스트 체크 시작"

if [[ ! -d "$BOT_HOME/.git" ]]; then
    log "ERROR: git 저장소 아님"
    exit 0
fi

current_sha=$(git -C "$BOT_HOME" rev-parse HEAD 2>/dev/null || true)
[[ -z "$current_sha" ]] && exit 0

# 첫 실행: 상태 저장 후 종료
if [[ ! -f "$STATE_FILE" ]]; then
    echo "$current_sha" > "$STATE_FILE"
    log "첫 실행 — 초기화: ${current_sha:0:8}"
    exit 0
fi

last_sha=$(cat "$STATE_FILE" 2>/dev/null || echo "")
[[ -z "$last_sha" ]] && { echo "$current_sha" > "$STATE_FILE"; exit 0; }
[[ "$current_sha" == "$last_sha" ]] && exit 0

# SHA 유효성 체크
if ! git -C "$BOT_HOME" cat-file -t "$last_sha" &>/dev/null; then
    log "WARN: 이전 SHA 없음 — 리셋"
    send_embed "⚠️ Git 히스토리 리셋 감지" "force push 또는 rebase가 실행됨" "16776960" || true
    echo "$current_sha" > "$STATE_FILE"
    exit 0
fi

# --- 변경 감지 ---
log "변경 감지: ${last_sha:0:8} → ${current_sha:0:8}"

commit_count=$(git -C "$BOT_HOME" rev-list --count "$last_sha..HEAD" 2>/dev/null || echo "0")

# 요약 생성
summary_output=$(build_summary "$last_sha")
change_summary=$(echo "$summary_output" | head -1)
action_line=$(echo "$summary_output" | tail -1)

# GitHub 비교 링크
compare_link=""
if [[ -n "$GITHUB_REPO_URL" ]]; then
    compare_link=$'\n'"[상세 보기](${GITHUB_REPO_URL}/compare/${last_sha:0:7}...${current_sha:0:7})"
fi

# 제목 + 본문
title="🔄 ${change_summary}"
description="${action_line}${compare_link}"

# 설정 변경 시 노랑, 아닌 경우 파랑
color=3447003
if echo "$action_line" | grep -q "재시작"; then
    color=16776960
fi

# --- 전송 ---
if send_embed "$title" "$description" "$color"; then
    echo "$current_sha" > "$STATE_FILE"
    log "브로드캐스트 완료: ${change_summary} (${commit_count}건)"
else
    log "브로드캐스트 실패 — 재시도 예정"
fi
