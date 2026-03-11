/**
 * Jarvis — Main Entry Point
 *
 * Wraps `claude -p` CLI with streaming JSON output.
 * Manages slash commands, shared state, and client lifecycle.
 *
 * Message handling → lib/handlers.js
 * Session/rate/streaming → lib/session.js
 * Claude spawning/RAG → lib/claude-runner.js
 * Slash commands → lib/commands.js
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import {
  Client,
  GatewayIntentBits,
  Options,
  SlashCommandBuilder,
  REST,
  Routes,
} from 'discord.js';
import 'dotenv/config';

import { log, sendNtfy } from './lib/claude-runner.js';
import { SessionStore, RateTracker, Semaphore } from './lib/session.js';
import { handleMessage } from './lib/handlers.js';
import { handleInteraction } from './lib/commands.js';
import { handleApprovalInteraction, pollL3Requests } from './lib/approval.js';
import { t } from './lib/i18n.js';
import { initAlertBatcher, botAlerts } from './lib/alert-batcher.js';
import { recordError, sendRecoveryApologies } from './lib/error-tracker.js';
import { _loadPlaceholders, _savePlaceholders, cleanupOrphanPlaceholders } from './lib/streaming.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOME = homedir();
const BOT_HOME = join(process.env.BOT_HOME || join(HOME, '.jarvis'));
const SESSIONS_PATH = join(BOT_HOME, 'state', 'sessions.json');
const RATE_TRACKER_PATH = join(BOT_HOME, 'state', 'rate-tracker.json');
const MAX_CONCURRENT = 2;
const BOT_NAME = process.env.BOT_NAME || 'Claude Bot';

// ---------------------------------------------------------------------------
// Shared state (created here, passed to handlers)
// ---------------------------------------------------------------------------

const sessions = new SessionStore(SESSIONS_PATH);
const rateTracker = new RateTracker(RATE_TRACKER_PATH);
const semaphore = new Semaphore(MAX_CONCURRENT);

/** @type {Map<string, { proc: import('child_process').ChildProcess, timeout: NodeJS.Timeout, typingInterval: NodeJS.Timeout | null }>} */
const activeProcesses = new Map();

// ---------------------------------------------------------------------------
// Slash command registration
// ---------------------------------------------------------------------------

