#!/usr/bin/env bash
# board-reaction.sh — Human-in-the-loop Board Approval helper library
# Source this file; do not execute directly.
#
# Required env vars (set before sourcing or in ~/.jarvis/.env):
#   BOARD_URL      — Board API base URL (default: https://jarvis-board-production.up.railway.app)
#   AGENT_API_KEY  — Agent auth key for x-agent-key header
#
# Public functions:
#   board_get_pending_reactions  "author_name"
#   board_format_reaction_context "$json_array"
#   board_mark_reactions_processed "$json_array"

set -euo pipefail

BOARD_URL="${BOARD_URL:-https://jarvis-board-production.up.railway.app}"

# ---------------------------------------------------------------------------
# _board_json_parse_ids  — extract .id fields from JSON array (jq / node fallback)
# Usage: _board_json_parse_ids "$json"   → newline-separated IDs on stdout
# ---------------------------------------------------------------------------
_board_json_parse_ids() {
    local json="$1"
    if command -v jq >/dev/null 2>&1; then
        echo "$json" | jq -r '.[].id // empty'
    elif command -v node >/dev/null 2>&1; then
        echo "$json" | node -e \
            "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); d.forEach(p=>console.log(p.id||''));"
    else
        # grep/python3 last resort
        python3 -c "
import json, sys
data = json.load(sys.stdin)
for p in data:
    print(p.get('id',''))
" <<< "$json"
    fi
}

# ---------------------------------------------------------------------------
# board_get_pending_reactions  "author_name"
# Returns JSON array of posts with pending owner reactions, or "[]" on failure.
# ---------------------------------------------------------------------------
board_get_pending_reactions() {
    local author="${1:?board_get_pending_reactions requires author argument}"

    if [[ -z "${AGENT_API_KEY:-}" ]]; then
        echo "[]"
        return 0
    fi

    local url="${BOARD_URL}/api/posts?agent_pending=true&author=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$author" 2>/dev/null || echo "$author")"
    local response
    response=$(curl -sf --max-time 10 \
        -H "x-agent-key: ${AGENT_API_KEY}" \
        "$url" 2>/dev/null) || response=""

    if [[ -z "$response" ]]; then
        echo "[]"
        return 0
    fi

    # Validate that response looks like a JSON array
    local is_array
    if command -v jq >/dev/null 2>&1; then
        is_array=$(echo "$response" | jq -e 'if type == "array" then true else false end' 2>/dev/null) || is_array="false"
    else
        # crude check: starts with '['
        is_array="false"
        if [[ "$response" == \[* ]]; then is_array="true"; fi
    fi

    if [[ "$is_array" != "true" ]]; then
        echo "[]"
        return 0
    fi

    echo "$response"
}

# ---------------------------------------------------------------------------
# board_format_reaction_context  "$json_array"
# Formats pending reactions into a markdown section for prompt injection.
# ---------------------------------------------------------------------------
board_format_reaction_context() {
    local json="${1:-[]}"

    if [[ "$json" == "[]" || -z "$json" ]]; then
        echo ""
        return 0
    fi

    local output
    if command -v jq >/dev/null 2>&1; then
        output=$(echo "$json" | jq -r '
            .[] |
            if .owner_reaction == "approved" then
                "- ✅ 승인: \"\(.title // .id)\" (post_id: \(.id)) - 실행하세요"
            elif .owner_reaction == "rejected" then
                "- ❌ 반려: \"\(.title // .id)\" (post_id: \(.id)) - 사유: \"\(.owner_reaction_reason // "없음")\" - 재검토하세요"
            else
                empty
            end
        ')
    elif command -v node >/dev/null 2>&1; then
        output=$(echo "$json" | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
d.forEach(p=>{
  const t=p.title||p.id;
  if(p.owner_reaction==='approved')
    console.log('- ✅ 승인: \"'+t+'\" (post_id: '+p.id+') - 실행하세요');
  else if(p.owner_reaction==='rejected'){
    const r=p.owner_reaction_reason||'없음';
    console.log('- ❌ 반려: \"'+t+'\" (post_id: '+p.id+') - 사유: \"'+r+'\" - 재검토하세요');
  }
});
")
    else
        output=$(python3 -c "
import json, sys
data = json.load(sys.stdin)
lines = []
for p in data:
    t = p.get('title') or p.get('id','')
    pid = p.get('id','')
    rxn = p.get('owner_reaction','')
    if rxn == 'approved':
        lines.append('- \u2705 \uc2b9\uc778: \"'+t+'\" (post_id: '+pid+') - \uc2e4\ud589\ud558\uc138\uc694')
    elif rxn == 'rejected':
        r = p.get('owner_reaction_reason') or '\uc5c6\uc74c'
        lines.append('- \u274c \ubc18\ub824: \"'+t+'\" (post_id: '+pid+') - \uc0ac\uc720: \"'+r+'\" - \uc7ac\uac80\ud1a0\ud558\uc138\uc694')
print('\n'.join(lines))
" <<< "$json")
    fi

    if [[ -z "$output" ]]; then
        echo ""
        return 0
    fi

    printf '## 대표님 승인/반려 알림\n%s\n' "$output"
}

# ---------------------------------------------------------------------------
# board_mark_reactions_processed  "$json_array"
# Marks all posts in the array as owner_reaction_processed=true.
# Failures are non-fatal (|| true).
# ---------------------------------------------------------------------------
board_mark_reactions_processed() {
    local json="${1:-[]}"

    if [[ "$json" == "[]" || -z "$json" ]]; then
        return 0
    fi

    if [[ -z "${AGENT_API_KEY:-}" ]]; then
        return 0
    fi

    local ids
    ids=$(_board_json_parse_ids "$json") || ids=""

    if [[ -z "$ids" ]]; then
        return 0
    fi

    while IFS= read -r post_id; do
        if [[ -z "$post_id" ]]; then continue; fi
        curl -sf --max-time 10 \
            -X PATCH \
            -H "x-agent-key: ${AGENT_API_KEY}" \
            -H "Content-Type: application/json" \
            -d '{"owner_reaction_processed":true}' \
            "${BOARD_URL}/api/posts/${post_id}" \
            >/dev/null 2>&1 || true
    done <<< "$ids"
}
