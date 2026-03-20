# Operations Guide

> Back to [docs/INDEX.md](INDEX.md) | [README](../README.md)

## Cron Schedule

All cron tasks are defined in `config/tasks.json` and executed by `bin/bot-cron.sh`.

### Critical (always runs)

| Task | Schedule | Description |
|------|----------|-------------|
| `morning-standup` | 06:15 daily | Smart standup (waits for owner online) |
| `board-meeting-am` | 08:10 daily | CEO board meeting (morning) |
| `board-meeting-pm` | 21:55 daily | CEO board meeting (evening) |
| `tqqq-monitor` | */15 22-23 Mon-Fri | TQQQ/SOXL/NVDA price tracking |
| `market-alert` | 09:05,13:05,16:05 Mon-Fri | 5%+ swing detection |

### Daily

| Task | Schedule | Description |
|------|----------|-------------|
| `news-briefing` | 07:50 | AI/Tech news top 3 |
| `infra-daily` | 09:00 | Infrastructure health check |
| `daily-summary` | 20:00 | End-of-day summary |
| `record-daily` | 22:30 | Daily archive + logging |
| `council-insight` | 23:05 | Cross-team oversight |
| `finance-monitor` | 08:00 Mon-Fri | Financial monitoring |
| `ceo-daily-digest` | 22:00 daily | CEO daily digest summary |
| `personal-schedule-daily` | 07:30 daily | Preply/일정 브리핑 |
| `bot-self-critique` | 02:45 daily | Bot response self-evaluation |
| `system-doctor` | 06:00 daily | System diagnostics |
| `career-extractor` | 00:30 daily | Career data extraction |
| `oss-maintenance` | 09:15 daily | OSS repo maintenance |
| `personal-schedule-daily` | 07:30 | Preply lesson briefing |

### Weekly / Monthly

| Task | Schedule | Description |
|------|----------|-------------|
| `weekly-report` | Sun 20:05 | Weekly system summary |
| `weekly-kpi` | Mon 08:30 | KPI measurement |
| `ceo-weekly-digest` | Mon 09:00 | CEO weekly review digest |
| `connections-weekly-insight` | Mon 09:45 | Cross-team pattern analysis |
| `weekly-usage-stats` | Mon 09:00 | Discord usage statistics |
| `career-weekly` | Fri 18:00 | Career growth report |
| `academy-support` | Sun 20:00 | Learning team digest |
| `brand-weekly` | Tue 08:00 | Brand/OSS growth report |
| `recon-weekly` | Mon 09:00 | Intelligence exploration |
| `weekly-code-review` | Sun 05:00 | Automated code review |
| `memory-sync` | Mon 04:30 | Memory auto-sync |
| `memory-expire` | Mon 03:00 | Memory TTL expiration + stale entry purge |
| `monthly-review` | 1st of month 09:00 | Monthly ops retrospective |

### Maintenance

| Task | Schedule | Description |
|------|----------|-------------|
| `token-sync` | 01:00 daily | Claude Max token sync |
| `memory-cleanup` | 02:00 daily | Old results/sessions purge |
| `security-scan` | 02:30 daily | Secret files + permissions audit |
| `bot-quality-check` | 02:30 daily | Bot response quality analysis |
| `rag-health` | 03:00 daily | RAG index integrity check |
| `code-auditor` | 04:45 daily | ShellCheck + syntax validation |
| `gen-system-overview` | 04:05 daily | Auto-regenerate SYSTEM-OVERVIEW.md (script-only) |
| `doc-sync-auditor` | 23:00 daily | Doc-code sync audit + draft generation |
| `doc-supervisor` | 05:00 daily | Documentation freshness check |
| `log-rotate` | 03:15 daily | Log rotation (crontab direct, not in tasks.json) |
| `agent-batch-commit` | 08:30, 22:20 daily | Auto-commit agent outputs (08:30 — board-meeting-am 완료 후 여유 확보) |
| `dev-runner` | 22:55 daily | Autonomous dev queue runner |
| `cost-monitor` | Sun 09:00 | API cost tracking |
| `skill-eval` | Sun 04:30 | Auto-evaluate Claude Code skill quality |
| `schedule-coherence` | Mon 04:00 | Crontab ↔ tasks.json 정합성 검증 |
| `connections-weekly-insight` | Mon 09:45 | Cross-team connection pattern analysis |
| `recon-weekly` | Mon 09:00 | Intelligence reconnaissance |
| `oss-recon` | Mon 10:30 | OSS landscape monitoring |
| `oss-docs` | Wed 11:00 | OSS documentation update |
| `oss-promo` | Fri 17:00 | OSS promotion activity |

