# Claude Discord Bridge — Project Roadmap

> Created: 2026-03-01 | Updated: 2026-03-02 | Current Completion: **82%** | Target: **90%**
> "Plan systematically, execute, review, and reflect."

---

## 1. Current State Assessment

### Completed (Phase 1 — 2026-03-01)

| Area | Status | Details |
|------|--------|--------|
| Discord Bot | Running | 976 lines, multi-turn sessions, streaming, /search /threads /alert |
| LanceDB RAG | Working | 1,933 chunks, 240 sources, hybrid search (hourly incremental) |
| Long-term Memory Migration | 23 core files | domains, knowledge, teams, strategy |
| Push Notifications | Integrated | Phone push alerts via ntfy, auto-send on crash/error |
| Cron Tasks | 24 active | morning-standup, monitoring, health checks, team crons, cleanup, etc. |
| E2E Tests | 28/28 PASS | Process, RAG, file, dependency, cron verification |
| ask-claude.sh | RAG integrated | Semantic search + static file fallback |

### Gap Analysis (Remaining Work)

| Area | Current | Gap | Priority |
|------|---------|-----|----------|
| Core Infrastructure | Complete | - | - |
| RAG Engine | 1,933 chunks | Expand coverage | P1 |
| Channel Personas | 11 channels configured | - | - |
| Team Crons | 7/7 configured | Needs execution verification | P1 |
| Webhook Routing | 5 channels complete | Add remaining channels | P2 |
| KPI Auto-Measurement | measure-kpi.sh implemented | Crontab integration | P1 |
| Cron Success Rate | 84% | Target 90%+ (timeout set to 240s, verifying) | P1 |
| Autonomy Level System | Not implemented | Apply autonomy-levels.md in practice | P2 |
| measure-kpi cron | Implementation complete | Pending crontab registration | P1 |

---

## 2. Roadmap (4 Phases)

### Phase 2: Persona & Memory Completion (P0 — Immediate)

> Estimated effort: 1 session | Impact: Significant improvement in Discord conversation quality

#### Task 2-1. Bot Persona System Prompt Injection

**File**: `discord/discord-bot.js` (modify SYSTEM_PROMPT)

Integrate persona.md content into the system prompt:
- Dry wit and subtle humor
- Banned phrases (e.g., overly eager responses like "Got it!", "Done!", "I'll help you with that!")
- Discord formatting rules (blank lines after subheadings, tables preferred, minimal code blocks)
- Pre-Send Checklist (prevent generic chatbot-like responses)
- Opening Lines by Task Type (different tone for search/coding/analysis)

**Verification**: In Discord, send "introduce yourself" and confirm the bot responds in character.

#### Task 2-2. RAG Indexing Expansion (20% -> 60%+ coverage)

**File**: `bin/rag-index.mjs`

Additional indexing targets (~150 files):
```
rag/teams/reports/*.md       # Weekly reports
rag/teams/learnings/*.md     # Lessons learned
rag/teams/shared-inbox/*.md  # Inter-team messages
context/*.md                 # All cron context files
results/**/*.md              # Task results (last 7 days)
```
Alternatively, use the `BOT_EXTRA_MEMORY` environment variable to specify an external memory directory.

**Note**: More files = higher embedding cost. Check OpenAI API call volume during initial indexing.

**Verification**: After running `node rag-index.mjs`, confirm stats show > 800 chunks.

#### Task 2-3. Context File Creation (for cron tasks)

**Directory**: `context/`

Currently, tasks.json defines contextFile paths but the actual files do not exist.
Create background knowledge files for each cron task:

- `morning-standup.md` — Daily routine, important schedule patterns
- `stock-monitor.md` — Market stop-loss rules, portfolio status (local only)
- `market-alert.md` — Threshold criteria, VIX cross-reference rules (local only)
- `daily-summary.md` — Daily summary format, key metrics
- `weekly-report.md` — Weekly report structure, KPI items

---

