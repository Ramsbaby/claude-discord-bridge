#!/usr/bin/env node
/**
 * mcp-workgroup.mjs — Workgroup AI Board MCP Gateway
 *
 * 자비스가 외부 AI 커뮤니티 게시판(workgroup.jangwonseok.com)에 참여할 수 있도록
 * Workgroup REST API를 MCP 도구로 노출합니다.
 *
 * ┌─ 보안 계층 ──────────────────────────────────────────────────────┐
 * │ 1. Privacy Guard   발신 콘텐츠에서 민감 정보 패턴 감지 시 즉시 차단    │
 * │ 2. Read-only safe  조회(wg_me/wg_feed/wg_get_post)는 필터 미적용   │
 * │ 3. Rate limit      API 429 응답 → 에러 반환 (자동 재시도 없음)       │
 * │ 4. Credentials     config/secrets/workgroup.json (gitignored)    │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * Tools:
 *   wg_me          — 본인 프로필 및 쿨다운 상태 조회
 *   wg_feed        — 게시판 최신 이벤트 조회
 *   wg_get_post    — 특정 게시글 상세 조회
 *   wg_comment     — 댓글 작성 (Privacy Guard 적용)
 *   wg_create_post — 새 글 작성 (Privacy Guard 적용)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BOT_HOME = process.env.BOT_HOME ?? join(process.env.HOME, '.jarvis');
const SECRETS_PATH = join(BOT_HOME, 'config', 'secrets', 'workgroup.json');

// ── 크리덴셜 로드 ──────────────────────────────────────────────────────────────
let credentials;
try {
  credentials = JSON.parse(readFileSync(SECRETS_PATH, 'utf-8'));
} catch (e) {
  process.stderr.write(`[mcp-workgroup] FATAL: secrets 로드 실패 (${SECRETS_PATH}): ${e.message}\n`);
  process.exit(1);
}

const { clientId, clientSecret, apiBase } = credentials;

if (!clientId || !clientSecret || !apiBase) {
  process.stderr.write('[mcp-workgroup] FATAL: workgroup.json에 clientId/clientSecret/apiBase 필드가 없습니다.\n');
  process.exit(1);
}

// ── Privacy Guard ─────────────────────────────────────────────────────────────
// 발신 content/title에만 적용. 읽기 전용 응답(wg_feed 등)에는 적용하지 않음.
const SENSITIVE_PATTERNS = [
  // 전화번호 — 구분자 하이픈·공백·점·괄호 모두 커버
  { re: /01[016789][\s.\-()]?\d{3,4}[\s.\-]?\d{4}/, label: '전화번호' },
  // 주민번호 — 구분자 하이픈·공백 커버
  { re: /\d{6}[\s\-][1-4]\d{6}/, label: '주민번호' },
  // API키·토큰: 48자 이상 연속 hex
  { re: /[0-9a-f]{48,}/i, label: 'API키·토큰 의심 문자열' },
  // JWT 토큰 — eyJ 시작 base64url 3파트 구조
  { re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/, label: 'JWT 토큰' },
  // prefix 기반 API키 — OpenAI(sk-proj-), Anthropic(sk-ant-), GitHub PAT(ghp_/gho_/ghs_)
  { re: /\b(sk-[a-zA-Z0-9\-]{20,}|gh[pos]_[a-zA-Z0-9]{36,})/, label: 'API키 (sk-/ghp- 계열)' },
  // 개인 파일 경로 — secrets/ 및 개인 문서 경로
  { re: /\/Users\/[a-zA-Z0-9._-]+\/(\.jarvis\/config\/secrets|Documents\/|Desktop\/)/, label: '개인 파일 경로' },
  // 한국 주소 패턴
  { re: /[가-힣]+(시|도|군|구)\s*[가-힣]+(구|군|읍|면|동|로|길)\s*\d+/, label: '주소' },
  // 금액/수입 (숫자 + 단위)
  { re: /\d[\d,]*\s*(만원|억원|천만원|백만원|원\/시간|원\/월|달러\/월|달러\/시간)/, label: '금액·수입 정보' },
  // 이메일 주소
  { re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, label: '이메일' },
  // 이직·연봉 협상 등 커리어 민감 키워드
  { re: /이직\s*(목표|연봉|조건|협상)|희망\s*연봉|연봉\s*협상/, label: '커리어·연봉 정보' },
];

/**
 * 발신 텍스트에서 민감 패턴 감지 시 Error를 던집니다.
 * @param {string} text
 * @param {string} fieldName 로그용 필드명
 */
function guardContent(text, fieldName = 'content') {
  if (!text) return;
  const blocked = SENSITIVE_PATTERNS
    .filter(({ re }) => re.test(text))
    .map(({ label }) => label);
  if (blocked.length > 0) {
    throw new Error(
      `[보안 필터] ${fieldName}에서 민감 정보가 감지되어 전송이 차단됩니다: ${blocked.join(', ')}\n` +
      '해당 내용을 제거하거나 일반적인 표현으로 바꾼 후 다시 시도해 주세요.',
    );
  }
}

// ── API 헬퍼 ───────────────────────────────────────────────────────────────────
const BASE_HEADERS = {
  'CF-Access-Client-Id': clientId,
  'CF-Access-Client-Secret': clientSecret,
  'Content-Type': 'application/json',
};

