/**
 * Slash command and interaction handler — extracted from discord-bot.js.
 *
 * Exports: handleInteraction(interaction, deps)
 *   deps = { sessions, activeProcesses, rateTracker, client, BOT_HOME, BOT_NAME, HOME }
 */

import { readFileSync, existsSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EmbedBuilder } from 'discord.js';
import { log, sendNtfy } from './claude-runner.js';
import { userMemory } from './user-memory.js';
import { t } from './i18n.js';
import { getActivities } from './lounge.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load task IDs from tasks.json for autocomplete */
function getTaskIds(botHome) {
  try {
    const tasksConfig = JSON.parse(readFileSync(join(botHome, 'config', 'tasks.json'), 'utf-8'));
    return (tasksConfig.tasks || []).map(t => ({ name: `${t.id} — ${t.name}`, value: t.id }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// handleInteraction
// ---------------------------------------------------------------------------

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {object} deps
 * @param {import('./session.js').SessionStore} deps.sessions
 * @param {Map} deps.activeProcesses
 * @param {import('./session.js').RateTracker} deps.rateTracker
 * @param {import('discord.js').Client} deps.client
 * @param {string} deps.BOT_HOME
 * @param {string} deps.BOT_NAME
 * @param {string} deps.HOME
 * @param {number} deps.lastMessageAt
 */
export async function handleInteraction(interaction, deps) {
  const { sessions, activeProcesses, rateTracker, client, BOT_HOME, BOT_NAME, HOME } = deps;

  // Cancel button handler
  if (interaction.isButton() && interaction.customId.startsWith('cancel_')) {
    const key = interaction.customId.replace('cancel_', '');
    const proc = activeProcesses.get(key);
    if (proc?.proc) {
      proc.proc.kill('SIGTERM');
      await interaction.reply({ content: t('cmd.cancel.stopped'), ephemeral: true });
    } else {
      await interaction.reply({ content: t('cmd.cancel.noProcess'), ephemeral: true });
    }
    return;
  }

  // Autocomplete for /run id field
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === 'run') {
      const focused = interaction.options.getFocused().toLowerCase();
      const choices = getTaskIds(BOT_HOME)
        .filter(c => c.value.includes(focused) || c.name.toLowerCase().includes(focused))
        .slice(0, 25);
      await interaction.respond(choices);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  // Owner-only guard for sensitive commands
  const OWNER_ID = process.env.OWNER_DISCORD_ID;
  const SENSITIVE = ['run', 'schedule', 'remember', 'alert', 'stop', 'clear'];
  if (OWNER_ID && SENSITIVE.includes(interaction.commandName) && interaction.user.id !== OWNER_ID) {
    await interaction.reply({ content: t('error.ownerOnly'), ephemeral: true });
    return;
  }

  const { commandName } = interaction;

  // Build session key: thread ID for threads, channel+user for channels
  const ch = interaction.channel;
  const sk = ch?.isThread()
    ? ch.id
    : `${ch?.id}-${interaction.user.id}`;

  if (commandName === 'clear') {
    sessions.delete(sk);
    await interaction.reply(t('cmd.clear.done'));
    log('info', 'Session cleared', { sessionKey: sk });

  } else if (commandName === 'stop') {
    const active = activeProcesses.get(sk);
    if (active) {
      active.proc.kill('SIGTERM');
      setTimeout(() => { if (!active.proc.killed) active.proc.kill('SIGKILL'); }, 3000);
      await interaction.reply(t('cmd.stop.stopping', { botName: BOT_NAME }));
      log('info', 'Process stopped via /stop', { sessionKey: sk });
    } else {
      await interaction.reply({ content: t('cmd.stop.noProcess'), ephemeral: true });
    }

  } else if (commandName === 'memory') {
    const memPath = join(BOT_HOME, 'rag', 'memory.md');
    const content = existsSync(memPath) ? readFileSync(memPath, 'utf8') : t('cmd.memory.empty');
    await interaction.reply({ content: content.slice(0, 1900) });

  } else if (commandName === 'remember') {
    const text = interaction.options.getString('content');
    const memPath = join(BOT_HOME, 'rag', 'memory.md');
    const timestamp = new Date().toISOString().slice(0, 10);
    appendFileSync(memPath, `\n- [${timestamp}] ${text}`);
    userMemory.addFact(interaction.user.id, text);
    await interaction.reply({ content: t('cmd.remember.done', { content: text }) });
    log('info', 'Memory saved via /remember', { userId: interaction.user.id, text: text.slice(0, 100) });

  } else if (commandName === 'search') {
    await interaction.deferReply();
    const query = interaction.options.getString('query');
    try {
      const { execFileSync } = await import('node:child_process');
      const result = execFileSync(
        'node', [join(BOT_HOME, 'lib', 'rag-query.mjs'), query],
        { timeout: 10000, encoding: 'utf-8' },
      );
      await interaction.editReply(result.slice(0, 1900) || t('cmd.search.noResult'));
    } catch (err) {
      await interaction.editReply(t('cmd.search.error', { error: err.message?.slice(0, 200) || 'Unknown error' }));
    }

  } else if (commandName === 'threads') {
    const entries = Object.entries(sessions.data);
    if (entries.length === 0) {
      await interaction.reply({ content: t('cmd.threads.empty'), ephemeral: true });
    } else {
      const list = entries
        .slice(0, 20)
        .map(([key, sid]) => `\u2022 \`${key}\` \u2192 \`${sid.id?.slice(0, 8) ?? sid.slice?.(0, 8)}\u2026\``)
        .join('\n');
      await interaction.reply({
        content: `${t('cmd.threads.title', { count: entries.length })}\n${list}`,
        ephemeral: true,
      });
    }

  } else if (commandName === 'alert') {
    const msg = interaction.options.getString('message');
    await sendNtfy(`${BOT_NAME} Alert`, msg, 'high');
    await interaction.reply({ content: t('cmd.alert.done', { message: msg }), ephemeral: true });

  } else if (commandName === 'status') {
    await interaction.deferReply({ ephemeral: true });
    const uptimeSec = Math.floor(process.uptime());
    const uptimeStr = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`;
    const lastMessageAt = deps.lastMessageAt ?? Date.now();
    const silenceSec = Math.floor((Date.now() - lastMessageAt) / 1000);
    const wsStatusNames = ['READY','CONNECTING','RECONNECTING','IDLE','NEARLY','DISCONNECTED','WAITING_FOR_GUILDS','IDENTIFYING','RESUMING'];
    const wsCode = client.ws.status ?? -1;
    const wsStatus = wsStatusNames[wsCode] ?? `UNKNOWN(${wsCode})`;
    const wsHealthy = wsCode === 0;
    const rate = rateTracker.check();
    const memMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const pingMs = client.ws.ping;
    // Context usage from Claude's cache
    let ctxValue = '-';
    try {
      const cachePath = join(HOME, '.claude', 'usage-cache.json');
      if (existsSync(cachePath)) {
        const uc = JSON.parse(readFileSync(cachePath, 'utf-8'));
        ctxValue = t('status.context.value', { fiveH: uc.fiveH?.pct ?? '?', sevenD: uc.sevenD?.pct ?? '?' });
      }
    } catch { /* best effort */ }
    const embed = new EmbedBuilder()
      .setTitle(t('status.title', { botName: BOT_NAME }))
      .setColor(wsHealthy && !rate.warn ? 0x2ecc71 : rate.reject ? 0xe74c3c : 0xf39c12)
      .addFields(
        { name: t('status.ws'), value: `\`${wsStatus}\`${pingMs >= 0 ? ` (${pingMs}ms)` : ''}`, inline: true },
        { name: t('status.uptime'), value: `\`${uptimeStr}\``, inline: true },
        { name: t('status.lastEvent'), value: `\`${t('status.lastEvent.value', { seconds: silenceSec })}\``, inline: true },
        { name: t('status.rateLimit'), value: `\`${rate.count}/${rate.max}\` (${Math.round(rate.pct * 100)}%)`, inline: true },
        { name: t('status.activeProcs'), value: `\`${activeProcesses.size}/${deps.maxConcurrent ?? 2}\``, inline: true },
        { name: t('status.sessions'), value: `\`${t('status.sessions.value', { count: Object.keys(sessions.data).length })}\``, inline: true },
        { name: t('status.memory'), value: `\`${memMB}MB\``, inline: true },
        { name: t('status.context'), value: `\`${ctxValue}\``, inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });

  } else if (commandName === 'tasks') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const { execSync } = await import('node:child_process');
      const logPath = join(BOT_HOME, 'logs', 'cron.log');
      const today = new Date().toISOString().slice(0, 10);
      const raw = execSync(`grep "${today}" "${logPath}" 2>/dev/null | tail -100`, { encoding: 'utf-8' });
      const taskStats = {};
      for (const line of raw.split('\n')) {
        const m = line.match(/\[([^\]]+)\] (SUCCESS|FAIL)/);
        if (!m) continue;
        const [, name, status] = m;
        if (!taskStats[name]) taskStats[name] = { ok: 0, fail: 0 };
        if (status === 'SUCCESS') taskStats[name].ok++;
        else taskStats[name].fail++;
      }
      if (Object.keys(taskStats).length === 0) {
        await interaction.editReply(t('cmd.tasks.noTasks'));
        return;
      }
      const lines = Object.entries(taskStats).map(([name, s]) =>
        `${s.fail > 0 ? '\u274c' : '\u2705'} \`${name}\`: ${t('cmd.tasks.success', { count: s.ok })}${s.fail > 0 ? t('cmd.tasks.fail', { count: s.fail }) : ''}`
      );
      await interaction.editReply(`${t('cmd.tasks.title', { date: today })}\n${lines.join('\n')}`.slice(0, 1900));
    } catch (err) {
      await interaction.editReply(t('cmd.tasks.error', { error: err.message?.slice(0, 200) }));
    }

  } else if (commandName === 'run') {
    const taskId = interaction.options.getString('id');
    const taskIds = getTaskIds(BOT_HOME).map(t => t.value);
    if (!taskIds.includes(taskId)) {
      await interaction.reply({ content: t('cmd.run.notFound', { taskId }), ephemeral: true });
      return;
    }
    await interaction.deferReply();
    try {
      const { execFileSync } = await import('node:child_process');
      const cronScript = join(BOT_HOME, 'bin', 'bot-cron.sh');
      log('info', 'Manual task run via /run', { taskId, user: interaction.user.tag });
      execFileSync('/bin/bash', [cronScript, taskId], {
        timeout: 300_000,
        encoding: 'utf-8',
        env: { ...process.env, HOME },
      });
      const embed = new EmbedBuilder()
        .setTitle(t('cmd.run.done', { taskId }))
        .setColor(0x2ecc71)
        .setDescription(t('cmd.run.doneDesc', { user: interaction.user.tag }))
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const embed = new EmbedBuilder()
        .setTitle(t('cmd.run.fail', { taskId }))
        .setColor(0xe74c3c)
        .setDescription('```\n' + (err.message || 'Unknown error').slice(0, 500) + '\n```')
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
      log('error', 'Manual task run failed', { taskId, error: err.message?.slice(0, 200) });
    }

  } else if (commandName === 'schedule') {
    const task = interaction.options.getString('task');
    const delay = interaction.options.getString('in');
    const delayMs = { '30m': 30, '1h': 60, '2h': 120, '4h': 240, '8h': 480 }[delay] * 60 * 1000;
    const scheduleAt = new Date(Date.now() + delayMs).toISOString();
    const queueDir = join(BOT_HOME, 'queue');
    mkdirSync(queueDir, { recursive: true });
    const fname = join(queueDir, `${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    const payload = { prompt: task, schedule_at: scheduleAt, created_by: interaction.user.tag, channel: interaction.channelId };
    writeFileSync(fname, JSON.stringify(payload, null, 2));
    await interaction.reply(t('cmd.schedule.done', { delay, task }));

  } else if (commandName === 'usage') {
    await interaction.deferReply();
    try {
      const cachePath = join(HOME, '.claude', 'usage-cache.json');
      const cfgPath   = join(HOME, '.claude', 'usage-config.json');
      const statsPath = join(HOME, '.claude', 'stats-cache.json');

      if (!existsSync(cachePath)) {
        await interaction.editReply(t('cmd.usage.noCache'));
        return;
      }

      const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
      const cfg   = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf-8')) : {};
      const limits = cfg.limits ?? {};

      const bar = (pct) => {
        const filled = Math.round(pct / 10);
        return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
      };
      const color = (pct) => pct >= 90 ? 0xed4245 : pct >= 70 ? 0xfee75c : 0x57f287;

      const fiveH  = cache.fiveH  ?? {};
      const sevenD = cache.sevenD ?? {};
      const sonnet = cache.sonnet ?? {};
      const maxPct = Math.max(fiveH.pct ?? 0, sevenD.pct ?? 0, sonnet.pct ?? 0);
      const ts = cache.ts ? new Date(cache.ts) : null;
      const tsStr = ts ? ts.toLocaleString('ko-KR', { timeZone: cfg.timezone ?? 'Asia/Seoul', hour12: false }) : t('cmd.usage.unknown');

      const usageVal = (tier) => t('cmd.usage.value', {
        bar: bar(tier.pct ?? 0),
        pct: tier.pct ?? '?',
        remain: tier.remain ?? '?',
        reset: tier.reset ?? '?',
        resetIn: tier.resetIn ?? '?',
      });

      const embed = new EmbedBuilder()
        .setColor(color(maxPct))
        .setTitle(t('cmd.usage.title'))
        .addFields(
          {
            name: t('cmd.usage.fiveH', { limit: limits.fiveH?.toLocaleString() ?? '?' }),
            value: usageVal(fiveH),
            inline: false,
          },
          {
            name: t('cmd.usage.sevenD', { limit: limits.sevenD?.toLocaleString() ?? '?' }),
            value: usageVal(sevenD),
            inline: false,
          },
          {
            name: t('cmd.usage.sonnet7D', { limit: limits.sonnet7D?.toLocaleString() ?? '?' }),
            value: usageVal(sonnet),
            inline: false,
          },
        )
        .setFooter({ text: t('cmd.usage.cacheFooter', { time: tsStr }) })
        .setTimestamp();

      if (existsSync(statsPath)) {
        try {
          const stats = JSON.parse(readFileSync(statsPath, 'utf-8'));
          const recent = (stats.dailyActivity ?? []).slice(-3).reverse();
          if (recent.length > 0) {
            const rows = recent.map(d => `\`${d.date}\` ${d.messageCount}msg / ${d.toolCallCount}tools`).join('\n');
            embed.addFields({ name: t('cmd.usage.recentActivity'), value: rows, inline: false });
          }
        } catch { /* stats parsing failure ignored */ }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply(t('cmd.usage.error', { error: err.message?.slice(0, 300) || 'Unknown error' }));
      log('error', 'Usage command failed', { error: err.message?.slice(0, 200) });
    }

  } else if (commandName === 'lounge') {
    const activities = getActivities();
    if (activities.length === 0) {
      await interaction.reply({ content: t('cmd.lounge.empty'), ephemeral: true });
    } else {
      const list = activities
        .map(a => {
          const ago = Math.floor((Date.now() - a.ts) / 1000);
          return `\u2022 **${a.taskId}** \u2014 ${a.activity} (${ago}s ago)`;
        })
        .join('\n');
      const embed = new EmbedBuilder()
        .setTitle(t('cmd.lounge.title', { count: activities.length }))
        .setColor(0x5865f2)
        .setDescription(list)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}
