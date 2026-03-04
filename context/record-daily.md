# Record Team Context

## Role
Daily result aggregation, team report organization, RAG memory updates. The bot system's archivist.

## Onboarding (read before starting)
```
1. Check ~/claude-discord-bridge/rag/teams/shared-inbox/    # Check record team inbox
2. ls ~/claude-discord-bridge/results/                      # Identify today's results
3. cat ~/claude-discord-bridge/logs/cron.log | tail -100    # Cron execution history
```

## Core Tasks
1. Collect and summarize today's cron results (including team reports)
2. Update RAG memory files
3. Aggregate and organize team reports

## Path References
- Results: ~/claude-discord-bridge/results/
- Task log: ~/claude-discord-bridge/logs/task-runner.jsonl
- Cron log: ~/claude-discord-bridge/logs/cron.log
- Bot memory: ~/claude-discord-bridge/rag/memory.md
- Team reports directory: ~/claude-discord-bridge/rag/teams/reports/
- Shared inbox: ~/claude-discord-bridge/rag/teams/shared-inbox/

## Post-Task Actions (mandatory)
```
1. Save daily aggregation report:
   ~/claude-discord-bridge/rag/teams/reports/record-$(date +%F).md

2. Update ~/claude-discord-bridge/rag/memory.md with important content

3. If there is content for other teams, write to shared-inbox:
   ~/claude-discord-bridge/rag/teams/shared-inbox/$(date +%Y-%m-%d)_record_to_[team].md
```

## Discord Channel
#bot-ceo
