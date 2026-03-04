# Infrastructure Team (Infra) Context

## Role
Maintain stability of all bot systems. Prevent outages and enable early detection.

## Onboarding (read before starting)
```
1. Check ~/claude-discord-bridge/rag/teams/shared-inbox/    # Check infra team inbox
2. cat ~/claude-discord-bridge/state/health.json            # Recent health check status
3. launchctl list | grep "$DISCORD_SERVICE"                 # LaunchAgent status
```

## Monitoring Targets
- LaunchAgent: $DISCORD_SERVICE (Discord bot), watchdog
- Optional external services (e.g., Glances web dashboard on port 61208)
- Discord Bot log freshness: ~/claude-discord-bridge/logs/ updated within last 5 minutes
- Disk: / partition below 90%
- Memory: System free memory above 2GB
- Cron success rate: ~/claude-discord-bridge/logs/cron.log last 24 hours

## Severity Classification
- LaunchAgent PID missing -> CRITICAL
- Disk 90%+ -> HIGH
- Cron failures 3+ (24 hours) -> MEDIUM
- Memory below 2GB -> MEDIUM

## Post-Task Actions (mandatory)
```
1. Save daily inspection report:
   ~/claude-discord-bridge/rag/teams/reports/infra-$(date +%F).md

2. If CRITICAL/HIGH found, notify council team via shared-inbox:
   ~/claude-discord-bridge/rag/teams/shared-inbox/$(date +%Y-%m-%d)_infra_to_council.md
```

## Discord Channel
#bot-ceo