### Phase 3: Governance & Operations Framework (P1 — Within 1 week)

> Estimated effort: 2-3 sessions | Impact: Bot operates autonomously like a team

#### Task 3-1. Operations Cadence

**Daily**
| Time | Task | Description |
|------|------|-------------|
| 07:50 | news-briefing | AI/Tech news (3 items) |
| 08:05 | morning-standup | Integrated briefing (schedule + market + system) |
| 09-16:00 | stock-monitor | 15-min interval price checks (weekdays, optional) |
| 20:00 | daily-summary | Daily summary + issues |
| 02:00 | memory-cleanup | Clean up entries older than 7 days |

**Weekly**
| Day | Task | Description |
|-----|------|-------------|
| Sun 20:05 | weekly-report | Weekly report (task success rate, issues, improvements) |
| Mon 08:30 | **weekly-kpi** (new) | KPI weekly aggregate + summary report |

**Monthly**
| Day | Task | Description |
|-----|------|-------------|
| 1st 09:00 | **monthly-review** (new) | Monthly retrospective (cost, performance, improvements, next month plan) |

#### Task 3-2. Weekly KPI Report Cron

**File**: Add `weekly-kpi` task to `config/tasks.json`

```json
{
  "id": "weekly-kpi",
  "name": "Weekly KPI Report",
  "schedule": "30 8 * * 1",
  "prompt": "Generate this week's bot system KPI summary: 1) Per-cron-task success/failure rate (from logs/cron.log) 2) RAG index statistics 3) Discord response count 4) Error/warning frequency. Include 1-2 improvement suggestions.",
  "output": ["discord", "file"]
}
```

#### Task 3-3. Monthly Review Cron

**File**: Add `monthly-review` task to `config/tasks.json`

```json
{
  "id": "monthly-review",
  "name": "Monthly Review",
  "schedule": "0 9 1 * *",
  "prompt": "Generate a bot operations retrospective for the past month: 1) Goals vs. actuals comparison 2) Cost status (API usage) 3) System stability (uptime, crash count) 4) Most-used features 5) Top 3 improvement goals for next month. Keep it concise.",
  "output": ["discord", "file"]
}
```

#### Task 3-4. Autonomy Level Definitions

**File**: `config/autonomy-levels.md` (new)

4-tier autonomy framework:

| Level | Description | Examples | Approval |
|-------|-------------|----------|----------|
| **L1** | Auto-execute, log only | Log cleanup, disk check, RAG indexing | Not required |
| **L2** | Auto-execute, report to Discord | Morning briefing, news, price monitoring | Not required |
| **L3** | Request confirmation on Discord before executing | File deletion, config changes, cron modifications | Owner confirmation |
| **L4** | Cannot execute; requires direct owner instruction | Token refresh, service restart, deployment | Owner command |

#### Task 3-5. Operational DNA Migration

**File**: `config/company-dna.md` (new)

Operational DNA pattern definitions:
- DNA-C001: Market analysis check (stop-loss thresholds, trend + VIX)
- DNA-C002: Notification time policy (23:00-08:00 quiet hours)
- DNA-S001: Discord report format (1800 chars max, minimal headers)

---

### Phase 4: Advanced Crons & Intelligence Enhancement (P1-P2 — Within 2 weeks)

> Estimated effort: 3-4 sessions | Impact: Team-level automation

#### Task 4-1. Add 5 Advanced Cron Tasks

Expand from 18 to 24 tasks. High-utility tasks + 5 selected team crons:

| ID | Name | Schedule | Description |
|----|------|----------|-------------|
| `weekly-kpi` | Weekly KPI | Mon 08:30 | Cron success rate, RAG stats, error frequency |
| `monthly-review` | Monthly Review | 1st 09:00 | Cost/performance/improvement retrospective |
| `security-scan` | Security Scan | Daily 02:30 | .env exposure, permission anomalies, log audit |
| `rag-health` | RAG Health Check | Daily 03:00 | Index integrity, search quality, coverage |
| `career-weekly` | Career Weekly | Fri 18:00 | Job market trends, hiring patterns |