async function apiGet(path) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: BASE_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: BASE_HEADERS,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 429) {
    const next = data.nextAvailableAt ?? data.cooldown?.nextAvailableAt ?? 'unknown';
    throw new Error(`쿨다운 중 — 다음 가능 시각: ${next}`);
  }
  if (res.status === 403) {
    throw new Error('403 금지됨 — 핑퐁 제한(동일 스레드 연속 댓글) 또는 권한 없음');
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Tool 구현 ─────────────────────────────────────────────────────────────────

async function wgMe() {
  const data = await apiGet('/api/me');
  return JSON.stringify(data, null, 2);
}

async function wgFeed({ since, limit = 20 }) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (since) params.set('since', since);
  const data = await apiGet(`/api/feed?${params}`);
  return JSON.stringify(data, null, 2);
}

async function wgGetPost({ postId }) {
  if (!postId) throw new Error('postId는 필수 파라미터입니다.');
  if (!/^[a-zA-Z0-9_-]+$/.test(postId)) throw new Error('postId 형식이 올바르지 않습니다.');
  const data = await apiGet(`/api/posts/${postId}`);
  return JSON.stringify(data, null, 2);
}

async function wgComment({ postId, content, parentId }) {
  if (!postId) throw new Error('postId는 필수 파라미터입니다.');
  if (!/^[a-zA-Z0-9_-]+$/.test(postId)) throw new Error('postId 형식이 올바르지 않습니다.');
  if (parentId && !/^[a-zA-Z0-9_-]+$/.test(parentId)) throw new Error('parentId 형식이 올바르지 않습니다.');
  if (!content?.trim()) throw new Error('content는 필수 파라미터입니다.');

  guardContent(content, 'content'); // 🔒 Privacy Guard

  const body = { content: content.trim() };
  if (parentId) body.parentId = parentId;
  const result = await apiPost(`/api/posts/${postId}/comments`, body);
  return `댓글 작성 완료 — id: ${result.id ?? '?'}, postId: ${postId}`;
}

async function wgCreatePost({ title, content }) {
  if (!title?.trim()) throw new Error('title은 필수 파라미터입니다.');
  if (!content?.trim()) throw new Error('content는 필수 파라미터입니다.');

  guardContent(title, 'title');     // 🔒 Privacy Guard
  guardContent(content, 'content'); // 🔒 Privacy Guard

  const result = await apiPost('/api/posts', {
    title: title.trim(),
    content: content.trim(),
  });
  return `글 작성 완료 — id: ${result.id ?? '?'}, 제목: ${title}`;
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: 'workgroup', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'wg_me',
      description:
        '본인 프로필 및 쿨다운 상태를 조회합니다. 댓글·글 작성 전 쿨다운 여부를 먼저 확인하세요.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'wg_feed',
      description:
        '게시판 최신 이벤트(새 글, 새 댓글)를 조회합니다. since를 지정하면 해당 시각 이후 이벤트만 반환합니다.',
      inputSchema: {
        type: 'object',
        properties: {
          since: {
            type: 'string',
            description: 'ISO 8601 타임스탬프 (예: 2026-03-19T10:00:00Z). 이 시각 이후 이벤트만 반환.',
          },
          limit: {
            type: 'number',
            description: '최대 반환 이벤트 수 (기본 20, 최대 50)',
          },
        },
      },
    },
    {
      name: 'wg_get_post',
      description: '특정 게시글의 상세 내용과 댓글을 조회합니다.',
      inputSchema: {
        type: 'object',
        required: ['postId'],
        properties: {
          postId: { type: 'string', description: '조회할 게시글 ID' },
        },
      },
    },
    {
      name: 'wg_comment',
      description:
        '게시글에 댓글을 작성합니다. ' +
        '⚠️ Privacy Guard 적용: 전화번호·주소·이메일·API키·금액 등 민감 정보가 포함되면 자동 차단됩니다.',
      inputSchema: {
        type: 'object',
        required: ['postId', 'content'],
        properties: {
          postId: { type: 'string', description: '댓글을 달 게시글 ID' },
          content: { type: 'string', description: '댓글 내용 (마크다운 지원)' },
          parentId: {
            type: 'string',
            description: '대댓글인 경우 부모 댓글 ID (선택)',
          },
        },
      },
    },
    {
      name: 'wg_create_post',
      description:
        '새 게시글을 작성합니다. ' +
        '⚠️ Privacy Guard 적용: 민감 정보가 포함되면 자동 차단됩니다.',
      inputSchema: {
        type: 'object',
        required: ['title', 'content'],
        properties: {
          title: { type: 'string', description: '게시글 제목' },
          content: { type: 'string', description: '본문 내용 (마크다운 지원)' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let result;
    switch (name) {
      case 'wg_me':          result = await wgMe();               break;
      case 'wg_feed':        result = await wgFeed(args);         break;
      case 'wg_get_post':    result = await wgGetPost(args);      break;
      case 'wg_comment':     result = await wgComment(args);      break;
      case 'wg_create_post': result = await wgCreatePost(args);   break;
      default:
        return {
          content: [{ type: 'text', text: `알 수 없는 도구: ${name}` }],
          isError: true,
        };
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `오류: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[mcp-workgroup] 준비 완료 — Workgroup AI Board MCP Gateway\n');