### Background (high-frequency)

| Task | Schedule | Description |
|------|----------|-------------|
| `rate-limit-check` | */30 | Rate limit monitoring |
| `update-usage-cache` | */30 | /usage command cache |
| `calendar-alert` | */5 | Google Calendar pre-alerts |
| `session-sync` | */15 | Context bus sync |
| `stale-task-watcher` | */30 | Stale FSM task detection + cleanup |
| `cron-auditor` | 05:30 daily | Crontab vs tasks.json 실행 감사 |
| `disk-alert` | hourly :10 | Disk threshold check |
| `github-monitor` | hourly | GitHub notification check |
| `system-health` | */30 | Disk/CPU/memory/process check |

### Event-triggered (no cron schedule)

| Task | Trigger | Description |
|------|---------|-------------|
| `auto-diagnose` | `task.failed` | Automatic failure diagnosis |
| `github-pr-handler` | `github.pr_opened` | PR opened → review + notify |
| `discord-mention-handler` | `discord.mention` | Mention → route to handler |
| `cost-alert-handler` | `system.cost_alert` | Cost threshold → alert |

---

## LaunchAgents

Managed by `launchd` on macOS. Guardian cron (*/3 min) auto-recovers unloaded agents.

| Agent | Type | Description |
|-------|------|-------------|
| `ai.jarvis.discord-bot` | KeepAlive | Discord bot process |
| `ai.jarvis.watchdog` | 180s interval | Bot health + stale process cleanup |
| `ai.jarvis.board-monitor` | 300s interval | Workgroup 언급 감지 → 유머 응답 |
| `ai.jarvis.board-agent` | 600s interval | Workgroup 자발적 참여 (댓글/게시글) |
| `ai.jarvis.board-catchup` | 300s interval | 과거 미응답 언급 소급 처리 (1회당 1건) |
| `ai.openclaw.glances` | KeepAlive | System monitor (port 61208) |

Plist files: `~/Library/LaunchAgents/ai.jarvis.*.plist`

### Workgroup Board → RAG Pipeline

```
board-monitor.sh / board-agent.sh (5~10분 주기)
  └─ 외부 에이전트 이벤트 → ~/Jarvis-Vault/02-daily/board/YYYY-MM-DD.md
       └─ rag-watch.mjs 자동 감지 → LanceDB 인덱싱
            ├─ council-insight (23:05): "외부 에이전트 동향" 섹션에 참조
            └─ morning-standup / RAG 검색 시 자동 활용
```

- 공유 STATE: `state/board-monitor-state.json` — `lastSeenTime`, `repliedToCommentIds[]`
- 소급 처리 STATE: board-catchup.sh도 동일 파일 공유 (repliedToPostIds 하위 호환)

---

## Monitoring Stack

### Nexus MCP Tools — Performance Notes

- **`nexus_stats`**: reads only the last 200 KB of `logs/nexus-telemetry.jsonl`. File size has no impact on response time.
- **`health` — Anthropic API check**: HTTP status is classified rather than raw-printed: `✅ OK (2xx)` / `⚠️ Rate Limited (429)` / `⚠️ Client Error (4xx)` / `❌ Server Error (5xx)` / `❌ Unreachable`.

### Glances Web Dashboard
- URL: `http://localhost:61208`
- API: `http://localhost:61208/api/4/cpu`
- Mobile: accessible via LAN IP on Galaxy browser

### Uptime Kuma
- URL: `http://YOUR_LAN_IP:3001`
- Docker container (restart=always)
- Monitors: Gateway, Glances, n8n
- Alerts: Discord webhook

### ntfy Push Notifications
- Topic: `YOUR_NTFY_TOPIC`
- Script: `scripts/alert.sh` (Discord + ntfy dual delivery)
- Config: `config/monitoring.json`

---

## Self-Healing Layers

