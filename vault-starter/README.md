# Jarvis Vault Starter Kit

Template Obsidian vault for Jarvis AI knowledge management.

## Setup

1. Copy this directory to your desired location:
   ```bash
   cp -r vault-starter ~/Jarvis-Vault
   ```

2. Open in Obsidian: Open Folder as Vault → select `~/Jarvis-Vault`

3. Install the Dataview community plugin (Settings → Community Plugins → Browse → "Dataview")

4. Configure vault sync in Jarvis:
   ```bash
   # During jarvis-init.sh, enter the vault path:
   ~/.jarvis/bin/jarvis-init.sh
   # Step 5: Vault path → ~/Jarvis-Vault
   ```

## Structure

```
Jarvis-Vault/
├── Home.md                 # Dashboard with Dataview queries
├── 01-system/              # System health, infra reports
├── 02-daily/
│   ├── standup/            # Morning standup reports
│   └── insights/           # AI-extracted insights
├── 03-teams/               # Weekly team reports
├── 04-learning/            # Study notes, tutorials
├── 05-career/              # Career tracking, job market
└── 06-knowledge/
    └── adr/                # Architecture Decision Records
```

## Auto-Sync

Jarvis automatically syncs cron task results to this vault via `vault-sync.sh`.
Reports get frontmatter and wiki-links injected automatically.
