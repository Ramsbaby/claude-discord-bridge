#!/usr/bin/env bash
# claude-switch.sh — Claude 계정 프로필 전환
# /account 슬래시 커맨드에서 호출됨
#
# 사용법:
#   claude-switch.sh status          현재 계정 + 프로필 목록
#   claude-switch.sh use <name>      저장된 프로필로 전환
#   claude-switch.sh save <name>     현재 계정을 프로필로 저장
#   claude-switch.sh refresh         현재 credentials 토큰 만료시간 확인

set -euo pipefail

CREDENTIALS="$HOME/.claude/.credentials.json"
PROFILES_DIR="$HOME/.claude/profiles"

# ── 유틸 ──────────────────────────────────────────────────────────────────────

account_info() {
    local cred_file="$1"
    if [[ ! -f "$cred_file" ]]; then
        echo "(없음)"
        return
    fi
    python3 -c "
import json, datetime, sys
try:
    d = json.load(open('$cred_file'))
    for k, v in d.items():
        if isinstance(v, dict) and 'accessToken' in v:
            exp = v.get('expiresAt', 0)
            if exp:
                exp_dt = datetime.datetime.fromtimestamp(exp/1000)
                remaining = exp_dt - datetime.datetime.now()
                hrs = int(remaining.total_seconds() // 3600)
                mins = int((remaining.total_seconds() % 3600) // 60)
                exp_str = exp_dt.strftime('%m/%d %H:%M') + f' (잔여 {hrs}h {mins}m)' if remaining.total_seconds() > 0 else exp_dt.strftime('%m/%d %H:%M') + ' ⚠️ 만료'
            else:
                exp_str = '?'
            tier = v.get('rateLimitTier', '?')
            sub = v.get('subscriptionType', '?')
            print(f'{sub} / {tier} / 만료: {exp_str}')
            sys.exit(0)
    print('(인증 정보 없음)')
except Exception as e:
    print(f'(파싱 오류: {e})')
" 2>/dev/null || echo "(파싱 실패)"
}

# ── status ────────────────────────────────────────────────────────────────────

cmd_status() {
    echo "=== 현재 활성 계정 ==="
    echo "  $(account_info "$CREDENTIALS")"
    echo ""
    echo "=== 저장된 프로필 ==="
    if [[ ! -d "$PROFILES_DIR" ]] || [[ -z "$(ls -A "$PROFILES_DIR" 2>/dev/null)" ]]; then
        echo "  (없음) — 'save <이름>'으로 저장하세요"
        return
    fi
    for profile_dir in "$PROFILES_DIR"/*/; do
        local name
        name=$(basename "$profile_dir")
        local cred="$profile_dir/credentials.json"
        local info
        info=$(account_info "$cred")
        # 현재 활성 계정과 같은지 확인
        local marker=""
        if [[ -f "$CREDENTIALS" && -f "$cred" ]]; then
            local cur_token profile_token
            cur_token=$(python3 -c "import json; d=json.load(open('$CREDENTIALS')); [print(list(v.keys())[0] if isinstance(v,dict) else '') for v in d.values()]" 2>/dev/null | head -1 || echo "")
            profile_token=$(python3 -c "import json; d=json.load(open('$cred')); [print(list(v.keys())[0] if isinstance(v,dict) else '') for v in d.values()]" 2>/dev/null | head -1 || echo "")
            # accessToken 앞 20자로 비교
            cur_at=$(python3 -c "import json; d=json.load(open('$CREDENTIALS')); [print(v.get('accessToken','')[:20]) for v in d.values() if isinstance(v,dict) and 'accessToken' in v]" 2>/dev/null | head -1 || echo "x")
            profile_at=$(python3 -c "import json; d=json.load(open('$cred')); [print(v.get('accessToken','')[:20]) for v in d.values() if isinstance(v,dict) and 'accessToken' in v]" 2>/dev/null | head -1 || echo "y")
            if [[ "$cur_at" == "$profile_at" ]]; then
                marker=" ◀ 현재"
            fi
        fi
        echo "  [$name]$marker  $info"
    done
    echo ""
    echo "전환: /account use <이름>   저장: /account save <이름>"
}

# ── save ──────────────────────────────────────────────────────────────────────

cmd_save() {
    local name="${1:-}"
    if [[ -z "$name" ]]; then
        echo "오류: 프로필 이름을 지정하세요. 예: /account save personal"
        exit 1
    fi
    if [[ ! -f "$CREDENTIALS" ]]; then
        echo "오류: 현재 로그인된 계정이 없습니다. 먼저 claude login을 실행하세요."
        exit 1
    fi
    local profile_dir="$PROFILES_DIR/$name"
    mkdir -p "$profile_dir"
    cp "$CREDENTIALS" "$profile_dir/credentials.json"
    echo "✅ 현재 계정을 [$name] 프로필로 저장했습니다."
    echo "   $(account_info "$profile_dir/credentials.json")"
}

# ── use ───────────────────────────────────────────────────────────────────────

cmd_use() {
    local name="${1:-}"
    if [[ -z "$name" ]]; then
        echo "오류: 프로필 이름을 지정하세요. 예: /account use personal"
        exit 1
    fi
    local profile_cred="$PROFILES_DIR/$name/credentials.json"
    if [[ ! -f "$profile_cred" ]]; then
        echo "오류: [$name] 프로필이 없습니다."
        echo ""
        cmd_status
        exit 1
    fi

    # 만료 여부 경고
    local is_expired
    is_expired=$(python3 -c "
import json, datetime
d = json.load(open('$profile_cred'))
for v in d.values():
    if isinstance(v, dict) and 'accessToken' in v:
        exp = v.get('expiresAt', 0)
        if exp and datetime.datetime.fromtimestamp(exp/1000) < datetime.datetime.now():
            print('expired')
        else:
            print('ok')
" 2>/dev/null || echo "unknown")

    if [[ "$is_expired" == "expired" ]]; then
        echo "⚠️  [$name] 프로필의 토큰이 만료됐습니다."
        echo "   해당 계정으로 claude login 후 /account save $name 으로 갱신하세요."
        exit 1
    fi

    # 기존 credentials 백업
    if [[ -f "$CREDENTIALS" ]]; then
        cp "$CREDENTIALS" "${CREDENTIALS}.bak"
    fi

    cp "$profile_cred" "$CREDENTIALS"
    echo "✅ [$name] 계정으로 전환했습니다."
    echo "   $(account_info "$CREDENTIALS")"
    echo ""
    echo "ℹ️  Jarvis 크론/봇은 다음 claude -p 호출부터 자동으로 새 계정을 사용합니다."
}

# ── refresh ───────────────────────────────────────────────────────────────────

cmd_refresh() {
    echo "=== 현재 계정 상태 ==="
    account_info "$CREDENTIALS"
}

# ── main ──────────────────────────────────────────────────────────────────────

CMD="${1:-status}"
shift 2>/dev/null || true

case "$CMD" in
    status)  cmd_status ;;
    save)    cmd_save "${1:-}" ;;
    use)     cmd_use "${1:-}" ;;
    refresh) cmd_refresh ;;
    *)
        echo "사용법: claude-switch.sh [status|save <name>|use <name>|refresh]"
        exit 1
        ;;
esac
