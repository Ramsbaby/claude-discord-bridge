/**
 * UserMemory — per-user persistent long-term memory.
 * Stores facts, preferences, corrections per Discord userId.
 * File: ~/.jarvis/state/users/{userId}.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const BOT_HOME = process.env.BOT_HOME || join(homedir(), '.jarvis');
const USERS_DIR = join(BOT_HOME, 'state', 'users');

function _path(userId) {
  return join(USERS_DIR, `${userId}.json`);
}

function _load(userId) {
  const defaults = { userId, facts: [], preferences: [], corrections: [], updatedAt: null };
  try {
    const data = JSON.parse(readFileSync(_path(userId), 'utf-8'));
    const merged = { ...defaults, ...data };
    // null/non-array 값이 파일에 있으면 spread가 기본 배열을 덮어쓰므로 재보정
    merged.facts = Array.isArray(merged.facts) ? merged.facts : [];
    merged.preferences = Array.isArray(merged.preferences) ? merged.preferences : [];
    merged.corrections = Array.isArray(merged.corrections) ? merged.corrections : [];
    return merged;
  } catch {
    return defaults;
  }
}

function _save(data) {
  mkdirSync(USERS_DIR, { recursive: true });
  writeFileSync(_path(data.userId), JSON.stringify(data, null, 2));
}

export const userMemory = {
  get(userId) {
    return _load(userId);
  },

  addFact(userId, fact) {
    const data = _load(userId);
    if (!data.facts.includes(fact)) {
      data.facts.push(fact);
      data.updatedAt = new Date().toISOString();
      _save(data);
    }
  },

  getPromptSnippet(userId) {
    const data = _load(userId);
    const lines = [];
    if (data.facts.length) lines.push('## 사용자 장기 기억\n' + data.facts.map(f => `- ${f}`).join('\n'));
    if (data.preferences.length) lines.push('## 선호 패턴\n' + data.preferences.map(p => `- ${p}`).join('\n'));
    if (data.corrections.length) lines.push('## 수정 사항\n' + data.corrections.map(c => `- ${c}`).join('\n'));
    return lines.join('\n\n');
  },
};
