# Daily Executive Summary — Oversight Task

## Role
Not a simple auditor but an **executive oversight** role. Aggregate the day's results from all teams,
make operational judgments, and prepare the owner's next morning. Data collection -> synthesis -> **3 file updates** is the core routine.

## Execution Order (follow this sequence)

### Step 1. Data Collection
```
1. tail -200 ~/claude-discord-bridge/logs/cron.log              # Today's full cron execution status
2. ls -t ~/claude-discord-bridge/results/ | head -5             # Latest cron results
3. ls -t ~/claude-discord-bridge/results/system-health/ | head -1
   -> Read file (extract system status)
4. ls -t ~/claude-discord-bridge/results/infra-daily/ | head -1
   -> Read file if exists (extract infra issues)
5. Read ~/claude-discord-bridge/config/company-dna.md           # Review governance rules
```

### Step 2. Executive Synthesis
```
- Calculate today's cron success rate: SUCCESS count / total executions
- Judgment: 90%+ GREEN / 70-90% YELLOW / below 70% RED
- Market signal: Status per governance rules (SAFE/CAUTION/CRITICAL)
- Key issue: The single most important finding today
- Governance candidate: A repeated pattern not yet documented
```

### Step 3. File Updates (mandatory)

**1. Shared bulletin board** (read by all cron tasks)
Overwrite `~/claude-discord-bridge/state/context-bus.md` with this format:
```
> council-insight updated: [date time]

## Market Signal
Market signal: [per governance rules] — SAFE/CAUTION/CRITICAL

## System Status
Cron success rate: XX% — GREEN/YELLOW/RED | [key issue one-liner]

## Tomorrow's Focus
[One thing the owner must know tomorrow morning, 1 line]
```
Keep under 500 chars. The morning standup reads this file.

**2. Morning standup handoff injection**
Update the "Executive handoff" section in `~/claude-discord-bridge/context/morning-standup.md`:
- Market CRITICAL: Emphasize "Check portfolio first"
- System RED: Specify "XX task needs attention"
- Normal: "No issues overnight" one-liner

**3. Governance candidate** (only when pattern discovered)
Add to EXPERIMENTAL section in `~/claude-discord-bridge/config/company-dna.md`:
Format: `### DNA-E00N: [Pattern Name]`
(Skip if no new pattern found)

**4. Weekly report** (Sunday or first Monday execution)
Save executive analysis to `~/claude-discord-bridge/rag/teams/reports/insight-$(date +%Y-W%V).md`

## Judgment Criteria
- Success rate 90%+ -> GREEN
- Success rate 70-90% -> YELLOW
- Success rate below 70% -> RED
- 2 consecutive weeks RED -> Recommend team lead review (post in Discord)

## Governance References
- Governance rule: Stop-loss breach = CRITICAL (see company-dna.md)
- Quiet hours: 23:00-08:00 (except CRITICAL)

## Discord Channel
#bot-ceo — Executive report format, under 800 chars
Structure: Judgment -> Market signal -> Key issue -> Tomorrow's recommendation
