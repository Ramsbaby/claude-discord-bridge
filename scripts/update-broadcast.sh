#!/usr/bin/env bash
set -euo pipefail

# update-broadcast.sh - Git 변경 감지 → jarvis-system Discord 브로드캐스트
# 5분 간격 크론으로 실행. 새 커밋/설정 변경 감지 시 임베드 알림 발송.

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin:${PATH}"
export HOME="${HOME:-/Users/$(id -un)}"

BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
STATE_FILE="$BOT_HOME/state/triggers/update-broadcast.last-sha"
MONITORING_CONFIG="$BOT_HOME/config/monitoring.json"
LOG="$BOT_HOME/logs/update-broadcast.log"

# 변경 감지 대상 설정 파일
WATCHED_CONFIGS=(
    "config/tasks.json"
    "config/monitoring.json"
    "config/company-dna.md"
    "discord/personas.json"
    "discord/locales/ko.json"
)

# 최대 표시 커밋 수
MAX_COMMITS=8

# GitHub 커밋 링크 베이스 URL
# GitHub repo URL — set via git remote or override here
GITHUB_REPO_URL="$(cd "$BOT_HOME" && git remote get-url origin 2>/dev/null | sed 's/\.git$//' || echo "https://github.com/YOUR_USERNAME/jarvis")"

mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# --- Webhook URL 조회 (jarvis-system 채널) ---
get_webhook_url() {
    if [[ ! -f "$MONITORING_CONFIG" ]]; then
        log "ERROR: monitoring.json not found"
        return 1
    fi
    jq -r '.webhooks["jarvis-system"] // .webhook.url // ""' "$MONITORING_CONFIG"
}

# --- Discord Embed 전송 ---
send_embed() {
    local title="$1" description="$2" color="$3"
    local fields="${4:-}"
    local webhook_url
    webhook_url=$(get_webhook_url)
    if [[ -z "$webhook_url" ]]; then
        log "WARN: webhook URL not found"
        return 1
    fi

    local timestamp hostname
    timestamp=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
    hostname=$(hostname -s)

    local embed_json
    if [[ -n "$fields" ]] && [[ "$fields" != "[]" ]]; then
        embed_json=$(jq -n \
            --arg user "Jarvis" \
            --arg title "$title" \
            --arg desc "$description" \
            --argjson color "$color" \
            --arg ts "$timestamp" \
            --argjson fields "$fields" \
            --arg footer "Jarvis Update · $hostname" \
            '{"username":$user,"embeds":[{"title":$title,"description":$desc,"color":$color,"timestamp":$ts,"fields":$fields,"footer":{"text":$footer}}]}')
    else
        embed_json=$(jq -n \
            --arg user "Jarvis" \
            --arg title "$title" \
            --arg desc "$description" \
            --argjson color "$color" \
            --arg ts "$timestamp" \
            --arg footer "Jarvis Update · $hostname" \
            '{"username":$user,"embeds":[{"title":$title,"description":$desc,"color":$color,"timestamp":$ts,"footer":{"text":$footer}}]}')
    fi

    local http_code
    http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$webhook_url" \
        -H "Content-Type: application/json" \
        -d "$embed_json" 2>&1)

    if [[ "$http_code" == "204" ]] || [[ "$http_code" == "200" ]]; then
        log "Discord 전송 성공: $title"
        return 0
    else
        log "Discord 전송 실패 (HTTP $http_code): $title"
        return 1
    fi
}

# --- Conventional Commit prefix → 한글 카테고리 ---
commit_category() {
    local msg="$1"
    case "$msg" in
        feat:*|feat\(*) echo "✨ 신규" ;;
        fix:*|fix\(*)   echo "🐛 수정" ;;
        docs:*|docs\(*) echo "📝 문서" ;;
        refactor:*|refactor\(*) echo "♻️ 리팩토링" ;;
        style:*|style\(*) echo "🎨 스타일" ;;
        test:*|test\(*) echo "🧪 테스트" ;;
        perf:*|perf\(*) echo "⚡ 성능" ;;
        ci:*|ci\(*)     echo "🔧 CI" ;;
        chore:*|chore\(*) echo "🔩 기타" ;;
        *)              echo "📦 변경" ;;
    esac
}

