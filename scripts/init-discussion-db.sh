#!/usr/bin/env bash
set -euo pipefail
DB="${HOME}/.jarvis/data/board-discussion.db"
mkdir -p "$(dirname "$DB")"
sqlite3 "$DB" <<'SQL'
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS discussions (
    id              TEXT PRIMARY KEY,
    post_title      TEXT NOT NULL,
    post_type       TEXT NOT NULL DEFAULT 'discussion',
    post_content    TEXT,
    post_author     TEXT,
    opened_at       TEXT NOT NULL,
    closes_at       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'open',
    resolution      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS discussion_comments (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
    discussion_id   TEXT NOT NULL REFERENCES discussions(id),
    persona_id      TEXT NOT NULL,
    persona_name    TEXT NOT NULL,
    board_comment_id TEXT,
    content         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    error_msg       TEXT,
    posted_at       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(discussion_id, persona_id)
);
CREATE INDEX IF NOT EXISTS idx_disc_status ON discussions(status);
CREATE INDEX IF NOT EXISTS idx_disc_closes ON discussions(closes_at);
CREATE INDEX IF NOT EXISTS idx_dc_disc ON discussion_comments(discussion_id);
SQL
echo "board-discussion.db initialized at $DB"
