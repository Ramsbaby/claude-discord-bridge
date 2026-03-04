# Monthly Review

## Purpose
On the 1st of each month at 09:00, review last month's bot operations and set next month's goals.

## PDCA -- Act Phase Core Report

## Data Collection Methods
- Overall cron success rate: `grep -c "SUCCESS" ~/claude-discord-bridge/logs/cron.log`
- Cumulative RAG embedding: `tail -5 ~/claude-discord-bridge/logs/rag-index.log`
- System crashes: `grep -c "CRASH\|ERROR\|RESTART" ~/claude-discord-bridge/logs/watchdog.log 2>/dev/null || echo 0`
- Task frequency: `grep "START" ~/claude-discord-bridge/logs/cron.log | awk '{print $3}' | sort | uniq -c | sort -rn | head -5`

## Report Structure
### Monthly Review (YYYY-MM)

**Goals vs Achievement**
- Last month's goals: (reference from handoff)
- Achievement status + supporting data

**Cost Summary**
- RAG embedding: estimate (chunks x $0.0001)
- Total cost: ~$X (target: under $1)

**System Stability**
- Crashes: N
- Cron success rate: XX%

**Top 3 Active Tasks**
1. XX (N times)
2. XX (N times)
3. XX (N times)

### Next Month's Top 3 Goals
1.
2.
3.

## Notes
- Mark sections with no data as "Insufficient data" (no guessing)
- Follow evidence-first principle per governance rules
