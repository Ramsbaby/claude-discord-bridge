#!/usr/bin/env bash
set -euo pipefail

# auditor-fix-shellcheck.sh - Apply shellcheck auto-fixes via diff
# Usage: auditor-fix-shellcheck.sh <file>
# Called by L3 approval system
# Note: Uses patch (not git apply) since ~/.jarvis may not be a git repo

FILE="${1:?Usage: auditor-fix-shellcheck.sh <file>}"
BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

if [[ ! -f "$FILE" ]]; then
    echo "ERROR: File not found: $FILE" >&2
    exit 1
fi

# Backup
cp "$FILE" "${FILE}.bak"

# Get shellcheck diff
DIFF_OUT=$(shellcheck --format=diff "$FILE" 2>/dev/null || true)

if [[ -z "$DIFF_OUT" ]]; then
    rm -f "${FILE}.bak"
    echo "WARN: No shellcheck diff to apply for $FILE"
    exit 0
fi

# Apply using patch (strips a/ prefix from shellcheck diff)
if echo "$DIFF_OUT" | patch -p1 --no-backup-if-mismatch -s 2>/dev/null; then
    # Verify syntax
    if bash -n "$FILE" 2>/dev/null; then
        rm -f "${FILE}.bak"
        echo "OK: shellcheck fixes applied to $FILE"
        exit 0
    else
        # Restore from backup
        mv "${FILE}.bak" "$FILE"
        echo "ERROR: Syntax check failed after fix, restored backup" >&2
        exit 1
    fi
else
    # Restore from backup
    mv "${FILE}.bak" "$FILE"
    echo "ERROR: patch failed, restored backup" >&2
    exit 1
fi
