/**
 * Session summary — persist recent conversation turns for context recovery
 * when session resume fails.
 *
 * Exports:
 *   saveSessionSummary(sessionKey, userText, assistantText)
 *   loadSessionSummary(sessionKey) — returns formatted summary or ''
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { log } from './claude-runner.js';

const BOT_HOME = process.env.BOT_HOME || join(homedir(), '.jarvis');
const SESSION_SUMMARY_DIR = join(BOT_HOME, 'state', 'session-summaries');
const MAX_SUMMARY_TURNS = 5;

// Ensure session-summaries directory exists on module load
mkdirSync(SESSION_SUMMARY_DIR, { recursive: true });

/**
 * Save a conversation turn to the session summary file.
 * Keeps at most MAX_SUMMARY_TURNS recent turns.
 */
// 저장/로드 모두 위험 패턴 필터링 — 오염된 명령이 세션에 영속되지 않도록
// 실행 가능한 위험 명령만 차단 — 단순 언급/설명은 허용
const DANGER_PATTERNS = [
  // 서비스 영구 제거/비활성화만 차단 — stop/load/start는 가역적이므로 허용
  /launchctl\s+(bootout|unload|disable)\s/i,
  /systemctl\s+(stop|disable)\s/i,
  /kickstart.*discord/i,
  /rm\s+-rf/i,
  /kill\s+-9/i,
];
function _hasDanger(text) {
  return DANGER_PATTERNS.some(p => p.test(text));
}

export function saveSessionSummary(sessionKey, userText, assistantText) {
  // 위험 명령 포함 시 저장 건너뜀 — 오염 차단
  if (_hasDanger(assistantText)) {
    log('warn', 'saveSessionSummary: skipped (dangerous pattern in assistant response)');
    return;
  }
  try {
    mkdirSync(SESSION_SUMMARY_DIR, { recursive: true });
    const filePath = join(SESSION_SUMMARY_DIR, `${sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`);
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const userSnippet = userText.length > 200 ? userText.slice(0, 200) + '...' : userText;
    const assistSnippet = assistantText.length > 500 ? assistantText.slice(0, 500) + '...' : assistantText;
    const entry = `[${ts}] User: ${userSnippet}\n[${ts}] Jarvis: ${assistSnippet}\n---\n`;

    let existing = '';
    try { existing = readFileSync(filePath, 'utf-8'); } catch { /* new file */ }

    // Keep last N turns
    const turns = existing.split('---\n').filter(t => t.trim());
    while (turns.length >= MAX_SUMMARY_TURNS) turns.shift();
    turns.push(entry.replace('---\n', ''));

    writeFileSync(filePath, turns.join('---\n') + '---\n');
  } catch (err) {
    log('warn', 'saveSessionSummary failed', { error: err.message });
  }
}

/**
 * Load session summary for context recovery.
 * @returns {string} Formatted summary block or empty string
 */
export function loadSessionSummary(sessionKey) {
  try {
    const filePath = join(SESSION_SUMMARY_DIR, `${sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}.md`);
    if (!existsSync(filePath)) return '';
    const content = readFileSync(filePath, 'utf-8').trim();
    if (!content) return '';
    // 위험 패턴 포함 시 요약 폐기 — 오염된 파일이 남아있어도 주입 차단
    if (_hasDanger(content)) {
      log('warn', 'loadSessionSummary: discarded (dangerous pattern detected)', { sessionKey });
      return '';
    }
    return `## 이전 세션 요약\n${content}\n\n`;
  } catch {
    return '';
  }
}
