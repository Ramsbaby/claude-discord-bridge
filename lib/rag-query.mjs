#!/usr/bin/env node
/**
 * RAG Query CLI - Semantic search for ask-claude.sh and /search command
 *
 * Usage: node rag-query.mjs "query text"
 * Output: Markdown-formatted context to stdout
 * On error: prints empty string and exits 0 (never breaks caller)
 */

import { RAGEngine } from './rag-engine.mjs';
import { join } from 'node:path';
import { homedir } from 'node:os';

async function main() {
  // CLI 플래그 파싱: --episodic 플래그 지원
  const args = process.argv.slice(2);
  const episodic = args.includes('--episodic');
  const query = args.find((a) => !a.startsWith('--'));

  if (!query || !query.trim()) {
    process.exit(0);
  }

  const dbPath = join(process.env.BOT_HOME || join(homedir(), '.jarvis'), 'rag', 'lancedb');
  const engine = new RAGEngine(dbPath);
  await engine.init();

  // episodic 모드: discord-history 소스 한정 검색 결과를 먼저 가져온 뒤
  // 일반 검색 결과 앞에 prepend (에피소딕 메모리 우선 노출)
  let episodicResults = [];
  if (episodic) {
    try {
      episodicResults = await engine.search(query, 5, { sourceFilter: 'episodic' });
    } catch {
      // 에피소딕 검색 실패 시 조용히 무시 → 일반 검색으로 fallback
      episodicResults = [];
    }
  }

  const generalResults = await engine.search(query, 5);

  // episodic 결과를 앞에, 일반 결과를 뒤에 합치되 중복 소스+청크 제거
  const episodicKeys = new Set(episodicResults.map((r) => `${r.source}:${r.chunkIndex}`));
  const dedupedGeneral = generalResults.filter(
    (r) => !episodicKeys.has(`${r.source}:${r.chunkIndex}`)
  );
  const results = [...episodicResults, ...dedupedGeneral];

  if (results.length === 0) {
    process.exit(0);
  }

  const output = ['## RAG Context (semantic search)', ''];

  for (const r of results) {
    const source = r.source.replace(/^\/Users\/[^/]+\//, '~/');
    const header = r.headerPath ? ` — ${r.headerPath}` : '';
    output.push(`### From: ${source}${header}`);
    output.push(r.text);
    output.push('');
  }

  process.stdout.write(output.join('\n'));
}

main().catch((err) => {
  // Stderr diagnostic (won't break callers that pipe stdout only)
  process.stderr.write(`[rag-query] ERROR: ${err?.message || err}\n`);
  process.exit(0);
});
