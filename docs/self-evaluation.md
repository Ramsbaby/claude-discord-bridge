# Bot Self-Evaluation Framework v1.0
> Created: 2026-03-02 | Update cycle: Every Monday (linked with weekly-kpi task)

## Evaluation Axes (8 dimensions)

### 1. Cron Reliability
- **Metric**: task-runner.jsonl success/error count per task
- **Criteria**: Success rate 90%+ OK | 70-90% Warning | Below 70% Fail
- **Tool**: `~/claude-discord-bridge/scripts/measure-kpi.sh --days 7`
- **Current**: Cron success rate 84% Warning (timeout issue fixed, improving)

### 2. Team Structure Coverage
- **Metric**: tasks.json team cron count / target 7
- **Criteria**: 7/7 OK | 5-6/7 Warning | 4 or less Fail
- **Current**: 7/7 OK (council/academy/record/brand/infra + career + weekly-kpi)

### 3. Discord Routing Accuracy
- **Metric**: monitoring.json registered webhook channels / required channels
- **Criteria**: 5+ channels OK | 3-4 Warning | 2 or less Fail
- **Current**: 5 channels OK (bot/system/market/blog/ceo)

### 4. RAG Coverage (Memory)
- **Metric**: rag-index.log latest total chunks
- **Criteria**: 2,000+ OK | 1,000-2,000 Warning | Below 1,000 Fail
- **Current**: 1,933 Warning (growing, hourly incremental)

### 5. Governance SSoT Compliance
- **Metric**: ~/claude-discord-bridge/config/company-dna.md freshness (last update date)
- **Criteria**: In sync OK | Out of sync Fail
- **Current**: OK (synced 2026-03-02)

### 6. Bot Persona Quality
- **Metric**: Discord "introduce yourself" response has no generic chatbot patterns
- **Criteria**: Wit + no forbidden phrases OK | Generic chatbot pattern detected Fail
- **Current**: OK (per-channel persona injection complete)

### 7. Bot Completion Rate
- **Metric**: ROADMAP.md completion percentage
- **Criteria**: 90%+ OK | 70-90% Warning | Below 70% Fail
- **Current**: 68% Warning (target 90%)

### 8. Cost Efficiency
- **Metric**: Estimated monthly cost (from cost-monitor task results)
- **Criteria**: Under $15 OK | $15-25 Warning | $25+ Fail
- **Current**: claude -p based, no API cost (Claude Max flat rate)

## How to Run Evaluation

```bash
# Immediate evaluation
~/claude-discord-bridge/scripts/measure-kpi.sh --days 7

# Send to Discord
~/claude-discord-bridge/scripts/measure-kpi.sh --days 7 --discord

# Manual execution of individual task
/bin/bash ~/claude-discord-bridge/bin/bot-cron.sh council-insight
```

## Evaluation Schedule
- Daily: council-insight (23:00) -- automatic cron reliability monitoring
- Weekly: weekly-kpi (Mon 08:30) -- full KPI aggregation + Discord report
- Monthly: monthly-review (1st of month 09:00) -- long-term trend analysis