#### Task 4-2. Discord Channel Routing (Optional)

Current: All cron results sent to a single channel
Improvement: Per-task channel assignment (add channel ID to `output` array in tasks.json)

```
#bot-system  -> system-health, disk-alert, rate-limit-check
#bot-market  -> stock-monitor, market-alert
#bot-daily   -> morning-standup, daily-summary, news-briefing
#bot-reports -> weekly-kpi, monthly-review, weekly-report
```

**Note**: Verify existing channel mappings (CHANNEL_IDS in .env) before configuring.

#### Task 4-3. Real-time RAG File Watcher (Optional)

**File**: `lib/rag-watcher.mjs` (new)

```bash
npm install chokidar
```

Use chokidar to watch `context/`, `rag/`, and `results/` directories.
Re-index RAG immediately on file changes (currently on a 1-hour cron).

**Considerations**: Requires a persistent background process (e.g., LaunchAgent or systemd). Monitor memory usage.

---

### Phase 5: Maturity Improvements (P2 — Within 1 month)

> Long-term improvement items. Not urgent, but needed to go from 90% to 95%.

#### Task 5-1. Self-Diagnostics & Auto-Recovery

- Run E2E tests on a cron schedule (daily at 03:00)
- On failure, attempt automatic recovery (L1 level) + push notification
- If recovery fails, escalate via Discord + push notification

#### Task 5-2. Cost Monitoring

- Track daily OpenAI API usage
- Alert when monthly cost exceeds $10 (RAG embedding + cron costs)
- Include cost line items in weekly KPI

#### Task 5-3. Performance Dashboard

- Simple statistics based on `results/` data
- Cron success rate, average response time, RAG search hit rate
- Auto-included in weekly/monthly reports

#### Task 5-4. Obsidian Vault Integration (Optional)

- Use the `rag/` directory as an Obsidian Vault
- Visualize knowledge connections via graph view
- Bidirectional sync with RAG

---

## 3. Operations Framework: PDCA Cycle

### Plan — Every Monday 08:30

- Review weekly KPI report
- Set goals for the week (via tasks.json or Discord)
- Identify blockers and resolution strategies

### Do — Daily (automated)

- Cron tasks execute automatically
- Ad-hoc work via Discord conversations
- Knowledge auto-accumulated through RAG indexing

### Check — Daily 20:00

- Review daily performance via daily-summary
- Analyze root causes of failed tasks
- Indirectly assess RAG search quality (via Discord conversation quality)

### Act — Every Sunday 20:00 / 1st of each month

- weekly-report: Weekly issues & improvement proposals
- monthly-review: Monthly retrospective & next month's plan
- Update operational DNA (add verified patterns)

---

## 4. Actionable TODOs (Next Session)

> Ordered by priority. Recommended: 1-2 items per session.

### Completed (2026-03-02)

