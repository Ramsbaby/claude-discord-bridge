#!/usr/bin/env bash
set -euo pipefail

# vault-lifecycle.sh — Vault 문서 생명주기 관리
# Usage: vault-lifecycle.sh (매주 일요일 새벽 실행)

VAULT="$HOME/Jarvis-Vault"
LOG_TAG="vault-lifecycle"
ARCHIVE_DIR="$VAULT/99-archive"

log() { echo "[$(date '+%F %T')] [$LOG_TAG] $1"; }

mkdir -p "$ARCHIVE_DIR"

archived=0
pruned=0

# --- 1. 30일 이상 지난 팀 보고서 → 아카이브 ---
# 03-teams 하위의 각 팀 폴더에서 30일 초과 파일을 99-archive로 이동
for team_dir in "$VAULT/03-teams"/*/; do
    if [[ ! -d "$team_dir" ]]; then continue; fi
    team_name=$(basename "$team_dir")
    while IFS= read -r -d '' old_file; do
        mkdir -p "$ARCHIVE_DIR/$team_name"
        mv "$old_file" "$ARCHIVE_DIR/$team_name/"
        archived=$((archived + 1))
    done < <(find "$team_dir" -name "*.md" -type f -mtime +30 -not -name "_index.md" -print0 2>/dev/null)
done

# --- 2. 14일 이상 지난 insights 정리 ---
# insights는 노이즈가 많으므로 2주 이상 지나면 삭제
INSIGHTS_DIR="$VAULT/02-daily/insights"
if [[ -d "$INSIGHTS_DIR" ]]; then
    while IFS= read -r -d '' old_insight; do
        rm -f "$old_insight"
        pruned=$((pruned + 1))
    done < <(find "$INSIGHTS_DIR" -name "*.md" -type f -mtime +14 -print0 2>/dev/null)
fi

# --- 3. 30일 이상 지난 standup → 아카이브 ---
STANDUP_DIR="$VAULT/02-daily/standup"
if [[ -d "$STANDUP_DIR" ]]; then
    mkdir -p "$ARCHIVE_DIR/standup"
    while IFS= read -r -d '' old_standup; do
        mv "$old_standup" "$ARCHIVE_DIR/standup/"
        archived=$((archived + 1))
    done < <(find "$STANDUP_DIR" -name "*.md" -type f -mtime +30 -print0 2>/dev/null)
fi

# --- 4. 60일 이상 지난 digest → 삭제 ---
DIGEST_DIR="$VAULT/02-daily/digest"
if [[ -d "$DIGEST_DIR" ]]; then
    while IFS= read -r -d '' old_digest; do
        rm -f "$old_digest"
        pruned=$((pruned + 1))
    done < <(find "$DIGEST_DIR" -name "*.md" -type f -mtime +60 -print0 2>/dev/null)
fi

# --- 5. 90일 이상 지난 아카이브 → 삭제 ---
if [[ -d "$ARCHIVE_DIR" ]]; then
    while IFS= read -r -d '' ancient; do
        rm -f "$ancient"
        pruned=$((pruned + 1))
    done < <(find "$ARCHIVE_DIR" -name "*.md" -type f -mtime +90 -print0 2>/dev/null)
fi

log "Lifecycle complete: $archived archived, $pruned pruned"
