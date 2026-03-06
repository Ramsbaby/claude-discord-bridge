#!/usr/bin/env bash
# llm-gateway.sh — Multi-provider LLM call with automatic fallback
#
# Usage (sourced):
#   source "$BOT_HOME/lib/llm-gateway.sh"
#   llm_call --prompt "..." --system "..." --timeout 180 \
#            --model "..." --output "/tmp/out.json" \
#            [--allowed-tools "Read,Bash"] [--max-budget "1.00"] \
#            [--work-dir "/tmp/work"] [--mcp-config "path"]
#
# Provider chain (tried in order):
#   1. claude -p       (Claude Max, $0, supports tools)
#   2. Anthropic API   (if ANTHROPIC_API_KEY set, text-only)
#   3. OpenAI API      (if OPENAI_API_KEY set, text-only)
#   4. Ollama          (if ollama running, text-only)
#
# Output: JSON compatible with claude -p --output-format json
#   { "result": "...", "cost_usd": 0, "usage": {"input_tokens": 0, "output_tokens": 0} }
#
# ADR-006: LLM Gateway Multi-Provider

LLM_GATEWAY_VERSION="1.0.0"
LLM_GATEWAY_BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Load API keys from .env if available
if [[ -f "${LLM_GATEWAY_BOT_HOME}/discord/.env" ]]; then
    while IFS='=' read -r key val; do
        key=$(echo "$key" | xargs)
        [[ -z "$key" || "$key" == \#* ]] && continue
        val=$(echo "$val" | sed "s/^[\"']//;s/[\"']$//")
        case "$key" in
            ANTHROPIC_API_KEY) export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-$val}" ;;
            OPENAI_API_KEY)    export OPENAI_API_KEY="${OPENAI_API_KEY:-$val}" ;;
        esac
    done < "${LLM_GATEWAY_BOT_HOME}/discord/.env"
fi

# --- Provider: claude -p ---
_llm_claude_cli() {
    local prompt="$1" system="$2" timeout="$3" model="$4" output="$5"
    local allowed_tools="$6" max_budget="$7" work_dir="$8" mcp_config="$9"

    command -v claude >/dev/null 2>&1 || return 1

    local cmd=(gtimeout "$timeout" claude -p "$prompt"
        --output-format json
        --permission-mode bypassPermissions
        --strict-mcp-config
        --mcp-config "${mcp_config:-${LLM_GATEWAY_BOT_HOME}/config/empty-mcp.json}"
        --setting-sources local
    )

    [[ -n "$system" ]]        && cmd+=(--append-system-prompt "$system")
    [[ -n "$allowed_tools" ]] && cmd+=(--allowedTools "$allowed_tools")
    [[ -n "$max_budget" ]]    && cmd+=(--max-budget-usd "$max_budget")
    [[ -n "$model" ]]         && cmd+=(--model "$model")
    [[ -n "$work_dir" ]]      && cmd+=(--plugin-dir "${work_dir}/.empty-plugins")

    local stderr_tmp
    stderr_tmp=$(mktemp)
    "${cmd[@]}" > "$output" 2>"$stderr_tmp"
    local exit_code=$?
    rm -f "$stderr_tmp"
    return $exit_code
}