async function registerSlashCommands(clientId, guildId) {
  const bn = { botName: BOT_NAME };
  const commands = [
    new SlashCommandBuilder()
      .setName('clear')
      .setDescription(t('cmd.clear.desc', bn)),
    new SlashCommandBuilder()
      .setName('stop')
      .setDescription(t('cmd.stop.desc', bn)),
    new SlashCommandBuilder()
      .setName('memory')
      .setDescription(t('cmd.memory.desc', bn)),
    new SlashCommandBuilder()
      .setName('remember')
      .setDescription(t('cmd.remember.desc'))
      .addStringOption(opt => opt.setName('content').setDescription(t('cmd.remember.opt.content')).setRequired(true)),
    new SlashCommandBuilder()
      .setName('search')
      .setDescription(t('cmd.search.desc'))
      .addStringOption(opt => opt.setName('query').setDescription(t('cmd.search.opt.query')).setRequired(true)),
    new SlashCommandBuilder()
      .setName('threads')
      .setDescription(t('cmd.threads.desc', bn)),
    new SlashCommandBuilder()
      .setName('alert')
      .setDescription(t('cmd.alert.desc'))
      .addStringOption(opt => opt.setName('message').setDescription(t('cmd.alert.opt.message')).setRequired(true)),
    new SlashCommandBuilder()
      .setName('status')
      .setDescription(t('cmd.status.desc')),
    new SlashCommandBuilder()
      .setName('tasks')
      .setDescription(t('cmd.tasks.desc')),
    new SlashCommandBuilder()
      .setName('run')
      .setDescription(t('cmd.run.desc'))
      .addStringOption(opt =>
        opt.setName('id').setDescription(t('cmd.run.opt.id')).setRequired(true).setAutocomplete(true)
      ),
    new SlashCommandBuilder()
      .setName('schedule')
      .setDescription(t('cmd.schedule.desc'))
      .addStringOption(opt => opt.setName('task').setDescription(t('cmd.schedule.opt.task')).setRequired(true))
      .addStringOption(opt => opt.setName('in').setDescription(t('cmd.schedule.opt.in')).setRequired(true)
        .addChoices(
          { name: t('cmd.schedule.choice.30m'), value: '30m' },
          { name: t('cmd.schedule.choice.1h'), value: '1h' },
          { name: t('cmd.schedule.choice.2h'), value: '2h' },
          { name: t('cmd.schedule.choice.4h'), value: '4h' },
          { name: t('cmd.schedule.choice.8h'), value: '8h' },
        )),
    new SlashCommandBuilder()
      .setName('usage')
      .setDescription(t('cmd.usage.desc')),
    new SlashCommandBuilder()
      .setName('lounge')
      .setDescription(t('cmd.lounge.desc')),
    new SlashCommandBuilder()
      .setName('doctor')
      .setDescription('Jarvis 시스템 점검 + 자동 수정 (오너 전용)'),
    new SlashCommandBuilder()
      .setName('team')
      .setDescription('자비스 컴퍼니 팀장을 소환합니다')
      .addStringOption(opt =>
        opt.setName('name').setDescription('팀 이름').setRequired(true)
          .addChoices(
            { name: '감사팀 (Council)', value: 'council' },
            { name: '인프라팀 (Infra)', value: 'infra' },
            { name: '기록팀 (Record)', value: 'record' },
            { name: '브랜드팀 (Brand)', value: 'brand' },
            { name: '성장팀 (Career)', value: 'career' },
            { name: '학습팀 (Academy)', value: 'academy' },
            { name: '정보팀 (Trend)', value: 'trend' },
            { name: '🔭 정보탐험대 (Recon)', value: 'recon' },
          )
      ),
  ];

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands.map((c) => c.toJSON()),
    });
    log('info', 'Slash commands registered', { guildId });
  } catch (err) {
    log('error', 'Failed to register slash commands', { error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Discord client setup
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  makeCache: Options.cacheWithLimits({
    MessageManager: 50,
    GuildMemberManager: 50,
    PresenceManager: 0,
    ReactionManager: 0,
    GuildEmojiManager: 0,
    ThreadManager: { maxSize: 50 },
  }),
});

let lastMessageAt = Date.now();
let healthMonitorInterval = null;
let l3PollInterval = null;

client.once('clientReady', async () => {
  log('info', `Logged in as ${client.user.tag}`, { id: client.user.id });
  try { rmSync('/tmp/jarvis-token-backoff', { force: true }); } catch {} // Reset token backoff on success

  const guildId = process.env.GUILD_ID;
  if (guildId) {
    await registerSlashCommands(client.user.id, guildId);
  }

  // Cleanup orphan placeholders from previous crash
  cleanupOrphanPlaceholders(client).catch((e) => log('warn', 'Orphan placeholder cleanup failed', { error: e.message }));

  // Init alert batcher — send batched alerts to first allowed channel
  const firstChannelId = (process.env.CHANNEL_IDS || '').split(',')[0]?.trim();
  if (firstChannelId) {
    const alertCh = client.channels.cache.get(firstChannelId) || await client.channels.fetch(firstChannelId).catch(() => null);
    if (alertCh) initAlertBatcher(alertCh);
  }

  // Orphaned placeholder cleanup: 이전 세션에서 남은 Stop 버튼 embed 삭제
  try {
    const orphans = _loadPlaceholders();
    if (orphans.length > 0) {
      let cleaned = 0;
      for (const { channelId, messageId } of orphans) {
        try {
          const ch = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
          if (ch) {
            const msg = await ch.messages.fetch(messageId).catch(() => null);
            if (msg) {
              await msg.delete().catch(() => {});
              cleaned++;
            }
          }
        } catch { /* best effort per message */ }
      }
      _savePlaceholders([]);
      if (cleaned > 0) log('info', 'Cleaned orphaned placeholders', { cleaned, total: orphans.length });
    }
  } catch { /* ignore */ }

  // 재시작 알림: 종료 사유 포함
  try {
    const notifyPath = join(BOT_HOME, 'state', 'restart-notify.json');
    const heartbeatFile = join(BOT_HOME, 'state', 'bot-heartbeat');
    let reason = null;
    let notifyChannels = [];

    try {
      const notifyRaw = readFileSync(notifyPath, 'utf-8');
      rmSync(notifyPath, { force: true });
      const data = JSON.parse(notifyRaw);
      // 5분 이내만 유효
      if (Date.now() - data.ts < 300_000) {
        reason = data.reason || 'unknown';
        notifyChannels = data.channels || [];
      }
    } catch {
      // restart-notify.json 없음 → heartbeat로 비정상 종료 추정
      try {
        const hbRaw = readFileSync(heartbeatFile, 'utf-8').trim();
        const lastHb = parseInt(hbRaw, 10);
        // heartbeat가 15분 이내면 → 갑자기 죽은 것 (watchdog kill 또는 OOM 등)
        if (Number.isFinite(lastHb) && Date.now() - lastHb < 900_000) {
          reason = 'unexpected shutdown (no graceful exit)';
        }
      } catch { /* no heartbeat = first boot */ }
    }

    // 재시작 알림 쿨다운: 60초 이내 연속 재시작(개발자 배포 루프)은 알림 억제
    const APOLOGY_COOLDOWN_MS = 60_000;
    const apologyCooldownFile = join(BOT_HOME, 'state', 'restart-apology-ts');
    let suppressApology = false;
    try {
      const lastTs = parseInt(readFileSync(apologyCooldownFile, 'utf-8').trim(), 10);
      if (Number.isFinite(lastTs) && Date.now() - lastTs < APOLOGY_COOLDOWN_MS) {
        suppressApology = true;
      }
    } catch { /* 파일 없으면 첫 재시작 */ }

    if (reason) {
      const reasonLabel = reason.startsWith('crash:') ? `⚠️ 크래시: ${reason.slice(7)}`
        : reason.startsWith('graceful') ? `정상 종료 (${reason})`
        : `⚠️ ${reason}`;

      const isGraceful = reason.startsWith('graceful');

      // 활성 세션 채널에 알림 (graceful shutdown: 진행 중이던 채널만)
      if (notifyChannels.length > 0 && !suppressApology) {
        for (const chId of notifyChannels) {
          const ch = client.channels.cache.get(chId) || await client.channels.fetch(chId).catch(() => null);
          if (ch) {
            await ch.send(`🔄 재시작됐습니다. 이전 응답이 중단되었으니 다시 말씀해 주세요.\n> 사유: ${reasonLabel}`).catch(() => {});
          }
        }
        try { writeFileSync(apologyCooldownFile, String(Date.now())); } catch { /* best effort */ }
      }

      // 비정상 종료(크래시/watchdog kill)이고 활성 채널이 없을 때 → 메인채널에 조용히 알림
      if (!isGraceful && notifyChannels.length === 0 && !suppressApology) {
        try {
          const allChannelIds = (process.env.CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
          const quietIds = (process.env.QUIET_CHANNEL_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
          const fallbackChannels = allChannelIds.filter(id => !quietIds.includes(id)).slice(0, 2);
          for (const chId of fallbackChannels) {
            try {
              const ch = client.channels.cache.get(chId) || await client.channels.fetch(chId).catch(() => null);
              if (ch?.isTextBased()) {
                await ch.send(`-# 🔄 재시작됨 — 이전 대화 맥락은 세션 요약으로 복구됩니다. (${reasonLabel})`).catch(() => {});
              }
            } catch { /* 채널 없으면 skip */ }
          }
          try { writeFileSync(apologyCooldownFile, String(Date.now())); } catch { /* best effort */ }
        } catch { /* best effort */ }
      }

      if (suppressApology) {
        log('info', 'Bot restarted (apology suppressed — cooldown active)', { reason });
      } else {
        log('info', 'Bot restarted', { reason, notifiedChannels: notifyChannels.length });
      }
    }
  } catch { /* clean start, skip */ }

  // ---------------------------------------------------------------------------
  // Unified Health Monitor (replaces heartbeat + WS self-ping)
  // - 5분마다 실행
  // - heartbeat 파일 기록 (외부 watchdog용)
  // - WS 상태 + 이벤트 흐름 + API 생존 확인
  // - 좀비 세션 감지 시 자동 재연결
  // ---------------------------------------------------------------------------
  const HEALTH_INTERVAL = 300_000;      // 5분
  const SILENCE_THRESHOLD = 600_000;    // 10분 무메시지 → 의심
  const FORCE_RECONNECT_CHECKS = 6;     // API OK 상태로 6회(30분) 이상 침묵 → 강제 재연결
  const heartbeatFile = join(BOT_HOME, 'state', 'bot-heartbeat');
  const writeHeartbeat = () => {
    try { writeFileSync(heartbeatFile, String(Date.now())); } catch { /* best effort */ }
  };
  writeHeartbeat();

  let _healthRunning = false;
  let _silentApiOkCount = 0; // API OK인데 이벤트 없는 연속 횟수
  healthMonitorInterval = setInterval(async () => {
    if (_healthRunning) return; // 이전 체크가 아직 실행 중이면 스킵
    _healthRunning = true;
    try {
    const wsStatus = client.ws?.status ?? -1;
    const wsPing = client.ws?.ping ?? -1;
    const silenceMs = Date.now() - lastMessageAt;
    const uptimeSec = Math.floor(process.uptime());
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

    log('info', 'Health check', {
      wsStatus, wsPing,
      silenceSec: Math.floor(silenceMs / 1000),
      uptimeSec, memMB,
      guilds: client.guilds?.cache?.size ?? 0,
    });

    // Case 1: WS explicitly not ready → discord.js auto-reconnect에 맡기되 경고
    // heartbeat 안 씀 → watchdog이 15분 후 외부에서 강제 재시작
    if (wsStatus !== 0) {
      log('warn', `WS not READY (status=${wsStatus}). Skipping heartbeat.`);
      return;
    }

    // Case 2: WS "정상"인데 10분 이상 이벤트 없음 → 좀비 의심, API로 확인
    if (silenceMs > SILENCE_THRESHOLD) {
      log('warn', `No events for ${Math.floor(silenceMs / 1000)}s — verifying session via API`);
      try {
        await client.user.fetch(true);
        _silentApiOkCount++;
        log('info', `API liveness OK — session alive, just quiet (silent_ok_count=${_silentApiOkCount})`);

        // HTTP는 OK지만 Gateway가 이벤트를 안 보내는 상태 감지:
        // 30분(6회) 이상 API-OK + 침묵 → Gateway 좀비 → 강제 재연결
        if (_silentApiOkCount >= FORCE_RECONNECT_CHECKS) {
          log('warn', `Gateway silent for ${_silentApiOkCount} checks — forcing reconnect`);
          botAlerts.push({
            title: `${BOT_NAME} Gateway 침묵 감지`,
            message: `API OK지만 ${_silentApiOkCount * 5}분 이상 이벤트 없음. Gateway 강제 재연결.`,
            level: 'high',
          });
          _silentApiOkCount = 0;
          log('warn', 'Gateway forced reconnect: exiting for launchd clean restart');
          process.exit(1);
        }

        writeHeartbeat(); // API 성공 → 진짜 살아있음 → heartbeat 갱신
      } catch (err) {
        // API 실패 → 좀비 확정. heartbeat 안 씀 → watchdog이 백업으로 감지
        _silentApiOkCount = 0;
        log('error', 'API liveness FAILED — zombie session detected', { error: err.message });
        botAlerts.push({
          title: `${BOT_NAME} 좀비 세션 감지`,
          message: `WS status=0이지만 API 실패: ${err.message}. 재연결 시도.`,
          level: 'high',
        });
        log('error', 'Zombie recovery: exiting for launchd clean restart');
        process.exit(1);
      }
      return;
    }

    // Case 3: 정상 — 이벤트 흐름 있고 WS 연결 정상
    _silentApiOkCount = 0; // 이벤트 왔으면 카운터 리셋
    writeHeartbeat();

    // Write active-session indicator for watchdog
    const activeSessionFile = join(BOT_HOME, 'state', 'active-session');
    try {
      const activeCount = activeProcesses?.size ?? 0;
      if (activeCount > 0) {
        writeFileSync(activeSessionFile, String(Date.now()));
      } else {
        try { rmSync(activeSessionFile, { force: true }); } catch { /* ok */ }
      }
    } catch { /* best effort */ }
    } finally { _healthRunning = false; }
  }, HEALTH_INTERVAL);

  // L3 request polling (pick up bash-originated approval requests every 10s)
  l3PollInterval = setInterval(() => pollL3Requests(client), 10_000);
});

const handlerState = { sessions, rateTracker, semaphore, activeProcesses, client };

client.on('messageCreate', (message) => {
  lastMessageAt = Date.now();
  handleMessage(message, handlerState).catch((err) => {
    log('error', 'Unhandled error in handleMessage', { error: err.message, stack: err.stack });
  });
});

const interactionDeps = {
  sessions, activeProcesses, rateTracker, client,
  BOT_HOME, BOT_NAME, HOME,
  get lastMessageAt() { return lastMessageAt; },
  maxConcurrent: MAX_CONCURRENT,
};

client.on('interactionCreate', async (interaction) => {
  try {
    // L3 approval buttons — check before slash commands
    if (await handleApprovalInteraction(interaction)) return;

    await handleInteraction(interaction, interactionDeps);
  } catch (err) {
    log('error', 'Unhandled error in interactionCreate', { error: err.message });
  }
});

client.on('error', (err) => {
  log('error', 'Discord client error', { error: err.message });
});

client.on('warn', (msg) => {
  log('warn', `Discord warning: ${msg}`);
});

client.on('shardDisconnect', (event, shardId) => {
  log('warn', 'Discord disconnected', { code: event.code, shardId });
  botAlerts.push({ title: `${BOT_NAME} 연결 끊김`, message: `Shard ${shardId} disconnected (code: ${event.code})`, level: 'default' });
});

client.on('shardReconnecting', (shardId) => {
  log('info', 'Discord reconnecting', { shardId });
});

client.on('shardResume', (shardId, replayedEvents) => {
  log('info', 'Discord resumed', { shardId, replayedEvents });
  // Recovery apologies disabled
});

client.on('shardError', (err, shardId) => {
  log('error', `Shard ${shardId} error`, { error: err.message });
  botAlerts.push({ title: `${BOT_NAME} Shard Error`, message: `Shard ${shardId}: ${err.message}`, level: 'high' });
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal) {
  log('info', `Received ${signal}, shutting down`);

  // Hard exit timeout — prevent hanging shutdown
  setTimeout(() => process.exit(1), 10000);

  // Clear all intervals
  if (healthMonitorInterval) clearInterval(healthMonitorInterval);
  if (l3PollInterval) clearInterval(l3PollInterval);

  // 활성 세션 채널 기록 → 재시작 후 알림용
  const activeChannels = [];
  const streamerFinalizations = [];
  for (const [threadId, entry] of activeProcesses) {
    activeChannels.push(threadId);
    log('info', 'Killing active process', { threadId });
    clearTimeout(entry.timeout);
    if (entry.typingInterval) clearInterval(entry.typingInterval);
    // Save pending task so user can resume with "계속"
    if (entry.originalPrompt && entry.sessionKey) {
      try {
        const pendingPath = join(BOT_HOME, 'state', 'pending-tasks.json');
        let tasks = {};
        if (existsSync(pendingPath)) {
          try { tasks = JSON.parse(readFileSync(pendingPath, 'utf-8')); } catch { tasks = {}; }
        }
        tasks[entry.sessionKey] = { prompt: entry.originalPrompt, savedAt: Date.now() };
        const pendingTmp = `${pendingPath}.tmp`;
        writeFileSync(pendingTmp, JSON.stringify(tasks));
        renameSync(pendingTmp, pendingPath);
        log('info', 'Pending task saved on SIGTERM', { sessionKey: entry.sessionKey });
      } catch (e) {
        log('warn', 'Failed to save pending task on SIGTERM', { error: e.message });
      }
    }
    entry.proc.kill('SIGTERM');
    // 진행 중인 스트리머 finalize — client.destroy() 전에 Discord에 마지막 청크 전송
    if (entry.streamer && !entry.streamer.finalized) {
      streamerFinalizations.push(
        entry.streamer.finalize().catch(err => log('warn', 'Streamer finalize on shutdown failed', { error: err.message }))
      );
    }
  }
  // 종료 사유 + 활성 채널 기록 → 재시작 후 알림용
  try {
    writeFileSync(join(BOT_HOME, 'state', 'restart-notify.json'),
      JSON.stringify({ channels: activeChannels, ts: Date.now(), reason: `graceful (${signal})` }));
  } catch { /* best effort */ }
  activeProcesses.clear();
  // 스트리머 finalize 완료 대기 (최대 8초 — hard exit timeout 10초보다 짧게)
  if (streamerFinalizations.length > 0) {
    log('info', `Waiting for ${streamerFinalizations.length} streamer(s) to finalize`);
    await Promise.race([
      Promise.allSettled(streamerFinalizations),
      new Promise(resolve => setTimeout(resolve, 8000)),
    ]);
  }
  // Release all semaphore slots before exit
  while (semaphore.current > 0) {
    await semaphore.release();
  }
  await botAlerts.shutdown();
  sessions.save();
  client.destroy();
  log('info', 'Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(err => { log('error', 'Shutdown error', { error: err.message }); process.exit(1); }); });
process.on('SIGINT', () => { shutdown('SIGINT').catch(err => { log('error', 'Shutdown error', { error: err.message }); process.exit(1); }); });

// QW5: Catch uncaught exceptions — log, notify, then exit for launchd restart
process.on('uncaughtException', (err) => {
  log('error', '[fatal] uncaughtException', {
    error: err.message,
    stack: err.stack,
  });
  // 크래시 시 진행 중인 작업 pending-tasks.json에 동기 저장 (사용자가 "계속"으로 복구 가능)
  try {
    const pendingPath = join(BOT_HOME, 'state', 'pending-tasks.json');
    let tasks = {};
    if (existsSync(pendingPath)) {
      try { tasks = JSON.parse(readFileSync(pendingPath, 'utf-8')); } catch { tasks = {}; }
    }
    for (const [, entry] of activeProcesses) {
      if (entry.originalPrompt && entry.sessionKey) {
        tasks[entry.sessionKey] = { prompt: entry.originalPrompt, savedAt: Date.now() };
      }
    }
    if (Object.keys(tasks).length > 0) {
      const pendingTmp = `${pendingPath}.tmp`;
      writeFileSync(pendingTmp, JSON.stringify(tasks));
      renameSync(pendingTmp, pendingPath);
    }
  } catch { /* best effort — 크래시 핸들러에서 추가 실패 무시 */ }
  try {
    writeFileSync(join(BOT_HOME, 'state', 'restart-notify.json'),
      JSON.stringify({ channels: [], ts: Date.now(), reason: `crash: ${err.message.slice(0, 100)}` }));
  } catch { /* best effort */ }
  try {
    sendNtfy(`${BOT_NAME} uncaughtException`, err.message, 'urgent');
  } catch { /* best effort */ }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
  const code = reason?.code;
  const msg = reason instanceof Error ? reason.message : String(reason);
  if (code === 'TokenInvalid' || msg.includes('TokenInvalid') || msg.includes('invalid token')) {
    const backoffFile = '/tmp/jarvis-token-backoff';
    let count = 0;
    try { count = parseInt(readFileSync(backoffFile, 'utf-8'), 10) || 0; } catch {}
    count++;
    writeFileSync(backoffFile, String(count));
    const delaySec = Math.min(count * 30, 300); // 30s, 60s, 90s... max 5min
    log('error', `TokenInvalid #${count}, waiting ${delaySec}s before exit`);
    setTimeout(() => process.exit(1), delaySec * 1000);
    return; // prevent further processing
  }
  sendNtfy(`${BOT_NAME} Crash`, msg, 'urgent');
});

// ---------------------------------------------------------------------------
// Singleton guard — 중복 프로세스 방지
// ---------------------------------------------------------------------------

const PID_FILE = join(BOT_HOME, 'state', 'bot.pid');

(function enforceSingleton() {
  if (existsSync(PID_FILE)) {
    const oldPid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    if (oldPid && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0); // 생존 확인
        log('warn', `[Singleton] 기존 프로세스 감지 (PID ${oldPid}) → 종료합니다`);
        process.kill(oldPid, 'SIGTERM');
        // SIGTERM 후 300ms 대기 후 SIGKILL fallback
        const killDeadline = Date.now() + 300;
        while (Date.now() < killDeadline) {
          try { process.kill(oldPid, 0); } catch { break; }
        }
        try { process.kill(oldPid, 'SIGKILL'); } catch { /* 이미 종료됨 */ }
      } catch {
        // oldPid 프로세스 없음 — stale PID 파일
      }
    }
  }
  writeFileSync(PID_FILE, String(process.pid), 'utf8');
  log('info', `[Singleton] PID ${process.pid} 등록 완료`);
})();

// 종료 시 PID 파일 정리
const _cleanupPid = () => { try { rmSync(PID_FILE); } catch { /* ignore */ } };
process.on('exit', _cleanupPid);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN not set in .env');
  process.exit(1);
}

client.login(token);
