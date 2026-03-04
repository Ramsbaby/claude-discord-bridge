# Obsidian Auto-Sync Setup Guide

> Current status: Manual sync only (auto-sync not implemented)
> Goal: `rag/` directory <-> Obsidian Vault auto-sync

## Current Vault Structure

```
~/vault/ai-bot/      # Long-term memory (RAG indexed)
~/vault/ai-bot-docs/ # Bot design documents
```

## obsidian-git Plugin Installation (Recommended)

1. Obsidian -> Settings -> Community plugins -> Browse
2. Search "obsidian-git" -> Install -> Enable
3. Settings:
   - Auto pull interval: 10 min
   - Auto commit & push: Enable
   - Commit message: `vault backup: {{date}}`

## Alternative: iCloud Drive

Move Obsidian Vault to `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/`:
- Mac <-> iPhone <-> iPad auto sync
- Not compatible with Android devices (no iCloud support)

## Cross-Platform Sync (Android Devices)

- **Syncthing** (open source): Cross-platform file sync
  ```bash
  brew install syncthing
  ```
- Obsidian Android app + Syncthing for full cross-platform support
- Alternative: **Remotely Save** Obsidian plugin with S3, Dropbox, or WebDAV backend

## RAG Integration Status

- `rag/` directory is auto-indexed by `rag-index.mjs` every hour
- Edits made in Obsidian are reflected in RAG at the next hourly index run
- For real-time indexing: Use the `BOT_EXTRA_MEMORY` env var to add external paths

## External Memory Directory Integration (Optional)

To include a separate memory store (e.g., an Obsidian Vault) in RAG, add to `.env`:

```env
BOT_EXTRA_MEMORY=/path/to/your/memory/directory
```

`bin/rag-index.mjs` will auto-index `.md` files from that path.
