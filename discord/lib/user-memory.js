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
  const defaults = { userId, facts: [], preferences: [], corrections: [], plans: [], updatedAt: null };
  try {
    const data = JSON.parse(readFileSync(_path(userId), 'utf-8'));
    const merged = { ...defaults, ...data };
    // null/non-array 값이 파일에 있으면 spread가 기본 배열을 덮어쓰므로 재보정
    merged.facts = Array.isArray(merged.facts) ? merged.facts : [];
    merged.preferences = Array.isArray(merged.preferences) ? merged.preferences : [];
    merged.corrections = Array.isArray(merged.corrections) ? merged.corrections : [];
    merged.plans = Array.isArray(merged.plans) ? merged.plans : [];
    return merged;
  } catch (err) {
    console.warn(`[user-memory] JSON parse failed for userId=${userId}: ${err.message}`);
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

  addPlan(userId, plan) {
    if (!plan?.key || typeof plan.key !== 'string') {
      // key 없는 plan은 중복 방지 불가 — 저장 거부
      return;
    }
    const data = _load(userId);
    // key 기반 upsert — 같은 key면 덮어쓰기 (일정 업데이트)
    const idx = data.plans.findIndex(p => p.key === plan.key);
    if (idx >= 0) {
      data.plans[idx] = { ...data.plans[idx], ...plan, updatedAt: new Date().toISOString() };
    } else {
      data.plans.push({ ...plan, createdAt: new Date().toISOString() });
    }
    data.updatedAt = new Date().toISOString();
    _save(data);
  },

  getPromptSnippet(userId) {
    const data = _load(userId);
    const lines = [];
    if (data.facts.length) {
      // 최근 20개만 (너무 많으면 프롬프트 비대화)
      const recent = data.facts.slice(-20);
      lines.push('## 사용자 장기 기억\n' + recent.map(f => `- ${f}`).join('\n'));
    }
    if (data.preferences.length) lines.push('## 선호 패턴\n' + data.preferences.map(p => `- ${p}`).join('\n'));
    if (data.corrections.length) lines.push('## 수정 사항\n' + data.corrections.map(c => `- ${c}`).join('\n'));
    if (data.plans.length) {
      const activePlans = data.plans.filter(p => !p.done);
      if (activePlans.length) lines.push('## 진행 중인 계획\n' + activePlans.map(p => `- [${p.key}] ${p.summary}`).join('\n'));
    }
    return lines.join('\n\n');
  },
};