# --- Provider: Anthropic API ---
_llm_anthropic_api() {
    local prompt="$1" system="$2" timeout="$3" model="$4" output="$5"

    [[ -z "${ANTHROPIC_API_KEY:-}" ]] && return 1

    # Map model names to API model IDs
    local api_model="claude-sonnet-4-20250514"
    case "${model:-}" in
        *opus*)   api_model="claude-opus-4-20250514" ;;
        *haiku*)  api_model="claude-haiku-4-5-20251001" ;;
        *sonnet*) api_model="claude-sonnet-4-20250514" ;;
    esac

    local messages
    messages=$(python3 -c "
import json, sys
msgs = [{'role': 'user', 'content': sys.argv[1]}]
print(json.dumps(msgs))
" "$prompt" 2>/dev/null) || return 1

    local body
    if [[ -n "$system" ]]; then
        body=$(python3 -c "
import json, sys
body = {
    'model': sys.argv[1],
    'max_tokens': 4096,
    'system': sys.argv[2],
    'messages': json.loads(sys.argv[3])
}
print(json.dumps(body))
" "$api_model" "$system" "$messages" 2>/dev/null) || return 1
    else
        body=$(python3 -c "
import json, sys
body = {
    'model': sys.argv[1],
    'max_tokens': 4096,
    'messages': json.loads(sys.argv[2])
}
print(json.dumps(body))
" "$api_model" "$messages" 2>/dev/null) || return 1
    fi

    local response
    response=$(curl -s --max-time "$timeout" \
        -H "x-api-key: ${ANTHROPIC_API_KEY}" \
        -H "anthropic-version: 2023-06-01" \
        -H "content-type: application/json" \
        -d "$body" \
        "https://api.anthropic.com/v1/messages" 2>/dev/null) || return 1

    # Validate response
    local content_type
    content_type=$(echo "$response" | python3 -c "
import json, sys
r = json.load(sys.stdin)
if r.get('type') == 'error':
    sys.exit(1)
print(r.get('type', ''))
" 2>/dev/null) || return 1

    # Convert to claude -p compatible JSON format
    python3 -c "
import json, sys
r = json.loads(sys.argv[1])
text_parts = [b['text'] for b in r.get('content', []) if b.get('type') == 'text']
result = '\n'.join(text_parts)
usage = r.get('usage', {})
out = {
    'result': result,
    'cost_usd': 0,
    'usage': {
        'input_tokens': usage.get('input_tokens', 0),
        'output_tokens': usage.get('output_tokens', 0)
    },
    'subtype': 'anthropic_api_fallback',
    'is_error': False
}
print(json.dumps(out))
" "$response" > "$output" 2>/dev/null || return 1

    # Verify non-empty result
    local result_text
    result_text=$(jq -r '.result // ""' "$output" 2>/dev/null)
    [[ -z "$result_text" ]] && return 1
    return 0
}

# --- Provider: OpenAI API ---
_llm_openai_api() {
    local prompt="$1" system="$2" timeout="$3" model="$4" output="$5"

    [[ -z "${OPENAI_API_KEY:-}" ]] && return 1

    local api_model="gpt-4o"
    case "${model:-}" in
        *haiku*|*fast*) api_model="gpt-4o-mini" ;;
    esac

    local body
    body=$(python3 -c "
import json, sys
messages = []
if sys.argv[2]:
    messages.append({'role': 'system', 'content': sys.argv[2]})
messages.append({'role': 'user', 'content': sys.argv[1]})
body = {
    'model': sys.argv[3],
    'max_tokens': 4096,
    'messages': messages
}
print(json.dumps(body))
" "$prompt" "${system:-}" "$api_model" 2>/dev/null) || return 1

    local response
    response=$(curl -s --max-time "$timeout" \
        -H "Authorization: Bearer ${OPENAI_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$body" \
        "https://api.openai.com/v1/chat/completions" 2>/dev/null) || return 1

    # Convert to claude -p compatible JSON format
    python3 -c "
import json, sys
r = json.loads(sys.argv[1])
if 'error' in r:
    sys.exit(1)
choices = r.get('choices', [])
if not choices:
    sys.exit(1)
result = choices[0].get('message', {}).get('content', '')
usage = r.get('usage', {})
out = {
    'result': result,
    'cost_usd': 0,
    'usage': {
        'input_tokens': usage.get('prompt_tokens', 0),
        'output_tokens': usage.get('completion_tokens', 0)
    },
    'subtype': 'openai_api_fallback',
    'is_error': False
}
print(json.dumps(out))
" "$response" > "$output" 2>/dev/null || return 1

    local result_text
    result_text=$(jq -r '.result // ""' "$output" 2>/dev/null)
    [[ -z "$result_text" ]] && return 1
    return 0
}

# --- Provider: Ollama ---
_llm_ollama() {
    local prompt="$1" system="$2" timeout="$3" model="$4" output="$5"

    # Check if ollama is running
    curl -s --max-time 2 "http://localhost:11434/api/tags" >/dev/null 2>&1 || return 1

    local ollama_model="llama3.2:latest"

    local body
    body=$(python3 -c "
import json, sys
body = {
    'model': sys.argv[1],
    'prompt': sys.argv[2],
    'stream': False
}
if sys.argv[3]:
    body['system'] = sys.argv[3]
print(json.dumps(body))
" "$ollama_model" "$prompt" "${system:-}" 2>/dev/null) || return 1

    local response
    response=$(curl -s --max-time "$timeout" \
        -H "Content-Type: application/json" \
        -d "$body" \
        "http://localhost:11434/api/generate" 2>/dev/null) || return 1

    # Convert to claude -p compatible JSON format
    python3 -c "
import json, sys
r = json.loads(sys.argv[1])
result = r.get('response', '')
if not result:
    sys.exit(1)
out = {
    'result': result,
    'cost_usd': 0,
    'usage': {
        'input_tokens': r.get('prompt_eval_count', 0),
        'output_tokens': r.get('eval_count', 0)
    },
    'subtype': 'ollama_fallback',
    'is_error': False
}
print(json.dumps(out))
" "$response" > "$output" 2>/dev/null || return 1

    local result_text
    result_text=$(jq -r '.result // ""' "$output" 2>/dev/null)
    [[ -z "$result_text" ]] && return 1
    return 0
}

# --- Main entry point ---
# llm_call --prompt "..." --system "..." --timeout 180 --model "..." --output "/tmp/out.json" \
#          [--allowed-tools "Read,Bash"] [--max-budget "1.00"] [--work-dir "/tmp"] [--mcp-config "path"]
llm_call() {
    local prompt="" system="" timeout="180" model="" output=""
    local allowed_tools="" max_budget="" work_dir="" mcp_config=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --prompt)        prompt="$2";        shift 2 ;;
            --system)        system="$2";        shift 2 ;;
            --timeout)       timeout="$2";       shift 2 ;;
            --model)         model="$2";         shift 2 ;;
            --output)        output="$2";        shift 2 ;;
            --allowed-tools) allowed_tools="$2"; shift 2 ;;
            --max-budget)    max_budget="$2";    shift 2 ;;
            --work-dir)      work_dir="$2";      shift 2 ;;
            --mcp-config)    mcp_config="$2";    shift 2 ;;
            *) shift ;;
        esac
    done

    if [[ -z "$prompt" || -z "$output" ]]; then
        echo "ERROR: llm_call requires --prompt and --output" >&2
        return 2
    fi

    # Determine if task requires tool use (non-text-only)
    local needs_tools=false
    if [[ -n "$allowed_tools" && "$allowed_tools" != "Read" ]]; then
        needs_tools=true
    fi

    local log_prefix="[llm-gateway]"

    # --- Provider chain ---

    # 1. claude -p (primary — supports tools, $0 cost)
    if _llm_claude_cli "$prompt" "$system" "$timeout" "$model" "$output" \
                       "$allowed_tools" "$max_budget" "$work_dir" "$mcp_config"; then
        return 0
    fi
    local claude_exit=$?
    echo "${log_prefix} claude -p failed (exit $claude_exit)" >&2

    # If task needs tools, no fallback is possible
    if [[ "$needs_tools" == "true" ]]; then
        echo "${log_prefix} Task requires tools ($allowed_tools) — no fallback available" >&2
        return $claude_exit
    fi

    echo "${log_prefix} Trying fallback providers (text-only mode)..." >&2

    # 2. Anthropic API
    if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
        echo "${log_prefix} Trying Anthropic API..." >&2
        if _llm_anthropic_api "$prompt" "$system" "$timeout" "$model" "$output"; then
            echo "${log_prefix} Anthropic API succeeded (fallback)" >&2
            return 0
        fi
        echo "${log_prefix} Anthropic API failed" >&2
    fi

    # 3. OpenAI API
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then
        echo "${log_prefix} Trying OpenAI API..." >&2
        if _llm_openai_api "$prompt" "$system" "$timeout" "$model" "$output"; then
            echo "${log_prefix} OpenAI API succeeded (fallback)" >&2
            return 0
        fi
        echo "${log_prefix} OpenAI API failed" >&2
    fi

    # 4. Ollama (local)
    echo "${log_prefix} Trying Ollama (local)..." >&2
    if _llm_ollama "$prompt" "$system" "$timeout" "$model" "$output"; then
        echo "${log_prefix} Ollama succeeded (fallback)" >&2
        return 0
    fi
    echo "${log_prefix} Ollama failed" >&2

    # All providers exhausted
    echo "${log_prefix} All providers failed" >&2
    return 1
}
