/**
 * extras-gateway.mjs — Discord send / cron trigger / memory lookup tools
 * Exposed via Nexus MCP server for external clients (Cursor, Claude Desktop)
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { mkResult, mkError, logTelemetry, BOT_HOME } from './shared.mjs';

const execFileAsync = promisify(execFile);

// Discord REST API용 토큰 로드 (discord/.env 우선)
async function loadDiscordToken() {
  const envPath = join(BOT_HOME, 'discord', '.env');
  try {
    const raw = await readFile(envPath, 'utf8');
    const m = raw.match(/^DISCORD_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch { /* fall through */ }
  return process.env.DISCORD_TOKEN || null;
}

// personas.json에서 채널명→ID 매핑 로드
async function loadChannelMap() {
  const personasPath = join(BOT_HOME, 'discord', 'personas.json');
  const raw = JSON.parse(await readFile(personasPath, 'utf8'));
  const map = {};
  for (const [channelId, persona] of Object.entries(raw)) {
    const m = persona.match(/--- Channel: (\S+)/);
    if (m) map[m[1]] = channelId;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
export const TOOLS = [
  {
    name: 'discord_send',
    description: 'Send a message to a Jarvis Discord channel',
    inputSchema: {
      type: 'object',
      properties: {
        channel: { type: 'string', description: 'Channel name (e.g. jarvis-ceo, jarvis)' },
        message: { type: 'string', description: 'Message content (markdown supported)' },
      },
      required: ['channel', 'message'],
    },
  },
  {
    name: 'run_cron',
    description: 'Immediately trigger a Jarvis scheduled job by name',
    inputSchema: {
      type: 'object',
      properties: {
        job: { type: 'string', description: 'Job name or id from tasks.json' },
      },
      required: ['job'],
    },
  },
  {
    name: 'get_memory',
    description: 'Semantic search Jarvis long-term memory (RAG)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
];

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** Discord 채널에 메시지 전송 (Discord REST API v10) */
async function discordSend({ channel, message }) {
  if (!channel || !message) throw new Error('channel and message required');

  const token = await loadDiscordToken();
  if (!token) throw new Error('DISCORD_TOKEN 없음 — discord/.env 확인 필요');

  const channelMap = await loadChannelMap();
  const channelId = channelMap[channel];
  if (!channelId) {
    throw new Error(`채널 '${channel}' 없음. 사용 가능: ${Object.keys(channelMap).join(', ')}`);
  }

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API 오류 ${res.status}: ${body}`);
  }

  const data = await res.json();
  return { ok: true, message_id: data.id, channel, channel_id: channelId };
}

/** 크론 작업 즉시 트리거 (tasks.json의 script 직접 실행) */
async function runCron({ job }) {
  if (!job) throw new Error('job name required');
  const tasksPath = join(BOT_HOME, 'config', 'tasks.json');
  const tasks = JSON.parse(await readFile(tasksPath, 'utf8'));
  const task = tasks.find(t => t.name === job || t.id === job);
  if (!task) {
    const names = tasks.slice(0, 20).map(t => t.name || t.id).join(', ');
    throw new Error(`job '${job}' 없음. 예시: ${names}…`);
  }
  if (!task.script) throw new Error(`'${job}' 에 script 필드 없음`);

  // 경로 정규화 (~/.jarvis 치환)
  const scriptPath = task.script.replace(/^~/, homedir());
  const { stdout } = await execFileAsync('bash', [scriptPath], {
    timeout: 60000,
    env: { ...process.env, BOT_HOME },
  });
  return { ok: true, job, script: task.script, output: stdout.trim().slice(0, 500) };
}

/** 자비스 메모리 키워드 검색 */
async function getMemory({ query, limit = 5 }) {
  if (!query) throw new Error('query required');
  const ragQueryPath = join(BOT_HOME, 'lib', 'rag-query.mjs');
  const { stdout } = await execFileAsync('node', [ragQueryPath, query], { timeout: 15000 });
  return { ok: true, query, results: stdout.trim() };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function handle(name, args, start) {
  const handlers = { discord_send: discordSend, run_cron: runCron, get_memory: getMemory };
  if (!(name in handlers)) return null;

  try {
    const result = await handlers[name](args ?? {});
    logTelemetry(name, Date.now() - start, {});
    return mkResult(JSON.stringify(result, null, 2));
  } catch (err) {
    logTelemetry(name, Date.now() - start, { error: err.message });
    return mkError(`오류: ${err.message}`, { tool: name });
  }
}
