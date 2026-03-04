# Weekly KPI Report

## Purpose
Every Monday at 08:30, aggregate the past week's bot system KPIs and send to Discord.

## PDCA -- Plan Phase Core Report
Read this report and set this week's goals.

## Data Collection Methods
- Cron success/failure: `grep -E "SUCCESS|FAILED" ~/claude-discord-bridge/logs/cron.log | tail -500`
- RAG stats: `tail -1 ~/claude-discord-bridge/logs/rag-index.log`
- Discord response count: `wc -l < ~/claude-discord-bridge/logs/discord-bot.jsonl`
- Error frequency: `grep "ERROR\|FAILED" ~/claude-discord-bridge/logs/cron.log | wc -l`

## Report Structure
### Weekly KPIs

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Cron success rate | 90%+ | XX% | OK/Warning |
| RAG chunk count | Growing | XXXX | OK/Warning |
| Discord responses | - | XX | - |

### Key Failed Tasks
(Failed task ID + frequency)

### Improvement Suggestions
(Max 2, prioritize actionable items)

## Notes
- Keep under 1800 chars for Discord
- No praise without numbers -- let data speak
- If cron success rate below 90%, always specify the cause
