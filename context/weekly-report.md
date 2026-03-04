# Weekly Report

## Purpose
Every Sunday at 20:00, generate a weekly system operations summary report.

## Data Collection Methods
- Cron success/failure: `grep -c "SUCCESS\|FAIL" ~/claude-discord-bridge/logs/cron.log` (this week's)
- System issues: `cat ~/claude-discord-bridge/logs/watchdog.log` last 7 days
- RAG stats: `NODE_PATH=~/claude-discord-bridge/discord/node_modules node -e "import {RAGEngine} from '$HOME/claude-discord-bridge/lib/rag-engine.mjs'; const e=new RAGEngine(); await e.init(); console.log(JSON.stringify(await e.getStats()))" --input-type=module`
- Discord activity: `wc -l ~/claude-discord-bridge/logs/discord-bot.jsonl`

## Report Structure
### Weekly KPIs
- Cron task success rate (target: 90%+)
- RAG index stats (chunks, sources)
- Discord response count

### Issues & Incidents
- Time of occurrence, cause, resolution status

### Improvement Suggestions
- Repeated failure patterns -> root cause analysis
- Next week's top 1-2 priorities

## Notes
- Write concisely, send to Discord
- Recommended under 1800 chars
