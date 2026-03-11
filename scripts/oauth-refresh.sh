#!/usr/bin/env bash
# oauth-refresh.sh — Claude Code OAuth 토큰 자동 갱신
#
# 역할: credentials.json의 refreshToken으로 새 accessToken을 발급받아
#       credentials.json을 갱신하고, 만료 임박 시 봇을 재시작.
#
# 호출: cron 30분마다 or watchdog 루프에서
# 종료 코드: 0=정상(갱신 or 여유있음), 1=갱신실패

set -euo pipefail

CREDENTIALS_FILE="${HOME}/.claude/.credentials.json"
TOKEN_URL="https://platform.claude.com/v1/oauth/token"
CLIENT_ID="9d1c250a-e61b-44d9-88ed-5944d1962f5e"
BOT_HOME="${BOT_HOME:-${HOME}/.jarvis}"
LOG="${BOT_HOME}/logs/oauth-refresh.log"
RENEW_THRESHOLD_SECS=3600  # 만료 1시간 전부터 갱신

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [oauth-refresh] $*" | tee -a "${LOG}"; }

# credentials.json 존재 확인
if [[ ! -f "${CREDENTIALS_FILE}" ]]; then
  log "ERROR: ${CREDENTIALS_FILE} 없음 — 로그인 필요"
  exit 1
fi

# 현재 토큰 정보 파싱
REFRESH_TOKEN=$(node -e "
  const d = JSON.parse(require('fs').readFileSync('${CREDENTIALS_FILE}', 'utf-8'));
  process.stdout.write(d.claudeAiOauth?.refreshToken || '');
" 2>/dev/null)

EXPIRES_AT=$(node -e "
  const d = JSON.parse(require('fs').readFileSync('${CREDENTIALS_FILE}', 'utf-8'));
  process.stdout.write(String(d.claudeAiOauth?.expiresAt || 0));
" 2>/dev/null)

if [[ -z "${REFRESH_TOKEN}" ]]; then
  log "ERROR: refreshToken 없음 — OAuth 재인증 필요"
  exit 1
fi

# 만료까지 남은 시간 계산
NOW_MS=$(node -e "process.stdout.write(String(Date.now()))")
EXPIRES_AT_MS="${EXPIRES_AT}"
REMAINING_SECS=$(( (EXPIRES_AT_MS - NOW_MS) / 1000 ))

log "토큰 만료까지 ${REMAINING_SECS}초 남음 (임계값: ${RENEW_THRESHOLD_SECS}초)"

if (( REMAINING_SECS > RENEW_THRESHOLD_SECS )); then
  log "갱신 불필요 — 여유 있음"
  exit 0
fi

log "갱신 시작 (만료 ${REMAINING_SECS}초 전)"

# OAuth refresh_token grant 요청
RESPONSE=$(curl -s -X POST "${TOKEN_URL}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "anthropic-version: 2023-06-01" \
  --data-urlencode "grant_type=refresh_token" \
  --data-urlencode "refresh_token=${REFRESH_TOKEN}" \
  --data-urlencode "client_id=${CLIENT_ID}" \
  --max-time 15 2>/dev/null)

# 응답 파싱
ACCESS_TOKEN=$(echo "${RESPONSE}" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  process.stdout.write(d.access_token || '');
" 2>/dev/null)

NEW_REFRESH_TOKEN=$(echo "${RESPONSE}" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  process.stdout.write(d.refresh_token || '');
" 2>/dev/null)

EXPIRES_IN=$(echo "${RESPONSE}" | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8'));
  process.stdout.write(String(d.expires_in || 0));
" 2>/dev/null)

if [[ -z "${ACCESS_TOKEN}" ]]; then
  log "ERROR: 갱신 실패 — 응답: ${RESPONSE:0:200}"
  exit 1
fi

# credentials.json 원자적 업데이트
NEW_EXPIRES_AT=$(node -e "process.stdout.write(String(Date.now() + ${EXPIRES_IN} * 1000))")
FINAL_REFRESH="${NEW_REFRESH_TOKEN:-${REFRESH_TOKEN}}"  # 새 refresh_token이 없으면 기존 유지

node --input-type=module << JSEOF
import { readFileSync, writeFileSync } from 'fs';
const path = '${CREDENTIALS_FILE}';
const d = JSON.parse(readFileSync(path, 'utf-8'));
d.claudeAiOauth.accessToken = '${ACCESS_TOKEN}';
d.claudeAiOauth.refreshToken = '${FINAL_REFRESH}';
d.claudeAiOauth.expiresAt = ${NEW_EXPIRES_AT};
const tmp = path + '.tmp.' + process.pid;
writeFileSync(tmp, JSON.stringify(d, null, 2));
import { renameSync } from 'fs';
renameSync(tmp, path);
JSEOF

log "✅ 갱신 완료 — 새 만료: $(node -e "process.stdout.write(new Date(${NEW_EXPIRES_AT}).toISOString())")"

# 봇이 구 토큰을 쓰고 있었다면 재시작
if launchctl list ai.jarvis.discord-bot &>/dev/null; then
  log "봇 재시작 (새 토큰 반영)"
  launchctl kickstart -k "gui/$(id -u)/ai.jarvis.discord-bot" &>/dev/null || true
fi

exit 0
