#!/usr/bin/env node
/**
 * RAG Indexer - Incremental indexing for the knowledge base
 *
 * Runs via cron (hourly). Only re-indexes files whose mtime changed.
 * Targets: context .md, rag .md, results (7 days)
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { config } from 'dotenv';

// Load .env for cron environment (OPENAI_API_KEY)
config({ path: join(process.env.BOT_HOME || join(homedir(), '.jarvis'), 'discord', '.env') });

if (!process.env.OPENAI_API_KEY) {
  console.error('[rag-index] FATAL: OPENAI_API_KEY not set. Check ~/.jarvis/discord/.env');
  process.exit(1);
}

import { RAGEngine } from '../lib/rag-engine.mjs';

const BOT_HOME = join(process.env.BOT_HOME || join(homedir(), '.jarvis'));
const STATE_FILE = join(BOT_HOME, 'rag', 'index-state.json');

async function loadState() {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveState(state) {
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getMtime(filePath) {
  try {
    const s = await stat(filePath);
    return s.mtimeMs;
  } catch {
    return null;
  }
}

async function main() {
  const startTime = Date.now();
  const engine = new RAGEngine(join(BOT_HOME, 'rag', 'lancedb'));
  await engine.init();

  const state = await loadState();
  let indexed = 0;
  let skipped = 0;

  // Collect all target files
  const { readdir } = await import('node:fs/promises');
  const { extname } = await import('node:path');
  const targets = [];

  // 1. Context files (top-level + discord-history subdir)
  try {
    const contextDir = join(BOT_HOME, 'context');
    const entries = await readdir(contextDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() && extname(e.name) === '.md') {
        targets.push(join(contextDir, e.name));
      }
    }
    // discord-history: 최근 7일치만 (파일이 날마다 누적됨)
    const histDir = join(contextDir, 'discord-history');
    try {
      const histFiles = await readdir(histDir);
      for (const f of histFiles) {
        if (extname(f) !== '.md') continue;
        const fPath = join(histDir, f);
        const mtime = await getMtime(fPath);
        if (mtime) {
          const ageDays = (Date.now() - mtime) / (1000 * 60 * 60 * 24);
          if (ageDays <= 7) targets.push(fPath);
        }
      }
    } catch { /* discord-history 아직 없으면 스킵 */ }
    // context/owner/ and context/career/ (오너 프로필, 커리어 데이터)
    for (const subDir of ['owner', 'career']) {
      try {
        const subDirPath = join(contextDir, subDir);
        const subEntries = await readdir(subDirPath);
        for (const f of subEntries) {
          if (extname(f) === '.md') targets.push(join(subDirPath, f));
        }
      } catch { /* dir may not exist */ }
    }
  } catch { /* dir may not exist */ }

  // 2. RAG memory files
  for (const f of ['memory.md', 'decisions.md', 'handoff.md']) {
    targets.push(join(BOT_HOME, 'rag', f));
  }

  // 3. Config 파일 (company-dna, autonomy-levels)
  for (const f of ['company-dna.md', 'autonomy-levels.md']) {
    targets.push(join(BOT_HOME, 'config', f));
  }

  // 4. 팀 보고서 & 공유 인박스 (팀 간 통신 이력)
  for (const dir of ['reports', 'shared-inbox']) {
    try {
      const dirPath = join(BOT_HOME, 'rag', 'teams', dir);
      const entries = await readdir(dirPath);
      for (const f of entries) {
        if (extname(f) === '.md') targets.push(join(dirPath, f));
      }
    } catch { /* dir may not exist */ }
  }
  // proposals-tracker
  targets.push(join(BOT_HOME, 'rag', 'teams', 'proposals-tracker.md'));

  // 5. 프로젝트 문서 (README, ROADMAP, docs/) — Jarvis가 시스템 구조를 알 수 있도록
  for (const f of ['README.md', 'ROADMAP.md']) {
    targets.push(join(BOT_HOME, f));
  }
  try {
    const docsDir = join(BOT_HOME, 'docs');
    const docFiles = await readdir(docsDir);
    for (const f of docFiles) {
      if (extname(f) === '.md') targets.push(join(docsDir, f));
    }
  } catch { /* docs/ 없으면 스킵 */ }

  // 5b. Jarvis-Vault (Obsidian Knowledge Hub) — 재귀 탐색
  async function collectVaultMd(dirPath, opts = {}) {
    const { maxAgeDays } = opts;
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.name.startsWith('.')) continue; // .obsidian 등 제외
        const fullPath = join(dirPath, e.name);
        if (e.isDirectory()) {
          await collectVaultMd(fullPath, opts); // 재귀 탐색
        } else if (extname(e.name) === '.md') {
          if (maxAgeDays) {
            const mtime = await getMtime(fullPath);
            if (!mtime || (Date.now() - mtime) / (1000 * 60 * 60 * 24) > maxAgeDays) continue;
          }
          targets.push(fullPath);
        }
      }
    } catch { /* dir may not exist */ }
  }
  try {
    const vaultBase = join(homedir(), 'Jarvis-Vault');
    // 상시 인덱싱: 01-system, 03-teams, 04-owner, 05-career, 06-knowledge (재귀)
    for (const dir of ['01-system', '03-teams', '04-owner', '05-career', '06-knowledge']) {
      await collectVaultMd(join(vaultBase, dir));
    }
    // 02-daily/insights: 최근 7일
    await collectVaultMd(join(vaultBase, '02-daily', 'insights'), { maxAgeDays: 7 });
    // 02-daily/kpi: 최근 30일
    await collectVaultMd(join(vaultBase, '02-daily', 'kpi'), { maxAgeDays: 30 });
    // 02-daily/standup: 최근 7일
    await collectVaultMd(join(vaultBase, '02-daily', 'standup'), { maxAgeDays: 7 });
  } catch { /* vault may not exist */ }

  // 5c. 사용자 커스텀 메모리 (선택적 외부 경로)
  // BOT_EXTRA_MEMORY 환경변수에 경로를 지정하면 해당 디렉토리도 인덱싱
  const extraMemoryPath = process.env.BOT_EXTRA_MEMORY;
  if (extraMemoryPath) {
    const extraFixed = [
      'domains/owner-profile.md', 'domains/system-preferences.md',
      'domains/decisions.md', 'domains/persona.md',
      'hot/HOT_MEMORY.md', 'lessons.md',
    ];
    for (const p of extraFixed) {
      targets.push(join(extraMemoryPath, p));
    }
    for (const dir of ['teams/reports', 'teams/learnings', 'career']) {
      try {
        const dirPath = join(extraMemoryPath, dir);
        const entries = await readdir(dirPath);
        for (const f of entries) {
          if (extname(f) !== '.md') continue;
          const fPath = join(dirPath, f);
          const mtime = await getMtime(fPath);
          if (mtime) {
            const ageDays = (Date.now() - mtime) / (1000 * 60 * 60 * 24);
            if (ageDays <= 14) targets.push(fPath);
          }
        }
      } catch { /* dir may not exist */ }
    }
  }

  // 6. Results (latest per task, max 7 days)
  try {
    const resultsDir = join(BOT_HOME, 'results');
    const taskDirs = await readdir(resultsDir, { withFileTypes: true });
    for (const td of taskDirs) {
      if (!td.isDirectory()) continue;
      const taskDir = join(resultsDir, td.name);
      const files = await readdir(taskDir);
      const mdFiles = files
        .filter((f) => extname(f) === '.md')
        .sort()
        .reverse()
        .slice(0, 1); // Latest only
      for (const f of mdFiles) {
        const fPath = join(taskDir, f);
        const mtime = await getMtime(fPath);
        if (mtime) {
          const ageDays = (Date.now() - mtime) / (1000 * 60 * 60 * 24);
          if (ageDays <= 7) targets.push(fPath);
        }
      }
    }
  } catch { /* dir may not exist */ }

  // Index changed files
  for (const filePath of targets) {
    const mtime = await getMtime(filePath);
    if (mtime === null) continue;

    // Skip if unchanged
    if (state[filePath] === mtime) {
      skipped++;
      continue;
    }

    try {
      const chunks = await engine.indexFile(filePath);
      indexed++;
      state[filePath] = mtime;
    } catch (err) {
      console.error(`Error indexing ${filePath}: ${err.message}`);
    }
  }

  await saveState(state);
  const stats = await engine.getStats();
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(
    `[${new Date().toISOString()}] RAG index: ${indexed} new/modified, ${skipped} unchanged, ${stats.totalChunks} total chunks, ${stats.totalSources} sources (${duration}s)`,
  );
}

main().catch((err) => {
  console.error(`RAG indexer failed: ${err.message}`);
  process.exit(1);
});
