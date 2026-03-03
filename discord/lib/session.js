/**
 * Session management, rate tracking, concurrency control, and streaming.
 *
 * Exports: SessionStore, RateTracker, Semaphore, StreamingMessage
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { log } from './claude-runner.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const STREAM_EDIT_INTERVAL_MS = 1500;
const STREAM_MAX_CHARS = 1900;
const RATE_WINDOW_HOURS = 5;
const RATE_MAX_REQUESTS = 900;

// ---------------------------------------------------------------------------
// SessionStore
// ---------------------------------------------------------------------------

export class SessionStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.load();
  }

  load() {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Migrate old format (string) → new format ({ id, updatedAt })
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') {
          this.data[k] = { id: v, updatedAt: Date.now() };
        } else if (v && typeof v === 'object') {
          this.data[k] = v;
        }
      }
    } catch {
      this.data = {};
    }
  }

  save() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
  }

  get(threadId) {
    const entry = this.data[threadId];
    if (!entry) return null;
    // Expire stale sessions
    if (Date.now() - entry.updatedAt > SESSION_TTL_MS) {
      delete this.data[threadId];
      this.save();
      return null;
    }
    return entry.id;
  }

  set(threadId, sessionId) {
    this.data[threadId] = { id: sessionId, updatedAt: Date.now() };
    this.save();
  }

  delete(threadId) {
    delete this.data[threadId];
    this.save();
  }
}

// ---------------------------------------------------------------------------
// RateTracker — sliding window in 5-hour blocks
// ---------------------------------------------------------------------------

export class RateTracker {
  constructor(filePath) {
    this.filePath = filePath;
    this.requests = [];
    this.load();
  }

  load() {
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      this.requests = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed.requests) ? parsed.requests : []);
    } catch {
      this.requests = [];
    }
  }

  save() {
    writeFileSync(this.filePath, JSON.stringify(this.requests));
  }

  prune() {
    const cutoff = Date.now() - RATE_WINDOW_HOURS * 3600 * 1000;
    this.requests = this.requests.filter((t) => t > cutoff);
  }

  record() {
    this.prune();
    this.requests.push(Date.now());
    this.save();
  }

  /** Returns { count, pct, max, warn, reject } */
  check() {
    this.prune();
    const count = this.requests.length;
    const pct = count / RATE_MAX_REQUESTS;
    return {
      count,
      pct,
      max: RATE_MAX_REQUESTS,
      warn: pct >= 0.8 && pct < 0.9,
      reject: pct >= 0.9,
    };
  }
}

// ---------------------------------------------------------------------------
// Semaphore — concurrency control
// ---------------------------------------------------------------------------

export class Semaphore {
  constructor(max) {
    this.max = max;
    this.current = 0;
  }

  acquire() {
    if (this.current >= this.max) return false;
    this.current++;
    return true;
  }

  release() {
    this.current = Math.max(0, this.current - 1);
  }
}

// ---------------------------------------------------------------------------
// StreamingMessage — debounced edit-in-place with code-fence awareness
// ---------------------------------------------------------------------------

export class StreamingMessage {
  constructor(channel, replyTo = null, sessionKey = null) {
    this.channel = channel;
    this.replyTo = replyTo;
    this.sessionKey = sessionKey;
    this.buffer = '';
    this.currentMessage = null;
    this.sentLength = 0;
    this.timer = null;
    this.fenceOpen = false;
    this.finalized = false;
    this.hasRealContent = false;
  }

  /** Build the Stop button row (null if no sessionKey) */
  _stopRow() {
    if (!this.sessionKey) return null;
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cancel_${this.sessionKey}`)
        .setLabel('🛑 Stop')
        .setStyle(ButtonStyle.Danger)
    );
  }

  /** Send an immediate "thinking" placeholder with Stop button. */
  async sendPlaceholder() {
    if (this.currentMessage) return;
    const row = this._stopRow();
    const payload = {
      content: '`⏳` 분석 중...',
      components: row ? [row] : [],
    };
    try {
      if (this.replyTo) {
        this.currentMessage = await this.replyTo.reply(payload);
        this.replyTo = null;
      } else {
        this.currentMessage = await this.channel.send(payload);
      }
    } catch (err) {
      log('error', 'Placeholder send failed', { error: err.message });
    }
  }

  append(text) {
    if (this.finalized) return;
    this.hasRealContent = true;
    this.buffer += text;
    this._trackFences(text);
    this._scheduleFlush();
  }

  _trackFences(text) {
    const matches = text.match(/```/g);
    if (matches) {
      for (const _ of matches) {
        this.fenceOpen = !this.fenceOpen;
      }
    }
  }

  _scheduleFlush() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this._flush();
    }, STREAM_EDIT_INTERVAL_MS);
  }

  async _flush() {
    if (this.buffer.length === 0) return;

    while (this.buffer.length > STREAM_MAX_CHARS) {
      const splitAt = this._findSplitPoint(this.buffer, STREAM_MAX_CHARS);
      let chunk = this.buffer.slice(0, splitAt);
      this.buffer = this.buffer.slice(splitAt);

      const openInChunk = (chunk.match(/```/g) || []).length % 2 === 1;
      if (openInChunk) {
        chunk += '\n```';
        this.buffer = '```\n' + this.buffer;
      }

      await this._sendOrEdit(chunk, true);
      this.currentMessage = null;
      this.sentLength = 0;
    }

    if (this.buffer.length > 0) {
      await this._sendOrEdit(this.buffer, false);
    }
  }

  _findSplitPoint(text, maxLen) {
    const lastNewline = text.lastIndexOf('\n', maxLen);
    if (lastNewline > maxLen * 0.6) return lastNewline + 1;
    const lastSpace = text.lastIndexOf(' ', maxLen);
    if (lastSpace > maxLen * 0.6) return lastSpace + 1;
    return maxLen;
  }

  async _sendOrEdit(content, isFinal) {
    const displayContent = (!this.finalized && !isFinal) ? content + ' ▌' : content;
    const row = this._stopRow();
    const components = (this.finalized || isFinal) ? [] : (row ? [row] : []);

    try {
      if (!this.currentMessage) {
        const payload = { content: displayContent, embeds: [], components };
        if (this.replyTo) {
          this.currentMessage = await this.replyTo.reply(payload);
          this.replyTo = null;
        } else {
          this.currentMessage = await this.channel.send(payload);
        }
        this.sentLength = content.length;
      } else {
        await this.currentMessage.edit({ content: displayContent, embeds: [], components });
        this.sentLength = content.length;
      }
      if (isFinal) {
        this.buffer = '';
      }
    } catch (err) {
      log('error', 'StreamingMessage send/edit failed', { error: err.message });
    }
  }

  async finalize() {
    this.finalized = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.fenceOpen) {
      this.buffer += '\n```';
      this.fenceOpen = false;
    }
    if (this.buffer.length > 0) {
      await this._flush();
    } else if (this.currentMessage) {
      try {
        await this.currentMessage.edit({ components: [] });
      } catch { /* ignore */ }
    }
  }
}
