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
      await interaction.reply({ content: '\u23f9\ufe0f Stopped', ephemeral: true });
    } else {
      await interaction.reply({ content: 'No active process', ephemeral: true });
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
  const SENSITIVE = ['run', 'schedule', 'remember', 'alert', 'stop', 'clear', 'memory', 'usage'];
  if (OWNER_ID && SENSITIVE.includes(interaction.commandName) && interaction.user.id !== OWNER_ID) {
    await interaction.reply({ content: '\u26d4 This command is owner-only.', ephemeral: true });
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
    await interaction.reply('Session cleared.');
    log('info', 'Session cleared', { sessionKey: sk });

  } else if (commandName === 'stop') {
    const active = activeProcesses.get(sk);
    if (active) {
      active.proc.kill('SIGTERM');
      setTimeout(() => { if (!active.proc.killed) active.proc.kill('SIGKILL'); }, 3000);
      await interaction.reply(`Stopping ${BOT_NAME} process...`);
      log('info', 'Process stopped via /stop', { sessionKey: sk });
    } else {
      await interaction.reply({ content: 'No active process.', ephemeral: true });
    }

  } else if (commandName === 'memory') {
    const memPath = join(BOT_HOME, 'rag', 'memory.md');
    const content = existsSync(memPath) ? readFileSync(memPath, 'utf8') : 'Memory is empty.';
    await interaction.reply({ content: content.slice(0, 1900) });

  } else if (commandName === 'remember') {
    const text = interaction.options.getString('content');
    const memPath = join(BOT_HOME, 'rag', 'memory.md');
    const timestamp = new Date().toISOString().slice(0, 10);
    appendFileSync(memPath, `\n- [${timestamp}] ${text}`);
    await interaction.reply({ content: `Remembered: ${text}` });
    log('info', 'Memory saved via /remember', { text: text.slice(0, 100) });

  } else if (commandName === 'search') {
    await interaction.deferReply();
    const query = interaction.options.getString('query');
    try {
      const { execFileSync } = await import('node:child_process');
      const result = execFileSync(
        'node', [join(BOT_HOME, 'lib', 'rag-query.mjs'), query],
        { timeout: 10000, encoding: 'utf-8' },
      );
      await interaction.editReply(result.slice(0, 1900) || 'No search results.');
    } catch (err) {
      await interaction.editReply('RAG search failed: ' + (err.message?.slice(0, 200) || 'Unknown error'));
    }

  } else if (commandName === 'threads') {
    const entries = Object.entries(sessions.data);
    if (entries.length === 0) {
      await interaction.reply({ content: 'No active sessions.', ephemeral: true });
    } else {
      const list = entries
        .slice(0, 20)
        .map(([key, sid]) => `\u2022 \`${key}\` \u2192 \`${sid.id?.slice(0, 8) ?? sid.slice?.(0, 8)}\u2026\``)
        .join('\n');
      await interaction.reply({
        content: `**Active sessions (${entries.length})**\n${list}`,
        ephemeral: true,
      });
    }

  } else if (commandName === 'alert') {
    const msg = interaction.options.getString('message');
    await sendNtfy(`${BOT_NAME} Alert`, msg, 'high');
    await interaction.reply({ content: `ntfy sent: ${msg}`, ephemeral: true });

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
    const embed = new EmbedBuilder()
      .setTitle(`${BOT_NAME} System Status`)
      .setColor(wsHealthy && !rate.warn ? 0x2ecc71 : rate.reject ? 0xe74c3c : 0xf39c12)
      .addFields(
        { name: '\ud83d\udd0c WebSocket', value: `\`${wsStatus}\`${pingMs >= 0 ? ` (${pingMs}ms)` : ''}`, inline: true },
        { name: '\u23f1\ufe0f Uptime', value: `\`${uptimeStr}\``, inline: true },
        { name: '\ud83d\udd07 Last event', value: `\`${silenceSec}s ago\``, inline: true },
        { name: '\ud83d\udcca Rate limit', value: `\`${rate.count}/${rate.max}\` (${Math.round(rate.pct * 100)}%)`, inline: true },
        { name: '\u26a1 Active processes', value: `\`${activeProcesses.size}/${deps.maxConcurrent ?? 2}\``, inline: true },
        { name: '\ud83d\udcac Sessions', value: `\`${Object.keys(sessions.data).length}\``, inline: true },
        { name: '\ud83d\udcbe Memory', value: `\`${memMB}MB\``, inline: true },
      )
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });

  } else if (commandName === 'tasks') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const logPath = join(BOT_HOME, 'logs', 'cron.log');
      const today = new Date().toISOString().slice(0, 10);
      const raw = (() => {
        try {
          const content = readFileSync(logPath, 'utf-8');
          const lines = content.split('\n').filter(l => l.includes(today));
          return lines.slice(-100).join('\n');
        } catch { return ''; }
      })();
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
        await interaction.editReply('No cron tasks executed today.');
        return;
      }
      const lines = Object.entries(taskStats).map(([name, s]) =>
        `${s.fail > 0 ? '\u274c' : '\u2705'} \`${name}\`: ${s.ok} success${s.fail > 0 ? ' ' + s.fail + ' failed' : ''}`
      );
      await interaction.editReply(`**Today's task status (${today})**\n${lines.join('\n')}`.slice(0, 1900));
    } catch (err) {
      await interaction.editReply('Failed to read task log: ' + err.message?.slice(0, 200));
    }

  } else if (commandName === 'run') {
    const taskId = interaction.options.getString('id');
    const taskIds = getTaskIds(BOT_HOME).map(t => t.value);
    if (!taskIds.includes(taskId)) {
      await interaction.reply({ content: `\u274c Task ID \`${taskId}\` not found.`, ephemeral: true });
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
        .setTitle(`\u2705 Task completed: \`${taskId}\``)
        .setColor(0x2ecc71)
        .setDescription(`Manually triggered by **${interaction.user.tag}**`)
        .setTimestamp();
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const embed = new EmbedBuilder()
        .setTitle(`\u274c Task failed: \`${taskId}\``)
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
    await interaction.reply(`\u2705 Scheduled to run in **${delay}**\n> ${task}`);

  } else if (commandName === 'usage') {
    await interaction.deferReply();
    try {
      const cachePath = join(HOME, '.claude', 'usage-cache.json');
      const cfgPath   = join(HOME, '.claude', 'usage-config.json');
      const statsPath = join(HOME, '.claude', 'stats-cache.json');

      if (!existsSync(cachePath)) {
        await interaction.editReply('\u274c No usage cache found. Run Claude Code once.');
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
      const tsStr = ts ? ts.toLocaleString('en-US', { timeZone: cfg.timezone ?? 'Asia/Seoul', hour12: false }) : 'Unknown';

      const embed = new EmbedBuilder()
        .setColor(color(maxPct))
        .setTitle('\u26a1 Claude Max Usage')
        .addFields(
          {
            name: `5-hour limit (${limits.fiveH?.toLocaleString() ?? '?'} msgs)`,
            value: `\`${bar(fiveH.pct ?? 0)}\` **${fiveH.pct ?? '?'}%** \u2014 ${fiveH.remain ?? '?'} remaining\nResets: ${fiveH.reset ?? '?'} (${fiveH.resetIn ?? '?'} later)`,
            inline: false,
          },
          {
            name: `7-day limit (${limits.sevenD?.toLocaleString() ?? '?'} msgs)`,
            value: `\`${bar(sevenD.pct ?? 0)}\` **${sevenD.pct ?? '?'}%** \u2014 ${sevenD.remain ?? '?'} remaining\nResets: ${sevenD.reset ?? '?'} (${sevenD.resetIn ?? '?'} later)`,
            inline: false,
          },
          {
            name: `Sonnet 7-day (${limits.sonnet7D?.toLocaleString() ?? '?'} msgs)`,
            value: `\`${bar(sonnet.pct ?? 0)}\` **${sonnet.pct ?? '?'}%** \u2014 ${sonnet.remain ?? '?'} remaining\nResets: ${sonnet.reset ?? '?'} (${sonnet.resetIn ?? '?'} later)`,
            inline: false,
          },
        )
        .setFooter({ text: `Cache updated: ${tsStr}` })
        .setTimestamp();

      if (existsSync(statsPath)) {
        try {
          const stats = JSON.parse(readFileSync(statsPath, 'utf-8'));
          const recent = (stats.dailyActivity ?? []).slice(-3).reverse();
          if (recent.length > 0) {
            const rows = recent.map(d => `\`${d.date}\` ${d.messageCount}msg / ${d.toolCallCount}tools`).join('\n');
            embed.addFields({ name: 'Last 3 days activity', value: rows, inline: false });
          }
        } catch { /* stats parsing failure ignored */ }
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply('\u274c Usage query failed: ' + (err.message?.slice(0, 300) || 'Unknown error'));
      log('error', 'Usage command failed', { error: err.message?.slice(0, 200) });
    }
  }
}