# --- 커밋 메시지에서 prefix 제거 ---
strip_prefix() {
    local msg="$1"
    # "feat(scope): msg" 또는 "feat: msg" → "msg"
    echo "$msg" | sed -E 's/^[a-z]+(\([^)]*\))?:[[:space:]]*//'
}

# --- 커밋 요약 포맷 ---
format_commits() {
    local last_sha="$1"
    local commits
    commits=$(git -C "$BOT_HOME" log --oneline --no-decorate "$last_sha..HEAD" 2>/dev/null || echo "")

    if [[ -z "$commits" ]]; then
        echo ""
        return
    fi

    local total
    total=$(echo "$commits" | wc -l | tr -d ' ')

    if (( total > MAX_COMMITS )); then
        commits=$(echo "$commits" | head -n "$MAX_COMMITS")
    fi

    local formatted=""
    while IFS= read -r line; do
        local sha="${line%% *}"
        local msg="${line#* }"
        local category
        category=$(commit_category "$msg")
        local clean_msg
        clean_msg=$(strip_prefix "$msg")
        formatted+="${category} — ${clean_msg}"$'\n'
    done <<< "$commits"

    if (( total > MAX_COMMITS )); then
        formatted+="*… +$(( total - MAX_COMMITS ))건 더*"$'\n'
    fi

    echo "$formatted"
}

