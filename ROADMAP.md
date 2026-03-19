# Jarvis Roadmap

> Updated: 2026-03-19 | Architecture: [ADR Index](adr/ADR-INDEX.md)

## Vision

**AI Company-in-a-Box**: A self-hosted AI operations system that turns a Claude Max subscription into a 24/7 personal company with 12 AI teams, 63 cron tasks, and knowledge management — at $0 extra cost.

---

## Completed

### Phase 0: Foundation (2026-02 ~ 03)
- [x] Discord bot with streaming, multi-turn sessions, thread management
- [x] `claude -p` headless CLI wrapper (`ask-claude.sh`)
- [x] LanceDB hybrid RAG (vector + BM25, ~2000 chunks)
- [x] 29 cron tasks with retry, timeout, rate limiting (now 63)
- [x] 8 AI teams (Council, Career, Record, Brand, Academy, Infra, Trend) (now 12)
- [x] Company DNA, context-bus, shared-inbox inter-team communication
- [x] ntfy push notifications, Discord webhook routing (5 channels)
- [x] E2E test suite (50 checks)
- [x] Obsidian Vault integration with auto-sync, auto-linking, MOC generation

### Phase 1: LLM Gateway & Modularization (2026-03-06)
- [x] **LLM Gateway** ([ADR-006](adr/ADR-006.md)): Multi-provider fallback chain (claude-cli → Anthropic API → OpenAI → Ollama)
- [x] **Bash modularization**: Extracted `context-loader.sh`, `insight-recorder.sh`, `llm-gateway.sh` from monolithic ask-claude.sh
- [x] Cross-team dependency injection via `depends` field in tasks.json
- [x] Atomic file writes for rate-tracker (POSIX `os.replace`)

### Phase 2: Plugin System & Onboarding (2026-03-06)
- [x] **File-convention plugin system** ([ADR-007](adr/ADR-007.md)): `plugins/*/manifest.json` auto-merged into effective-tasks.json
- [x] **Lite/Company dual mode** ([ADR-008](adr/ADR-008.md)): 5-step interactive onboarding wizard
- [x] Plugin auto-regeneration on every cron run
- [x] Example plugins with documentation

### Phase 3: Open Source Preparation (2026-03-06)
- [x] Personal data audit — all hardcoded names, emails, paths removed from tracked files
- [x] Identity parameterization via `OWNER_NAME`, `GOOGLE_ACCOUNT` env vars
- [x] Rebrand from "claude-discord-bridge" to "Jarvis"
- [x] `.github/` setup (issue templates, PR template, CI workflow)
- [x] `CONTRIBUTING.md` with plugin creation guide
- [x] GitHub Actions CI (shellcheck + node syntax check)

---

### Phase 4: Developer Experience (2026-03-06)
- [x] `install.sh` one-command setup (npm install, LaunchAgent generation, crontab setup)
- [x] Obsidian Vault starter kit (template vault with Dataview queries)
- [x] Per-task model assignment (`model` field in tasks.json)
- [x] Docker Compose improvements (healthcheck, plugins volume, BOT_HOME env)

---

## Completed

### Phase 5: Intelligence & Autonomy (2026-03)
- [x] Decision dispatcher with team accountability scoring (`bin/decision-dispatcher.sh`)
- [x] Board meeting automation — daily CEO briefings + parallel execution (`bin/board-meeting.sh`, `bin/parallel-board-meeting.sh`)
- [ ] Feedback loop: task output quality → automatic prompt refinement
- [ ] Event-driven triggers (file change → task, not just cron)

---

## Planned

### Phase 6: Community & Ecosystem
- [ ] Plugin marketplace (community-contributed task packs)
- [ ] Multi-language support (system prompts, Discord locale)
- [ ] Web dashboard for task monitoring and configuration
- [ ] Migration guide from other Claude-Discord bridges

---

## Anti-Features (Things We Won't Build)

| Won't Build | Why |
|---|---|
| General-purpose chatbot | Jarvis is an operations system, not ChatGPT |
| 13+ Discord channels | Diminishing returns; 5-7 channels is optimal |
| Visual workflow builder | YAML/JSON config is simpler and version-controllable |
| Crypto/options trading | High-risk automation outside scope |
| Voice assistant mode | Text-first; voice adds complexity without proportional value |

---

## Architecture Decision Records

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](adr/ADR-001.md) | claude -p CLI architecture | accepted |
| [ADR-002](adr/ADR-002.md) | 4-layer token isolation | accepted |
| [ADR-003](adr/ADR-003.md) | File-based inter-agent communication | accepted |
| [ADR-004](adr/ADR-004.md) | Obsidian Vault knowledge base | accepted |
| [ADR-005](adr/ADR-005.md) | Stateless cron execution model | accepted |
| [ADR-006](adr/ADR-006.md) | LLM Gateway multi-provider | accepted |
| [ADR-007](adr/ADR-007.md) | File-convention plugin system | accepted |
| [ADR-008](adr/ADR-008.md) | Lite/Company dual mode | accepted |

---

*This is a living document. Updated as phases complete.*