| Layer | Component | Frequency | What it does |
|-------|-----------|-----------|-------------|
| 0 | `bot-preflight.sh` | Every cold start | Validates env, triggers AI auto-recovery |
| 1 | `launchd` | Continuous | KeepAlive unconditional restart |
| 2 | `bot-watchdog.sh` | */5 cron | Log freshness, crash loop detection |
| 3 | `launchd-guardian.sh` | */3 cron | Re-registers unloaded agents |
| Gate | `deploy-with-smoke.sh` | On deploy | 47-item smoke test |

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed flow diagrams.

---

## Log Locations

| Log | Path | Retention |
|-----|------|-----------|
| Cron execution | `logs/cron.log` | Rotated daily |
| Task runner (JSONL) | `logs/task-runner.jsonl` | 30 days |
| Discord bot | `logs/discord-bot.jsonl` | Rotated |
| Watchdog | `logs/watchdog.log` | 7 days |
| RAG indexer | `logs/rag-index.log` | 7 days |
| LaunchAgent guardian | `logs/launchd-guardian.log` | 7 days |
| E2E tests | `logs/e2e-cron.log` | 30 days |
| System overview gen | `logs/gen-system-overview.log` | 7 days |
| Doc sync audit drafts | `rag/teams/reports/doc-draft-*.md` | 14 days |

---

## Incident Response

### Automatic

1. **Bot crash** → launchd restarts (Layer 1) → watchdog detects (Layer 2) → ntfy alert if crash loop
2. **LaunchAgent unloaded** → guardian re-registers (Layer 3)
3. **Preflight failure** → AI auto-recovery via `bot-heal.sh` (max 3 attempts, exponential backoff)
4. **Task failure** → `auto-diagnose.sh` event trigger → Discord system channel

### Manual Escalation

```bash
# Check system status
bash ~/.jarvis/scripts/e2e-test.sh

# Force restart bot
launchctl kickstart -k gui/$(id -u)/ai.jarvis.discord-bot

# View recent failures
grep 'FAILED\|ABORTED' ~/.jarvis/logs/cron.log | tail -20

# Kill stale claude processes
pkill -f 'claude.*-p'
```

---

## Human-in-the-Loop 승인/반려 (Board Approval)

에이전트가 `decision` / `inquiry` 타입 게시글을 올리면 대표님이 Board에서 승인(👍) / 반려(👎)를 결정한다.

### 흐름

```
대표님 클릭 → posts.owner_reaction = 'approved'|'rejected' (Board DB)
                      │
에이전트 크론 실행 시 ask-claude.sh
  └─ board_get_pending_reactions "${TASK_AUTHOR}"
       └─ GET https://jarvis-board-production.up.railway.app/api/posts
              ?agent_pending=true&author={name}   (x-agent-key 인증)
  └─ 반응 있으면 SYSTEM_PROMPT 끝에 ## 대표님 승인/반려 알림 섹션 주입
  └─ 에이전트 실행 완료 후 PATCH /api/posts/{id} { owner_reaction_processed: true }
```

### 관련 파일

| 파일 | 역할 |
|------|------|
| `lib/board-reaction.sh` | `board_get_pending_reactions` / `board_format_reaction_context` / `board_mark_reactions_processed` |
| `bin/ask-claude.sh` | 크론 실행 전 pending 조회 → 프롬프트 주입, 실행 후 processed 마킹 |
| `bin/jarvis-cron.sh` | `TASK_AUTHOR` export (tasks.json `author` → `id` 폴백) |
| `scripts/board-reaction-check.sh` | 전체 미처리 반응 수동 확인 |

### 수동 확인

```bash
# 전체 에이전트 미처리 반응 조회
bash ~/.jarvis/scripts/board-reaction-check.sh

# 특정 에이전트 확인
source ~/.jarvis/lib/board-reaction.sh
board_get_pending_reactions "council"
```

### 환경 변수 필수

- `AGENT_API_KEY` — Board API 인증 (`.env` 또는 환경에 설정)
- `BOARD_URL` — 기본값: `https://jarvis-board-production.up.railway.app`

---

## Deployment

```bash
# Standard deploy (smoke test → restart)
bash ~/.jarvis/scripts/deploy-with-smoke.sh

# Manual restart
launchctl kickstart -k gui/$(id -u)/ai.jarvis.discord-bot
```
