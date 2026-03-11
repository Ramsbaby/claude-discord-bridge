#!/usr/bin/env bash
set -euo pipefail

# preply-today.sh — Preply Cloud Run API에서 수입 요약 JSON 조회
# 사용법: preply-today.sh [YYYY-MM-DD]
#   날짜 생략 시 오늘 기준 조회
# Jarvis Discord bot (boram 채널)에서 호출

BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Load Preply API config
PREPLY_ENV="$BOT_HOME/config/preply.env"
if [[ -f "$PREPLY_ENV" ]]; then
    # shellcheck source=/dev/null
    source "$PREPLY_ENV"
fi

PREPLY_API_URL="${PREPLY_API_URL:-}"

if [[ -z "$PREPLY_API_URL" ]]; then
    echo '{"error":"PREPLY_API_URL not configured. Set it in ~/.jarvis/config/preply.env"}'
    exit 1
fi

# 날짜 파라미터 처리 ($1이 있으면 ?date= 쿼리 추가)
DATE_PARAM="${1:-}"
if [[ -n "$DATE_PARAM" ]]; then
    API_ENDPOINT="$PREPLY_API_URL/api/today?date=$DATE_PARAM"
else
    API_ENDPOINT="$PREPLY_API_URL/api/today"
fi

# Cloud Run auth: gcloud identity token
AUTH_ARGS=(-H "Accept: application/json")
if command -v gcloud &>/dev/null; then
    TOKEN=$(gcloud auth print-identity-token 2>/dev/null || true)
    if [[ -n "$TOKEN" ]]; then
        AUTH_ARGS+=(-H "Authorization: Bearer $TOKEN")
    fi
fi

curl -sf "${AUTH_ARGS[@]}" "$API_ENDPOINT" 2>/dev/null \
    || echo '{"error":"Preply API call failed"}'
