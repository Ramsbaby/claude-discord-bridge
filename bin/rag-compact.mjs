#!/usr/bin/env node
/**
 * rag-compact.mjs — Weekly LanceDB compaction + FTS rebuild
 *
 * Reclaims physical space from deleted rows and rebuilds the FTS index.
 * Intended for weekly cron execution.
 *
 * Usage: node ~/.jarvis/bin/rag-compact.mjs
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { config } from 'dotenv';

const BOT_HOME = process.env.BOT_HOME || join(homedir(), '.jarvis');
config({ path: join(BOT_HOME, 'discord', '.env') });

const { RAGEngine } = await import(join(BOT_HOME, 'lib', 'rag-engine.mjs'));

const startTime = Date.now();
const engine = new RAGEngine(join(BOT_HOME, 'rag', 'lancedb'));
await engine.init();

const statsBefore = await engine.getStats();
console.log(`[rag-compact] Before: ${statsBefore.totalChunks} chunks, ${statsBefore.totalSources} sources`);

await engine.compact();

const statsAfter = await engine.getStats();
const duration = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`[rag-compact] After: ${statsAfter.totalChunks} chunks, ${statsAfter.totalSources} sources (${duration}s)`);
console.log('[rag-compact] Compaction complete');

process.exit(0);
