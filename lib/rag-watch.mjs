#!/usr/bin/env node
/**
 * rag-watch.mjs — RAG Watcher daemon
 *
 * Real-time Jarvis-Vault → LanceDB sync.
 * Watches ~/Jarvis-Vault/ for .md changes → immediate RAGEngine.indexFile()
 *
 * Runs as a persistent LaunchAgent (ai.jarvis.rag-watcher).
 * Loads OPENAI_API_KEY from ~/.jarvis/discord/.env
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import chokidar from 'chokidar';
import { RAGEngine } from './rag-engine.mjs';

// ─── Config ───────────────────────────────────────────────────────────────────

const BOT_HOME = process.env.BOT_HOME || join(homedir(), '.jarvis');
const VAULT_PATH = join(homedir(), 'Jarvis-Vault');
const ENV_PATH = join(BOT_HOME, 'discord', '.env');
const DB_PATH = join(BOT_HOME, 'rag', 'lancedb');

// Debounce: skip same-file re-index within 2 seconds
const DEBOUNCE_MS = 2000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toISOString();
}

function log(msg) {
  console.log(`[${ts()}] [rag-watch] ${msg}`);
}

function warn(msg) {
  console.warn(`[${ts()}] [rag-watch] WARN: ${msg}`);
}

function err(msg) {
  console.error(`[${ts()}] [rag-watch] ERROR: ${msg}`);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

// Load .env before anything touches process.env
config({ path: ENV_PATH });

if (!process.env.OPENAI_API_KEY) {
  err(`OPENAI_API_KEY not set. Check ${ENV_PATH}`);
  process.exit(1);
}

if (!existsSync(VAULT_PATH)) {
  err(`Vault directory not found: ${VAULT_PATH}`);
  err('Create ~/Jarvis-Vault/ first, then restart this daemon.');
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`Starting — vault: ${VAULT_PATH}`);

  const engine = new RAGEngine(DB_PATH);
  await engine.init();

  const stats = await engine.getStats();
  log(`RAG DB ready — ${stats.totalChunks} chunks from ${stats.totalSources} sources`);

  // Debounce map: filePath → timestamp of last indexing start
  const lastProcessed = new Map();

  // ─── File event handler ───────────────────────────────────────────────────

  async function handleChange(event, filePath) {
    const now = Date.now();
    const last = lastProcessed.get(filePath) || 0;

    if (now - last < DEBOUNCE_MS) {
      log(`Debounce skip (${event}): ${filePath}`);
      return;
    }

    lastProcessed.set(filePath, now);

    try {
      const chunks = await engine.indexFile(filePath);
      log(`Indexed (${event}): ${filePath} → ${chunks} chunks`);
    } catch (indexErr) {
      err(`Failed to index (${event}): ${filePath} — ${indexErr.message}`);
    }
  }

  // ─── Chokidar watcher ────────────────────────────────────────────────────

  // Note: chokidar v5 does not resolve '**' globs against an absolute base path.
  // Watch the directory directly and filter .md in handlers.
  const watcher = chokidar.watch(VAULT_PATH, {
    ignored: /(^|[/\\])\../,       // ignore dotfiles/dotdirs
    persistent: true,
    ignoreInitial: true,            // skip initial scan (cron handles full index)
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  const onlyMd = (handler) => (filePath) => {
    if (!filePath.endsWith('.md')) return;
    handler(filePath);
  };

  watcher
    .on('add', onlyMd((filePath) => handleChange('add', filePath)))
    .on('change', onlyMd((filePath) => handleChange('change', filePath)))
    .on('unlink', onlyMd(async (filePath) => {
      try {
        await engine.deleteBySource(filePath);
        log(`File deleted: ${filePath} — removed from index`);
      } catch (e) {
        warn(`File deleted: ${filePath} — index removal failed: ${e.message}`);
      }
    }))
    .on('error', (watchErr) => {
      err(`Watcher error: ${watchErr.message}`);
    })
    .on('ready', () => {
      log('Watcher ready — watching for .md changes');
    });

  // ─── Graceful shutdown ───────────────────────────────────────────────────

  async function shutdown(signal) {
    log(`Received ${signal} — shutting down gracefully`);
    await watcher.close();
    log('Watcher closed. Goodbye.');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((fatalErr) => {
  err(`Fatal: ${fatalErr.message}`);
  err(fatalErr.stack);
  process.exit(1);
});
