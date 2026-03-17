#!/usr/bin/env bash
BOT_HOME="${BOT_HOME:-$HOME/.jarvis}"
END_DATE="2026-03-21"
TODAY=$(TZ=Asia/Seoul date +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
[[ "$TODAY" > "$END_DATE" ]] && exit 0
WEBHOOK="https://discord.com/api/webhooks/1482899334940069953/luZX4DSYDvXvcZlIoyUEwyzqCXhdgoWSslHHM0LEmH_VW2JKHUT8Sjw_U9YQ8hAjcchr"
curl -sS -X POST "$WEBHOOK" -H "Content-Type: application/json" \
  -d '{"content": "\ud83c\udf24\ufe0f \ubcf4\ub78c\ub2d8, \uc810\uc2ec \uc57d \ub4dc\uc2e4 \uc2dc\uac04\uc774\uc5d0\uc694! \ud83d\udc8a\ud83d\udc95"}' -o /dev/null
echo "[$(TZ=Asia/Seoul date '+%F %T')] boram-meds: noon sent" >> "$BOT_HOME/logs/cron.log"
