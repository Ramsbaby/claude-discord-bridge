# Security Scan

## Purpose
Check bot system security status daily at 2:30 AM.

## Check Items
1. **Secret exposure**: API key/token files in abnormal locations outside .env
2. **File permissions**: config/ files not readable by others (600/640 recommended)
3. **Access logs**: Abnormal patterns in discord-bot.jsonl (repeated failures, unusual IPs, etc.)
4. **Disk space**: Warn if / partition exceeds 90%

## Output Rules
- Normal: `Security: OK`
- Issue found: Per-item format `Warning [item]: [description]`
- CRITICAL (API key exposure, etc.): Escalate via alert.sh for push notification

## Notes
- Bash only. No file modifications (read-only inspection)
- L1 task -- results saved to file only, Discord only when anomaly found
- Use absolute paths. No relative paths.
