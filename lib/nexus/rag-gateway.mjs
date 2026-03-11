/**
 * nexus/rag-gateway.mjs — RAG 벡터검색 게이트웨이
 * 도구: rag_search
 */

import { join } from 'node:path';
import { BOT_HOME, mkResult, mkError, logTelemetry } from './shared.mjs';

// ---------------------------------------------------------------------------
// RAGEngine singleton
// ---------------------------------------------------------------------------
let _ragEngine = null;

async function getRAGEngine() {
  if (_ragEngine) return _ragEngine;
  const { RAGEngine } = await import('../rag-engine.mjs');
  const rag = new RAGEngine(join(BOT_HOME, 'rag', 'lancedb'));
  try {
    await rag.init();
  } catch (err) {
    _ragEngine = null;
    throw err;
  }
  _ragEngine = rag;
  return rag;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
export const TOOLS = [
  {
    name: 'rag_search',
    description:
      'Jarvis 장기 메모리 검색. 오너의 이전 대화, 기록된 사실, 개인 설정, 프로젝트 컨텍스트를 의미론적으로 검색. ' +
      '기억 관련 질문("저번에", "내가 말했던", "기억해?"), 개인 맥락이 필요한 질문, ' +
      '과거 대화 참조 시 반드시 먼저 호출하라. ' +
      'BM25 전문검색(1순위) + 벡터 유사도(보조) 하이브리드 검색. Jina 리랭킹 자동 적용.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색할 자연어 쿼리' },
        limit: { type: 'number', description: '반환할 결과 수 (기본 5, 최대 10)', default: 5 },
      },
      required: ['query'],
    },
  },
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function handle(name, args, start) {
  if (name !== 'rag_search') return null;

  const { query, limit = 5 } = args;
  if (!query || !query.trim()) {
    logTelemetry('rag_search', Date.now() - start, { error: 'empty_query' });
    return mkError('query가 비어있습니다.', { query });
  }

  try {
    const rag = await getRAGEngine();
    const results = await rag.search(query.trim(), Math.min(Number(limit) || 5, 10));
    if (results.length === 0) {
      logTelemetry('rag_search', Date.now() - start, { results: 0, query });
      return mkResult(`"${query}" 관련 기억 없음.`, { results: 0, query });
    }
    const formatted = results.map((r, i) => {
      const source = r.source.split('/').slice(-2).join('/');
      const header = r.headerPath ? ` [${r.headerPath}]` : '';
      return `[${i + 1}] ${source}${header}\n${r.text.slice(0, 600)}`;
    }).join('\n\n---\n\n');
    logTelemetry('rag_search', Date.now() - start, { results: results.length, query });
    return mkResult(`검색: "${query}" → ${results.length}개\n\n${formatted}`, { results: results.length, query });
  } catch (err) {
    const msg = err.message || '';
    let errText;
    if (/401|403|auth/i.test(msg)) {
      errText = 'API 인증 오류 — OPENAI_API_KEY 확인 필요';
    } else if (/ENOENT|connect/i.test(msg)) {
      errText = 'DB 연결 실패 — LanceDB 경로 확인';
    } else {
      errText = `RAG 검색 오류: ${msg}`;
    }
    logTelemetry('rag_search', Date.now() - start, { error: msg, query });
    return mkError(errText, { query });
  }
}
