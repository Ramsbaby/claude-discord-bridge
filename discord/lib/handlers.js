/**
 * Discord message handler — main entry point per incoming message.
 *
 * Exports: handleMessage(message, state)
 *   state = { sessions, rateTracker, semaphore, activeProcesses, client }
 */

import { writeFileSync, rmSync } from 'node:fs';
import { join, extname } from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { log, sendNtfy } from './claude-runner.js';
import { StreamingMessage } from './session.js';
import {
  createClaudeSession,
  saveConversationTurn,
  processFeedback,
} from './claude-runner.js';
import { userMemory } from './user-memory.js';
import { t } from './i18n.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INPUT_MAX_CHARS = 4000;
const TYPING_INTERVAL_MS = 8000;
const STALL_SOFT_MS = 10_000;
const STALL_HARD_MS = 30_000;

const EMOJI = {
  THINKING: '🧠',
  TOOL: '🛠️',
  WEB: '🌐',
  DONE: '✅',
  ERROR: '❌',
  STALL_SOFT: '⏳',
  STALL_HARD: '⚠️',
};

// ---------------------------------------------------------------------------
// handleMessage
// ---------------------------------------------------------------------------

export async function handleMessage(message, { sessions, rateTracker, semaphore, activeProcesses, client }) {
  log('debug', 'messageCreate received', {
    author: message.author.tag,
    bot: message.author.bot,
    channelId: message.channel.id,
    parentId: message.channel.parentId || null,
    isThread: message.channel.isThread?.() || false,
    contentLen: message.content?.length ?? 0,
  });

  if (message.author.bot) return;

  const channelIds = (process.env.CHANNEL_IDS || process.env.CHANNEL_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (channelIds.length === 0) return;

  const isMainChannel = channelIds.includes(message.channel.id);
  const isThread =
    message.channel.isThread() && channelIds.includes(message.channel.parentId);

  if (!isMainChannel && !isThread) {
    log('debug', 'Message filtered out (not in allowed channel)', {
      channelId: message.channel.id,
      parentId: message.channel.parentId || null,
    });
    return;
  }

  const hasImages = message.attachments.size > 0 &&
    Array.from(message.attachments.values()).some((a) =>
      a.contentType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(a.name ?? ''),
    );
  if (!message.content && !hasImages) return;
  if (message.content.length > INPUT_MAX_CHARS) {
    await message.reply(
      t('msg.tooLong', { length: message.content.length, max: INPUT_MAX_CHARS }),
    );
    return;
  }

  // Text-based /remember or 기억해: command
  const rememberMatch = message.content.match(/^\/remember\s+(.+)/s) || message.content.match(/^기억해:\s*(.+)/s);
  if (rememberMatch) {
    const fact = rememberMatch[1].trim();
    if (fact) {
      userMemory.addFact(message.author.id, fact);
      await message.reply(t('msg.remembered'));
      log('info', 'User memory saved via text command', { userId: message.author.id, fact: fact.slice(0, 100) });
    }
    return;
  }

  // Rate limit check
  const rate = rateTracker.check();
  if (rate.reject) {
    await message.reply(t('rate.reject'));
    return;
  }
  if (rate.warn) {
    await message.channel.send(
      t('rate.warn', { count: rate.count, max: rate.max, pct: Math.round(rate.pct * 100) }),
    );
  }

  if (!semaphore.acquire()) {
    await message.reply(t('msg.busy', { botName: process.env.BOT_NAME || 'Claude Bot', max: semaphore.max }));
    return;
  }

  rateTracker.record();

  let thread;
  let sessionId = null;
  let sessionKey = null;
  let typingInterval = null;
  let stallTimer = null;
  let timeoutHandle = null;
  let imageAttachments = [];
  let userPrompt = message.content;

  // Learning feedback loop
  const feedback = processFeedback(message.author.id, userPrompt);
  if (feedback) {
    log('info', 'Feedback detected', { userId: message.author.id, type: feedback.type });
  }

  const reactions = new Set();

  async function react(emoji) {
    try {
      if (!reactions.has(emoji)) {
        await message.react(emoji);
        reactions.add(emoji);
      }
    } catch { /* Missing permissions or message deleted */ }
  }

  async function unreact(emoji) {
    try {
      if (reactions.has(emoji)) {
        await message.reactions.cache.get(emoji)?.users?.remove(client.user.id);
        reactions.delete(emoji);
      }
    } catch { /* Best effort */ }
  }

  async function clearStatusReactions() {
    const statusEmojis = [EMOJI.THINKING, EMOJI.TOOL, EMOJI.WEB, EMOJI.STALL_SOFT, EMOJI.STALL_HARD];
    await Promise.allSettled(statusEmojis.map((e) => unreact(e)));
  }

  try {
    thread = message.channel;
    sessionKey = isThread ? thread.id : `${thread.id}-${message.author.id}`;
    sessionId = sessions.get(sessionKey);

    await react(EMOJI.THINKING);

    await thread.sendTyping();
    typingInterval = setInterval(() => {
      thread.sendTyping().catch(() => {});
    }, TYPING_INTERVAL_MS);

    // Download image attachments from Discord CDN
    for (const [, att] of message.attachments) {
      const isImage = att.contentType?.startsWith('image/') ||
        /\.(jpg|jpeg|png|gif|webp)$/i.test(att.name ?? '');
      if (!isImage) continue;
      try {
        const resp = await fetch(att.url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const contentLength = parseInt(resp.headers.get('content-length') ?? '0', 10);
        if (contentLength > 20_000_000) throw new Error(`Image too large (${(contentLength / 1e6).toFixed(1)}MB, max 20MB)`);
        const buf = Buffer.from(await resp.arrayBuffer());
        const ext = att.contentType?.split('/')[1]?.split(';')[0] ||
          extname(att.name ?? '.jpg').slice(1) || 'jpg';
        const safeName = (att.name ?? `image_${att.id}.${ext}`)
          .replace(/[^a-zA-Z0-9._-]/g, '_');
        const localPath = join('/tmp', `claude-img-${att.id}.${ext}`);
        writeFileSync(localPath, buf);
        imageAttachments.push({ localPath, safeName });
        log('info', 'Downloaded attachment', { name: safeName, bytes: buf.length });
      } catch (err) {
        log('warn', 'Failed to download attachment', { id: att.id, error: err.message });
      }
    }
    if (!userPrompt.trim() && imageAttachments.length > 0) {
      userPrompt = t('msg.analyzeImage');
    }

    const effectiveChannelId = isThread ? message.channel.parentId : message.channel.id;
    const streamer = new StreamingMessage(thread, message, sessionKey, effectiveChannelId);
    await streamer.sendPlaceholder();

    // RAG는 mcp__nexus__rag_search 도구로 아젠틱하게 검색 (사전 주입 제거)
    // Claude가 대화 중 필요할 때 직접 rag_search를 호출한다.

    async function runClaude(sid, streamer) {
      log('info', 'Starting Claude session', {
        threadId: thread.id,
        resume: !!sid,
        promptLen: userPrompt.length,
      });

      const LARGE_KEYWORDS = /코드|분석|파일|구조|함수|클래스|디버그|확인|리뷰|왜|어떻게|explain|debug|analyze|review/i;
      const contextBudget = userPrompt.length > 200 || LARGE_KEYWORDS.test(userPrompt) ? 'large' : 'medium';

      // AbortController replaces proc.kill() — clean async cancellation
      const abortController = new AbortController();

      // Compat shim: commands.js uses active.proc.kill() and active.proc.killed
      let aborted = false;
      const procShim = {
        kill: () => { aborted = true; abortController.abort(); },
        get killed() { return aborted; },
      };

      timeoutHandle = setTimeout(() => {
        log('warn', 'Claude session timed out, aborting', { threadId: thread.id });
        procShim.kill();
      }, 300_000);

      activeProcesses.set(sessionKey, { proc: procShim, timeout: timeoutHandle, typingInterval });

      let lastOutputTime = Date.now();
      let stallSoftFired = false;
      let stallHardFired = false;
      let lastAssistantText = '';
      let toolCount = 0;
      let retryNeeded = false;

      stallTimer = setInterval(async () => {
        const elapsed = Date.now() - lastOutputTime;
        if (elapsed >= STALL_HARD_MS && !stallHardFired) {
          stallHardFired = true;
          await react(EMOJI.STALL_HARD);
        } else if (elapsed >= STALL_SOFT_MS && !stallSoftFired) {
          stallSoftFired = true;
          await react(EMOJI.STALL_SOFT);
        }
      }, 2000);

      function resetStall() {
        lastOutputTime = Date.now();
        if (stallSoftFired) { unreact(EMOJI.STALL_SOFT); stallSoftFired = false; }
        if (stallHardFired) { unreact(EMOJI.STALL_HARD); stallHardFired = false; }
      }

      for await (const event of createClaudeSession(userPrompt, {
        sessionId: sid,
        threadId: thread.id,
        channelId: effectiveChannelId,
        attachments: imageAttachments,
        userId: message.author.id,
        contextBudget,
        signal: abortController.signal,
      })) {
        if (event.type === 'system') {
          if (event.session_id) {
            sessions.set(sessionKey, event.session_id);
            log('info', 'Session saved', { threadId: thread.id, sessionId: event.session_id });
          }
        } else if (event.type === 'assistant') {
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text') {
                const fullText = block.text;
                if (fullText.length > lastAssistantText.length) {
                  streamer.append(fullText.slice(lastAssistantText.length));
                  resetStall();
                }
                lastAssistantText = fullText;
              } else if (block.type === 'tool_use') {
                toolCount++;
                const toolName = block.name?.toLowerCase() || '';
                if (toolName.includes('web') || toolName.includes('search') || toolName.includes('fetch')) {
                  await react(EMOJI.WEB);
                } else {
                  await react(EMOJI.TOOL);
                }
                resetStall();
                log('info', `Tool: ${block.name}`, { threadId: thread.id });
              }
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta' && event.delta?.text) {
            streamer.append(event.delta.text);
            resetStall();
          }
        } else if (event.type === 'result') {
          clearInterval(stallTimer);
          stallTimer = null;

          log('debug', 'Result event received', {
            isError: event.is_error ?? false,
            hasResult: !!event.result,
            resultLen: event.result?.length ?? 0,
            hasAssistantText: lastAssistantText.length > 0,
          });

          // Resume failure → retry fresh
          if (event.is_error && sid) {
            log('warn', 'Resume failed, retrying fresh', { sessionId: sid });
            sessions.delete(sessionKey);
            retryNeeded = true;
            break;
          }

          // Fallback: use result text if streamer buffer is empty
          if (event.result && !streamer.hasRealContent && lastAssistantText === '') {
            log('info', 'Using event.result fallback', { resultLen: event.result.length });
            streamer.append(event.result);
          }

          // Detect max-turns truncation
          if (event.stop_reason === 'max_turns') {
            streamer.append('\n\n' + t('msg.truncated'));
            log('warn', 'Response truncated by max-turns', { threadId: thread.id, toolCount });
          }

          await streamer.finalize();

          const cost = event.cost_usd ?? null;
          const resultSessionId = event.session_id ?? null;
          if (resultSessionId) sessions.set(sessionKey, resultSessionId);

          await clearStatusReactions();
          await react(EMOJI.DONE);

          const footerParts = [];
          if (cost !== null) footerParts.push(`$${Number(cost).toFixed(4)}`);
          if (toolCount > 0) footerParts.push(`${toolCount} tool${toolCount > 1 ? 's' : ''}`);
          if (footerParts.length > 0) {
            const embed = new EmbedBuilder()
              .setColor(0x57f287)
              .setFooter({ text: footerParts.join(' · ') })
              .setTimestamp();
            await thread.send({ embeds: [embed] });
          }

          log('info', 'Claude completed', { threadId: thread.id, cost, toolCount, sessionId: resultSessionId });

          if (lastAssistantText.length > 20) {
            const chName = isThread ? (message.channel.parent?.name ?? 'thread') : (message.channel.name ?? 'dm');
            saveConversationTurn(userPrompt, lastAssistantText, chName, message.author.id);
          }
        }
      }

      clearInterval(stallTimer);
      stallTimer = null;
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
      activeProcesses.delete(sessionKey);

      // Loop ended without result event — likely max-turns or abort
      if (!streamer.finalized && !retryNeeded) {
        if (streamer.hasRealContent && toolCount > 0) {
          streamer.append('\n\n' + t('msg.truncated'));
        }
        await streamer.finalize();
      }

      return { retryNeeded, lastAssistantText };
    }

    // First attempt
    let runResult = await runClaude(sessionId, streamer);

    // Retry with fresh session if resume caused error
    if (runResult.retryNeeded) {
      log('info', 'Retrying Claude with fresh session', { threadId: thread.id });
      sessionId = null;
      streamer.finalized = false;
      streamer.buffer = '';
      streamer.sentLength = 0;
      streamer.hasRealContent = false;
      streamer.replyTo = message;
      runResult = await runClaude(null, streamer);
    }

    // If nothing was produced (no text, no result), show generic error
    if (!streamer.hasRealContent && runResult.lastAssistantText === '') {
      await clearStatusReactions();
      await react(EMOJI.ERROR);
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(t('error.title'))
        .setDescription(t('error.noResponse'))
        .setTimestamp();
      if (streamer.currentMessage) {
        await streamer.currentMessage.edit({ content: null, embeds: [embed], components: [] });
      } else {
        await thread.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    log('error', 'handleMessage error', { error: err.message, stack: err.stack });

    await clearStatusReactions();
    await react(EMOJI.ERROR);

    const target = thread || message.channel;
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(t('error.generic'))
      .setDescription(err.message?.slice(0, 500) || 'Unknown error')
      .setTimestamp();
    try {
      await target.send({ embeds: [embed] });
    } catch { /* Can't send to channel either */ }
    sendNtfy(`${process.env.BOT_NAME || 'Claude Bot'} Error`, err.message, 'high');
  } finally {
    if (typingInterval) clearInterval(typingInterval);
    if (stallTimer) clearInterval(stallTimer);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    semaphore.release();
    if (sessionKey) activeProcesses.delete(sessionKey);

    // Keep workDir if session is alive (resume needs stable cwd)
    const threadId = thread?.id;
    if (threadId && sessionKey && !sessions.get(sessionKey)) {
      try {
        rmSync(join('/tmp', 'claude-discord', String(threadId)), { recursive: true, force: true });
      } catch { /* Best effort */ }
    }

    // Cleanup temp image files
    for (const { localPath } of imageAttachments) {
      try { rmSync(localPath, { force: true }); } catch { /* best effort */ }
    }
  }
}
