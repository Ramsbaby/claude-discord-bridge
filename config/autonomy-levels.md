# Autonomy Levels

> 4-tier autonomy framework. Always check the level before executing a task.
> SSoT: This file. Together with company-dna.md, forms the core of bot governance.

## Level Definitions

| Level | Name | Description | Approval Required | Examples |
|-------|------|-------------|-------------------|----------|
| **L1** | Auto-execute | Log only, no reporting | No | Log cleanup, disk check, RAG indexing, rate-limit-check |
| **L2** | Report-execute | Auto-execute + Discord result report | No | Morning briefing, news, market monitoring, weekly KPI |
| **L3** | Confirm-execute | Request confirmation in Discord before executing | Yes (owner confirm) | File deletion, config changes, cron modifications, service restart |
| **L4** | Command-execute | Cannot execute. Owner must issue direct command | Yes (owner command) | Token renewal, deployment, GitHub push, external service account changes |

## Task Level Classification

### L1 (Automatic, no report)
- `rate-limit-check` -- File reading only
- `disk-alert` -- No output if normal
- `system-health` -- Log only if normal
- `memory-cleanup` -- Auto-delete files older than 7 days
- `rag-index` (cron) -- Index changed files

### L2 (Automatic, Discord report)
- `morning-standup` -- Daily 08:05
- `news-briefing` -- Daily 07:50
- `stock-monitor` (example) -- Periodic during trading hours
- `market-alert` (example) -- Escalate to L3 on sudden changes
- `daily-summary` -- Daily 20:00
- `weekly-report` -- Every Sunday 20:05
- `weekly-kpi` -- Every Monday 08:30
- `monthly-review` -- 1st of each month 09:00
- `github-monitor` -- Hourly

### L3 (Execute after Discord confirmation)
- Config file modifications (tasks.json, company-dna.md, etc.)
- Cron schedule changes
- Service restart (launchctl kickstart)
- `token-sync` -- Claude Max token renewal

### L4 (Awaiting command)
- GitHub push / PR creation
- External API key changes
- Deployment (launchd plist replacement)
- System architecture changes

## Discord Bot Application Rules

1. If user requests L3/L4 task -> Send confirmation message first
2. Stop-loss breach (governance rule) -> Immediate CRITICAL alert regardless of level
3. 23:00-08:00 (quiet hours) -> L2 results are silent overnight, L1 continues

## Escalation Rules

- L1 fails 3 times consecutively -> Escalate to L2 (Discord report)
- L2 failure -> Discord error message
- L3 no response for 30 minutes -> Cancel task + Discord re-alert