# --- diff 규모 요약 (insertions/deletions) ---
diff_stat_summary() {
    local last_sha="$1"
    local stat
    stat=$(git -C "$BOT_HOME" diff --shortstat "$last_sha..HEAD" 2>/dev/null || echo "")

    if [[ -z "$stat" ]]; then
        echo ""
        return
    fi

    local files insertions deletions
    files=$(echo "$stat" | grep -oE '[0-9]+ file' | grep -oE '[0-9]+' || echo "0")
    insertions=$(echo "$stat" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
    deletions=$(echo "$stat" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

    echo "📊 +${insertions} −${deletions} (${files}개 파일)"
}

# --- 변경된 설정 파일 감지 ---
detect_config_changes() {
    local last_sha="$1"
    local changed_configs=""

    for cfg in "${WATCHED_CONFIGS[@]}"; do
        if git -C "$BOT_HOME" diff --quiet "$last_sha..HEAD" -- "$cfg" 2>/dev/null; then
            continue
        fi
        if [[ -n "$changed_configs" ]]; then
            changed_configs+=", "
        fi
        changed_configs+="\`$cfg\`"
    done

    echo "$changed_configs"
}

# --- 변경된 파일 요약 ---
summarize_changed_files() {
    local last_sha="$1"
    local files
    files=$(git -C "$BOT_HOME" diff --name-only "$last_sha..HEAD" 2>/dev/null || echo "")

    if [[ -z "$files" ]]; then
        echo ""
        return
    fi

    local summary=""

    # 루트 파일은 이름을 직접 나열
    local root_files
    root_files=$(echo "$files" | grep -v '/' || true)
    if [[ -n "$root_files" ]]; then
        while IFS= read -r f; do
            summary+="\`${f}\`"$'\n'
        done <<< "$root_files"
    fi

    # 하위 디렉토리는 그룹핑
    local dirs
    dirs=$(echo "$files" | awk -F/ 'NF>1{print $1}' | sort | uniq -c | sort -rn | head -5)
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        local count dir
        count=$(echo "$line" | awk '{print $1}')
        dir=$(echo "$line" | awk '{print $2}')
        summary+="\`${dir}/\` — ${count}개 파일"$'\n'
    done <<< "$dirs"

    # trailing newline 제거
    summary="${summary%$'\n'}"
    echo "$summary"
}

# ============================================================================
# Main
# ============================================================================
log "업데이트 브로드캐스트 체크 시작"

# Git 저장소 확인
if [[ ! -d "$BOT_HOME/.git" ]]; then
    log "ERROR: $BOT_HOME 은(는) git 저장소가 아닙니다"
    exit 0
fi

current_sha=$(git -C "$BOT_HOME" rev-parse HEAD 2>/dev/null || true)
if [[ -z "$current_sha" ]]; then
    log "ERROR: git rev-parse HEAD 실패"
    exit 0
fi

# 첫 실행: 상태 파일 초기화 후 종료 (히스토리 폭탄 방지)
if [[ ! -f "$STATE_FILE" ]]; then
    echo "$current_sha" > "$STATE_FILE"
    log "첫 실행 — 상태 파일 초기화: ${current_sha:0:8}"
    exit 0
fi

last_sha=$(cat "$STATE_FILE" 2>/dev/null || echo "")
if [[ -z "$last_sha" ]]; then
    echo "$current_sha" > "$STATE_FILE"
    log "상태 파일 비어있음 — 초기화: ${current_sha:0:8}"
    exit 0
fi

# 변경 없음
if [[ "$current_sha" == "$last_sha" ]]; then
    log "변경 없음 (SHA: ${current_sha:0:8})"
    exit 0
fi

# SHA가 히스토리에 없는 경우 (force push / rebase)
if ! git -C "$BOT_HOME" cat-file -t "$last_sha" &>/dev/null; then
    log "WARN: 이전 SHA($last_sha) 히스토리에 없음 — 리셋"
    send_embed \
        "⚠️ Jarvis 히스토리 리셋 감지" \
        "Git 히스토리가 변경되었습니다 (force push 또는 rebase)."$'\n'"현재 HEAD: \`${current_sha:0:8}\`" \
        "16776960"
    echo "$current_sha" > "$STATE_FILE"
    exit 0
fi

# --- 변경 감지! ---
log "변경 감지: ${last_sha:0:8} → ${current_sha:0:8}"

commit_list=$(format_commits "$last_sha")
config_changes=$(detect_config_changes "$last_sha")
diff_stat=$(diff_stat_summary "$last_sha")

# 커밋 수
commit_count=$(git -C "$BOT_HOME" rev-list --count "$last_sha..HEAD" 2>/dev/null || echo "0")

# 브랜치 이름
branch=$(git -C "$BOT_HOME" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# GitHub 비교 링크
compare_url="${GITHUB_REPO_URL}/compare/${last_sha:0:8}...${current_sha:0:8}"

# description: 변경 요약 + diff 규모 + GitHub 링크
description="${commit_list}"
if [[ -n "$diff_stat" ]]; then
    description+=$'\n'"${diff_stat}"
fi
description+=$'\n'"[전체 변경 보기](${compare_url})"

# --- 설정 변경 여부에 따라 색상/제목 분기 ---
if [[ -n "$config_changes" ]]; then
    title="⚙️ Jarvis 설정 변경 (${commit_count}건, ${branch})"
    color=16776960  # 노랑 (주의)

    fields=$(jq -n \
        --arg configs "$config_changes" \
        '[
            {"name":"📋 변경된 설정","value":$configs,"inline":false}
        ]')
else
    title="🔄 Jarvis 업데이트 (${commit_count}건, ${branch})"
    color=3447003  # 파랑 (일반)
    fields=""
fi

# --- 전송 ---
if send_embed "$title" "$description" "$color" "$fields"; then
    # 성공 시에만 상태 갱신 (실패 시 다음 실행에서 재시도)
    echo "$current_sha" > "$STATE_FILE"
    log "브로드캐스트 완료 (${commit_count}개 커밋)"
else
    log "브로드캐스트 실패 — 다음 실행에서 재시도"
fi

log "업데이트 브로드캐스트 체크 완료"
