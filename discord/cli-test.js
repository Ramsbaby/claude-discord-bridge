#!/usr/bin/env node
/**
 * cli-test.js — Local test mode for Jarvis Discord bot
 *
 * Tests slash commands and bot logic without a Discord token.
 * Useful for CI, development, and offline debugging.
 *
 * Usage:
 *   node cli-test.js              # interactive REPL
 *   node cli-test.js --run /status  # run one command and exit
 *   node cli-test.js --smoke-test   # run all commands and exit (CI mode)
 */

import readline from 'readline';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOT_HOME = process.env.BOT_HOME || path.resolve(__dirname, '..');

// ── Built-in command handlers (no Claude/Discord needed) ──────────────────────

async function handleStatus() {
    const healthPath = path.join(BOT_HOME, 'state', 'health.json');
    let health = {};
    try {
        health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    } catch {
        health = { error: 'health.json not found' };
    }

    const logsDir = path.join(BOT_HOME, 'logs');
    let logFiles = [];
    try {
        logFiles = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
    } catch {
        logFiles = [];
    }

    console.log('\n[STATUS]');
    console.log('  BOT_HOME:', BOT_HOME);
    console.log('  Health:  ', JSON.stringify(health, null, 2).replace(/\n/g, '\n           '));
    console.log('  Log files:', logFiles.join(', ') || '(none)');
}

async function handleSearch(query) {
    if (!query) { console.log('[SEARCH] Usage: /search <query>'); return; }

    let RAGEngine = null;
    try {
        const mod = await import(path.join(BOT_HOME, 'lib', 'rag-engine.mjs'));
        RAGEngine = mod.RAGEngine ?? mod.default;
    } catch {
        // not available
    }

    if (!RAGEngine) {
        console.log('[SEARCH] RAG engine not available (lancedb not installed — run: npm install lancedb)');
        return;
    }

    try {
        const engine = new RAGEngine({ botHome: BOT_HOME });
        const results = await engine.search(query, { limit: 3 });
        if (results.length === 0) {
            console.log('[SEARCH] No results found.');
        } else {
            for (const [i, r] of results.entries()) {
                console.log(`\n[RESULT ${i + 1}] score=${r.score?.toFixed(3) ?? '?'}`);
                console.log('  Source:', r.source || r.file || '(unknown)');
                console.log('  Text:  ', (r.text || r.content || '').slice(0, 200).replace(/\n/g, ' '));
            }
        }
    } catch (err) {
        console.error('[SEARCH] Error:', err.message);
    }
}

async function handleTasks() {
    const tasksPath = path.join(BOT_HOME, 'config', 'tasks.json');
    try {
        const data = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
        console.log('\n[TASKS]');
        for (const t of data.tasks || []) {
            console.log(`  ${t.id.padEnd(22)} schedule=${t.schedule}  priority=${t.priority || '-'}`);
        }
    } catch (err) {
        console.log('[TASKS] Could not read tasks.json:', err.message);
    }
}

async function handleHelp() {
    console.log(`
[COMMANDS]
  /status            Show system health and log files
  /search <query>    Search the RAG index (requires lancedb)
  /tasks             List configured cron tasks
  /env               Show loaded environment variables (redacted)
  /help              Show this help message
  exit / quit        Exit the REPL
`);
}

async function handleEnv() {
    const dotenv = path.join(__dirname, '.env');
    if (!fs.existsSync(dotenv)) {
        console.log('[ENV] discord/.env not found. Copy discord/.env.example and fill in your values.');
        return;
    }
    const lines = fs.readFileSync(dotenv, 'utf8').split('\n');
    console.log('\n[ENV] (sensitive values redacted)');
    for (const line of lines) {
        if (!line || line.startsWith('#')) { console.log(' ', line); continue; }
        const [key] = line.split('=');
        const isSensitive = /token|key|secret|password|api/i.test(key);
        console.log(' ', isSensitive ? `${key}=<redacted>` : line);
    }
}

// ── Command dispatcher ────────────────────────────────────────────────────────

async function dispatch(input) {
    const trimmed = input.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('/status'))               await handleStatus();
    else if (trimmed.startsWith('/search '))         await handleSearch(trimmed.slice(8).trim());
    else if (trimmed === '/search')                  await handleSearch('');
    else if (trimmed.startsWith('/tasks'))           await handleTasks();
    else if (trimmed.startsWith('/env'))             await handleEnv();
    else if (trimmed.startsWith('/help') || trimmed === '?') await handleHelp();
    else {
        console.log(`[ERROR] Unknown command: ${trimmed}`);
        console.log('        Type /help to see available commands.');
    }
}

// ── Smoke test (CI mode) ──────────────────────────────────────────────────────

async function smokeTest() {
    console.log('=== Jarvis CLI Smoke Test ===\n');
    let passed = 0;
    let failed = 0;

    const tests = [
        { name: 'status',       fn: () => handleStatus() },
        { name: 'tasks',        fn: () => handleTasks() },
        { name: 'env',          fn: () => handleEnv() },
        { name: 'search empty', fn: () => handleSearch('') },
    ];

    for (const t of tests) {
        process.stdout.write(`  ${t.name.padEnd(20)} `);
        try {
            await t.fn();
            console.log('... PASS');
            passed++;
        } catch (err) {
            console.log(`... FAIL (${err.message})`);
            failed++;
        }
    }

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
    process.exit(failed > 0 ? 1 : 0);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);

    if (args[0] === '--smoke-test') {
        await smokeTest();
        return;
    }

    if (args[0] === '--run') {
        const cmd = args.slice(1).join(' ');
        if (!cmd) { console.error('Usage: node cli-test.js --run /command'); process.exit(1); }
        await dispatch(cmd);
        return;
    }

    // Interactive REPL
    console.log('Jarvis CLI Test Mode — no Discord token required');
    console.log('Type /help for commands, exit to quit.\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'jarvis> ',
    });

    rl.prompt();
    rl.on('line', async (line) => {
        const trimmed = line.trim();
        if (trimmed === 'exit' || trimmed === 'quit') {
            console.log('Bye!');
            rl.close();
            process.exit(0);
        }
        await dispatch(trimmed);
        rl.prompt();
    });

    rl.on('close', () => process.exit(0));
}

main().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
});
