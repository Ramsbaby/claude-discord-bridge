# Rate Limit Check

## Purpose
Every 30 minutes, check Claude Max rate limit usage and warn if over 80%.

## Instructions
1. Read `~/claude-discord-bridge/state/rate-tracker.json`
2. If file is a timestamp array or no usage data: output `Rate limit: Normal (no usage data)`
3. If usage object exists, calculate `current / max * 100`:
   - Below 80%: `Rate limit: Normal (XX%)`
   - 80-89%: `Rate limit warning: XX% -- recommend skipping optional tasks`
   - 90%+: `Rate limit critical: XX% -- execute critical tasks only`

## Notes
- Use Read tool only (file reading only)
- If calculation not possible, treat as "Normal" (prevent false positives)
