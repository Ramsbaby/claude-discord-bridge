#!/usr/bin/env node
/**
 * mcp-nexus.mjs — Context Intelligence Gateway
 *
 * All system queries pass through this gateway.
 * Raw output (315KB) -> compressed (5.4KB) -> Claude context
 *
 * Implements and extends the Context Mode concept:
 * - Smart compression (auto-detects log/json/process/table types)
 * - scan(): parallel multi-command execution -> single context entry
 * - TTL cache: prevents duplicate execution within 30 seconds
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn, execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BOT_HOME = join(process.env.BOT_HOME || join(homedir(), '.claude-discord-bridge'));
const LOGS_DIR = join(BOT_HOME, 'logs');

const LOG_ALIASES = {
  'discord-bot':  join(LOGS_DIR, 'discord-bot.out.log'),
  'discord':      join(LOGS_DIR, 'discord-bot.out.log'),
  'cron':         join(LOGS_DIR, 'cron.log'),
  'watchdog':     join(LOGS_DIR, 'watchdog.log'),
  'bot-watchdog': join(LOGS_DIR, 'bot-watchdog.log'),
  'guardian':     join(LOGS_DIR, 'launchd-guardian.log'),
  'rag':          join(LOGS_DIR, 'rag-index.log'),
  'e2e':          join(LOGS_DIR, 'e2e-cron.log'),
  'health':       join(LOGS_DIR, 'health.log'),
};

// ---------------------------------------------------------------------------
// TTL Cache
// ---------------------------------------------------------------------------
const cache = new Map(); // key: cmd, value: { output, expiresAt }

function getCached(cmd) {
  const entry = cache.get(cmd);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cmd);
    return null;
  }
  return entry;
}

function setCached(cmd, output, ttlMs) {
  cache.set(cmd, { output, expiresAt: Date.now() + ttlMs });
}

// Periodically purge expired entries (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) {
    if (now > v.expiresAt) cache.delete(k);
  }
}, 300_000).unref();

// ---------------------------------------------------------------------------
// Smart Compress — Auto-detect output type + strategy-based compression
// ---------------------------------------------------------------------------

function detectStrategy(output) {
  if (!output || output.length < 10) return 'plain';
  const trimmed = output.trimStart();
  // Detect JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  // Detect process list (ps aux pattern)
  if (/\bPID\b/.test(trimmed.split('\n')[0]) || /^\S+\s+\d+\s+\d+\.\d+\s+\d+\.\d+/.test(trimmed.split('\n')[1] || '')) return 'process';
  // Detect log (timestamp + level pattern)
  const logPattern = /\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}|(\b(ERROR|WARN|INFO|DEBUG)\b)/;
  const lines = trimmed.split('\n').slice(0, 10);
  const logMatches = lines.filter(l => logPattern.test(l)).length;
  if (logMatches >= 3) return 'log';
  // Detect table (pipe delimiters)
  const tableMatches = lines.filter(l => (l.match(/\|/g) || []).length >= 2).length;
  if (tableMatches >= 3) return 'table';
  return 'plain';
}

function compressLog(text, maxLines = 50) {
  const lines = text.split('\n');
  const errors = [];
  const warns = [];
  for (const line of lines) {
    if (/\bERROR\b/i.test(line)) errors.push(line);
    else if (/\bWARN(ING)?\b/i.test(line)) warns.push(line);
  }
  const important = [...errors.slice(-5), ...warns.slice(-5)];
  const recent = lines.slice(-20);
  const summary = `[Log summary] ${lines.length} lines, ${errors.length} errors, ${warns.length} warnings`;
  const uniqueLines = [...new Set([...important, '---', ...recent])];
  const result = [summary, '', ...uniqueLines].join('\n');
  return result.split('\n').slice(0, maxLines).join('\n').trimEnd();
}

function compressJson(text, maxChars = 2000) {
  try {
    const obj = JSON.parse(text);
    const trimmed = JSON.stringify(obj, (key, val) => {
      // Depth limit: summarize nested objects/arrays
      if (typeof val === 'object' && val !== null) {
        const str = JSON.stringify(val);
        if (str.length > 500) {
          if (Array.isArray(val)) return `[Array(${val.length})]`;
          const keys = Object.keys(val);
          if (keys.length > 8) return `{${keys.slice(0, 5).join(', ')}... +${keys.length - 5}}`;
        }
      }
      return val;
    }, 2);
    if (trimmed.length <= maxChars) return trimmed;
    return trimmed.slice(0, maxChars) + '\n...[JSON truncated]';
  } catch {
    // JSON parse failed -> line-based fallback
    return compressPlain(text, 40);
  }
}

function compressProcess(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length <= 1) return text.trimEnd();
  const header = lines[0];
  const procs = lines.slice(1);
  // Group by command name (last field)
  const groups = {};
  for (const line of procs) {
    const parts = line.trim().split(/\s+/);
    const cmd = parts.slice(10).join(' ') || parts[parts.length - 1] || 'unknown';
    // Extract base command name only
    const base = cmd.split('/').pop().split(' ')[0];
    if (!groups[base]) groups[base] = 0;
    groups[base]++;
  }
  const summary = Object.entries(groups)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => count > 1 ? `  ${name} x${count}` : `  ${name}`)
    .join('\n');
  return `[Process summary] ${procs.length} total\n${summary}`;
}

function compressPlain(text, maxLines = 50) {
  if (!text) return '(empty)';
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text.trimEnd();
  const kept = lines.slice(-maxLines);
  return `...[${lines.length - maxLines} lines omitted]\n${kept.join('\n').trimEnd()}`;
}

function smartCompress(text, maxLines = 50) {
  if (!text) return '(empty)';
  const strategy = detectStrategy(text);
  switch (strategy) {
    case 'log':     return compressLog(text, maxLines);
    case 'json':    return compressJson(text);
    case 'process': return compressProcess(text);
    case 'table':   return compressPlain(text, maxLines); // Preserve tables line by line
    default:        return compressPlain(text, maxLines);
  }
}

// ---------------------------------------------------------------------------
// Command Execution (async, with timeout)
// ---------------------------------------------------------------------------

function runCmd(cmd, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const proc = spawn('bash', ['-c', cmd], {
      encoding: 'utf-8',
      timeout: timeoutMs,
      env: { ...process.env, PATH: process.env.PATH },
    });
    const MAX_BUF = 1 * 1024 * 1024; // 1MB per stream
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { if (stdout.length < MAX_BUF) stdout += d; });
    proc.stderr.on('data', (d) => { if (stderr.length < MAX_BUF) stderr += d; });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ ok: false, output: `[Timeout ${timeoutMs / 1000}s]`, exitCode: -1 });
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const combined = stdout + (stderr ? `\n[stderr] ${stderr.slice(0, 500)}` : '');
      resolve({ ok: code === 0, output: combined, exitCode: code });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `Error: ${err.message}`, exitCode: -1 });
    });
  });
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'nexus-cig', version: '2.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'exec',
      description:
        'Execute a command in a subprocess and return smart-compressed output. ' +
        'Auto-detects log/json/process/table types for optimal compression. ' +
        'Saves up to 98% context compared to raw Bash output.',
      inputSchema: {
        type: 'object',
        properties: {
          cmd: { type: 'string', description: 'Bash command to execute' },
          max_lines: {
            type: 'number',
            description: 'Maximum lines to return (default 50)',
            default: 50,
          },
          timeout_sec: {
            type: 'number',
            description: 'Timeout in seconds (default 10)',
            default: 10,
          },
        },
        required: ['cmd'],
      },
    },
    {
      name: 'scan',
      description:
        'Execute multiple commands in parallel -> merge into a single context entry. ' +
        'Use when querying multiple system states at once. ' +
        'Total response capped at 100 lines.',
      inputSchema: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'List of commands to execute',
            items: {
              type: 'object',
              properties: {
                cmd: { type: 'string', description: 'Bash command to execute' },
                label: { type: 'string', description: 'Section label (default: cmd)' },
                max_lines: { type: 'number', description: 'Max lines for this command (default 20)', default: 20 },
              },
              required: ['cmd'],
            },
          },
        },
        required: ['items'],
      },
    },
    {
      name: 'cache_exec',
      description:
        'Execute a command with TTL cache support. Returns cached result for repeated commands. ' +
        'Ideal for frequent system queries (ps, df, uptime, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          cmd: { type: 'string', description: 'Bash command to execute' },
          ttl_sec: {
            type: 'number',
            description: 'Cache TTL in seconds (default 30)',
            default: 30,
          },
          max_lines: {
            type: 'number',
            description: 'Maximum lines to return (default 50)',
            default: 50,
          },
        },
        required: ['cmd'],
      },
    },
    {
      name: 'log_tail',
      description:
        'Quickly read a log file by name. ' +
        'Names: discord-bot, discord, cron, watchdog, bot-watchdog, guardian, rag, e2e, health. ' +
        'Smart compression applied automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Log name or absolute path' },
          lines: {
            type: 'number',
            description: 'Number of lines to read (default 30)',
            default: 30,
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'health',
      description:
        'Summarize full system status in a single call. ' +
        'Includes LaunchAgent status, disk, memory, processes, recent cron runs. ' +
        'Error highlights + process summary included.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'file_peek',
      description:
        'Extract only lines around a pattern instead of the entire file. ' +
        'Use for reading specific sections from large files.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          pattern: { type: 'string', description: 'Pattern to search for (grep regex)' },
          context_lines: {
            type: 'number',
            description: 'Lines to show before/after match (default 3)',
            default: 3,
          },
          max_matches: {
            type: 'number',
            description: 'Maximum matches (default 10)',
            default: 10,
          },
        },
        required: ['path', 'pattern'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ----- exec -----
    if (name === 'exec') {
      const maxLines = args.max_lines ?? 50;
      const timeout = (args.timeout_sec ?? 10) * 1000;
      const { ok, output, exitCode } = await runCmd(args.cmd, timeout);
      const compressed = smartCompress(output, maxLines);
      const prefix = ok ? '' : `[exit ${exitCode}] `;
      return { content: [{ type: 'text', text: prefix + compressed }] };
    }

    // ----- scan -----
    if (name === 'scan') {
      const items = args.items || [];
      if (items.length === 0) {
        return { content: [{ type: 'text', text: '(no items)' }] };
      }
      const results = await Promise.all(
        items.map(async (item) => {
          const label = item.label || item.cmd;
          const maxL = item.max_lines ?? 20;
          const { ok, output, exitCode } = await runCmd(item.cmd, 10000);
          const compressed = smartCompress(output, maxL);
          const prefix = ok ? '' : `[exit ${exitCode}] `;
          return `=== ${label} ===\n${prefix}${compressed}`;
        }),
      );
      // Cap total at 100 lines
      const merged = results.join('\n\n');
      const mergedLines = merged.split('\n');
      if (mergedLines.length > 100) {
        return {
          content: [{ type: 'text', text: mergedLines.slice(0, 100).join('\n') + '\n...[100 line limit]' }],
        };
      }
      return { content: [{ type: 'text', text: merged }] };
    }

    // ----- cache_exec -----
    if (name === 'cache_exec') {
      const ttlSec = args.ttl_sec ?? 30;
      const maxLines = args.max_lines ?? 50;
      const cmd = args.cmd;

      const cached = getCached(cmd);
      if (cached) {
        const agoSec = Math.round((Date.now() - (cached.expiresAt - ttlSec * 1000)) / 1000);
        return { content: [{ type: 'text', text: `[Cached ${agoSec}s ago]\n${cached.output}` }] };
      }

      const { ok, output, exitCode } = await runCmd(cmd, 10000);
      const compressed = smartCompress(output, maxLines);
      const prefix = ok ? '' : `[exit ${exitCode}] `;
      const result = prefix + compressed;
      setCached(cmd, result, ttlSec * 1000);
      return { content: [{ type: 'text', text: result }] };
    }

    // ----- log_tail -----
    if (name === 'log_tail') {
      const lines = args.lines ?? 30;
      const filePath = args.name.startsWith('/') ? args.name : LOG_ALIASES[args.name];
      if (!filePath) {
        const available = Object.keys(LOG_ALIASES).join(', ');
        return { content: [{ type: 'text', text: `Unknown log: ${args.name}\nAvailable: ${available}` }] };
      }
      if (!existsSync(filePath)) {
        return { content: [{ type: 'text', text: `Log file not found: ${filePath}` }] };
      }
      const output = await new Promise((resolve) => {
        execFile('tail', ['-n', String(lines), filePath], { timeout: 5000, encoding: 'utf-8' },
          (err, stdout) => resolve(stdout || (err ? `Error: ${err.message}` : '(empty)')));
      });
      const compressed = smartCompress(output, lines);
      return { content: [{ type: 'text', text: compressed }] };
    }

    // ----- health -----
    if (name === 'health') {
      const checks = [
        // LaunchAgents
        `echo "=== LaunchAgents ==="`,
        `launchctl list ${process.env.DISCORD_SERVICE || 'ai.claude-discord-bot'} 2>/dev/null | grep -E 'PID|Exit' || echo "discord-bot: NOT LOADED"`,
        `launchctl list ${process.env.WATCHDOG_SERVICE || 'ai.claude-discord-watchdog'} 2>/dev/null | grep -E 'PID|Exit' || echo "watchdog: NOT LOADED"`,
        // Disk/Memory
        `echo "=== Resources ==="`,
        `df -h / | tail -1 | awk '{print "Disk: "$5" used ("$3"/"$2")"}'`,
        `vm_stat | awk '/Pages free/{free=$3} /Pages active/{act=$3} END{printf "Mem free: %.1fGB\\n", (free+0)*4096/1073741824}'`,
        // Process summary (smart)
        `echo "=== Processes ==="`,
        `ps aux | awk 'NR>1{split($11,a,"/"); name=a[length(a)]; cnt[name]++} END{n=asorti(cnt,sorted); for(i=1;i<=n&&i<=10;i++) printf "%s x%d\\n",sorted[i],cnt[sorted[i]]}' 2>/dev/null || echo "(ps failed)"`,
        `echo ""`,
        `echo "Bot processes:"`,
        `pgrep -fl "discord-bot.js" | head -3 || echo "  discord-bot.js: not running"`,
        `pgrep -fl "claude.*-p" | head -3 || echo "  claude -p: not running"`,
        // Recent cron runs
        `echo "=== Recent Cron ==="`,
        `tail -5 "${join(LOGS_DIR, 'cron.log')}" 2>/dev/null || echo "(no cron log)"`,
        // health.json error highlights
        `echo "=== Status ==="`,
        `cat "${join(BOT_HOME, 'state', 'health.json')}" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k,v in d.items():
    if k=='checks': continue
    print(f'{k}: {v}')
if 'checks' in d:
    fails=[c for c in d['checks'] if c.get('status')!='ok']
    if fails:
        print('\\n[!] Failed checks:')
        for f in fails[:5]:
            print(f'  - {f.get(\"name\",\"??\")}: {f.get(\"status\",\"??\")}: {f.get(\"message\",\"\")}')
    else:
        print(f'All {len(d[\"checks\"])} checks OK')
" 2>/dev/null || echo "(health.json not found)"`,
      ];
      const { output } = await runCmd(checks.join(' && '), 15000);
      return { content: [{ type: 'text', text: smartCompress(output, 60) }] };
    }

    // ----- file_peek -----
    if (name === 'file_peek') {
      const ctx = String(args.context_lines ?? 3);
      const maxM = String(args.max_matches ?? 10);
      const expandedPath = args.path.replace('~', homedir());
      // Use execFile to avoid shell injection from pattern argument
      const { execFile } = await import('node:child_process');
      const output = await new Promise((resolve) => {
        execFile('grep', ['-n', '-m', maxM, '-E', args.pattern, expandedPath, '-A', ctx, '-B', ctx],
          { timeout: 5000, encoding: 'utf-8' },
          (err, stdout) => resolve(stdout || '(no match)'),
        );
      });
      return { content: [{ type: 'text', text: output.trimEnd() }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