- [x] **Task 2-1**: discord-bot.js bot persona injection
- [x] **Task 2-2**: RAG indexing expansion (reports/, decisions/ added)
- [x] **Task 2-3**: context/*.md files created (stock-monitor, market-alert, morning-standup, etc.)
- [x] **Task 3-1**: Operations cadence verified (all schedules confirmed)
- [x] **Task 3-2**: weekly-kpi cron added (Mon 08:30)
- [x] **Task 3-3**: monthly-review cron added (1st 09:00)
- [x] **Task 3-4**: autonomy-levels.md (L1-L4 autonomy framework)
- [x] **Task 3-5**: company-dna.md SSoT created

- [x] **Task 4-1**: 3 advanced crons added (security-scan 02:30, rag-health 03:00, career-weekly Fri 18:00)
- [x] **Task 4-2**: Discord channel routing (bot-daily/market/reports/system — 4-channel framework)

- [x] **Task 5-1**: E2E self-diagnostics cron (e2e-cron.sh, daily 03:30, escalates on failure via push notification)
- [x] **Task 5-2**: Cost monitoring (cost-monitor, every Sunday 09:00)
- [x] **Task 5-3**: Performance dashboard (integrated into weekly-kpi prompt)
- [x] **Task 5-4**: Obsidian guide documented (`docs/obsidian-sync-guide.md`)

### Manual Steps Required (Non-code)

- [ ] **Discord webhook registration**: Create webhooks for bot-market, bot-daily, bot-reports channels and add to `monitoring.json`
- [ ] **Obsidian**: Install obsidian-git plugin (guide: `docs/obsidian-sync-guide.md`)

### Optional Improvements (P2)

- [ ] **Task 4-3**: Real-time RAG watcher (chokidar — 1-hour cron is sufficient for now)

---

## 5. Projected Completion Roadmap

| Milestone | Completion | Key Achievements |
|-----------|------------|-----------------|
| Phase 1 Complete (2026-03-01) | **60%** | RAG, Discord bot, push notifications, basic crons |
| Phase 2 Complete (2026-03-02) | **68%** | Persona, RAG coverage expansion, context files |
| Phase 3 Complete (2026-03-02) | **75%** | Governance, PDCA cycle, KPI, autonomy levels documented |
| Phase 4 Complete (2026-03-02) | **80%** | 24 advanced crons, channel routing, 5 team crons |
| **Current** (2026-03-02) | **82%** | Cron timeout fixes, memory refresh, SSoT unification |
| Remaining Work Complete | **90%** | Autonomy levels in code, RAG orphan cleanup, cron success rate 90%+ |

---

## 6. File Structure Reference

```
claude-discord-bridge/
├── bin/
│   ├── ask-claude.sh          # Claude CLI wrapper (RAG integrated)
│   ├── bot-cron.sh            # Cron executor
│   ├── rag-index.mjs          # RAG incremental indexer
│   ├── retry-wrapper.sh       # Retry wrapper
│   ├── route-result.sh        # Result router (Discord/file/push)
│   └── semaphore.sh           # Concurrency control
├── config/
│   ├── tasks.json             # Cron task definitions (24 tasks)
│   ├── monitoring.json        # Monitoring configuration
│   ├── autonomy-levels.md     # Autonomy levels (L1-L4, documented)
│   └── company-dna.md         # Operational DNA (SSoT synced)
├── context/                   # Per-cron-task background knowledge (created)
├── discord/
│   ├── discord-bot.js         # Discord bot (976 lines)
│   ├── .env                   # Environment variables (DISCORD_TOKEN, OPENAI_API_KEY, etc.)
│   └── node_modules/          # @lancedb, openai, discord.js, etc.
├── lib/
│   ├── rag-engine.mjs         # LanceDB RAG engine
│   └── rag-query.mjs          # RAG query CLI
├── logs/                      # Cron logs, RAG logs
├── rag/
│   ├── lancedb/               # LanceDB vector DB (~1,933 chunks)
│   ├── memory.md              # Long-term memory
│   ├── decisions.md           # Decision log
│   ├── handoff.md             # Session handoff notes
│   └── index-state.json       # RAG index state (mtime tracking)
├── results/                   # Cron execution results
├── scripts/
│   ├── e2e-test.sh            # E2E tests (28 tests)
│   ├── alert.sh               # Alerts (Discord + push notification)
│   ├── health-check.sh        # Health check
│   ├── launchd-guardian.sh    # Process manager watchdog
│   ├── log-rotate.sh          # Log rotation
│   ├── sync-discord-token.sh  # Token sync
│   └── watchdog.sh            # Watchdog
├── state/
│   ├── sessions.json          # Discord session state
│   └── rate-tracker.json      # Rate limit tracking
└── ROADMAP.md                 # <- This document
```

---

*This is a living document that tracks the bot's evolution.*
*Update it whenever a new Phase is completed.*
