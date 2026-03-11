#!/usr/bin/env bash
set -euo pipefail
# Self-test: verify manifest is valid and required commands exist

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. manifest.json valid
jq -e '.id' "$DIR/manifest.json" >/dev/null

# 2. context.md readable
test -r "$DIR/context.md"

# 3. Required commands available
command -v df >/dev/null
command -v vm_stat >/dev/null
command -v uptime >/dev/null

echo "PASS: system-health plugin self-test"
