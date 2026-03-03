/**
 * L3 Approval Workflow — Discord button-based approval for autonomous actions.
 *
 * Exports:
 *   requestApproval(channel, opts)          — send Approve/Reject buttons
 *   handleApprovalInteraction(interaction)   — process button clicks
 *   pollL3Requests(client)                  — pick up bash-originated .json requests
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const BOT_HOME = process.env.BOT_HOME || join(homedir(), '.jarvis');
const PENDING_FILE = join(BOT_HOME, 'state', 'pending-approvals.json');
const L3_REQUESTS_DIR = join(BOT_HOME, 'state', 'l3-requests');

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function loadPending() {
  if (!existsSync(PENDING_FILE)) return {};
  try { return JSON.parse(readFileSync(PENDING_FILE, 'utf8')); } catch { return {}; }
}

function savePending(data) {
  mkdirSync(join(BOT_HOME, 'state'), { recursive: true });
  writeFileSync(PENDING_FILE, JSON.stringify(data, null, 2));
}

function cleanExpired() {
  const pending = loadPending();
  const now = Date.now();
  let changed = false;
  for (const [id, entry] of Object.entries(pending)) {
    if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
      delete pending[id];
      changed = true;
    }
  }
  if (changed) savePending(pending);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send an approval request to a Discord channel with Approve/Reject buttons.
 * @param {import('discord.js').TextChannel} channel
 * @param {{ label: string, description: string, script: string, args?: string[] }} opts
 * @returns {Promise<string>} actionId
 */
export async function requestApproval(channel, { label, description, script, args = [] }) {
  cleanExpired();

  const actionId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`l3approve:${actionId}`)
      .setLabel('✅ 승인')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`l3reject:${actionId}`)
      .setLabel('❌ 거부')
      .setStyle(ButtonStyle.Danger),
  );

  const msg = await channel.send({
    content: `**[L3 자율실행 승인 요청]**\n**${label}**\n${description}`,
    components: [row],
  });

  const pending = loadPending();
  pending[actionId] = {
    label,
    description,
    script,
    args,
    requestedAt: now.toISOString(),
    expiresAt,
    channelId: channel.id,
    messageId: msg.id,
  };
  savePending(pending);

  return actionId;
}

/**
 * Handle a button interaction from interactionCreate.
 * @returns {Promise<boolean>} true if this interaction was an L3 approval button
 */
export async function handleApprovalInteraction(interaction) {
  if (!interaction.isButton()) return false;

  const { customId } = interaction;
  if (!customId.startsWith('l3approve:') && !customId.startsWith('l3reject:')) return false;

  const [action, actionId] = customId.split(':');
  cleanExpired();
  const pending = loadPending();
  const entry = pending[actionId];

  if (!entry) {
    await interaction.reply({ content: '⏰ 만료되었거나 이미 처리된 요청입니다.', ephemeral: true });
    return true;
  }

  delete pending[actionId];
  savePending(pending);

  if (action === 'l3reject') {
    // Update original message to show rejection, remove buttons
    await interaction.update({
      content: `❌ **거부됨** — ${entry.label}`,
      components: [],
    });
    return true;
  }

  // Approve: defer, execute, report result
  await interaction.deferReply();
  const result = execApprovedAction(entry);
  await interaction.editReply({ content: `✅ **승인 완료** — ${entry.label}\n\`\`\`\n${result}\n\`\`\`` });

  // Remove buttons from original message
  try {
    const channel = interaction.channel;
    if (channel && entry.messageId) {
      const origMsg = await channel.messages.fetch(entry.messageId).catch(() => null);
      if (origMsg) {
        await origMsg.edit({ components: [] });
      }
    }
  } catch { /* best effort */ }

  return true;
}

/**
 * Execute an approved L3 action script.
 * Uses execFileSync (no shell) for safety.
 * @returns {string} stdout (truncated to 1500 chars)
 */
function execApprovedAction({ script, args = [] }) {
  try {
    const output = execFileSync(script, args, {
      timeout: 30_000,
      encoding: 'utf8',
      env: { ...process.env, BOT_HOME },
    });
    return (output || '').trim().slice(0, 1500) || '(no output)';
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : '';
    const msg = stderr || err.message || 'Unknown error';
    return `ERROR: ${msg.slice(0, 500)}`;
  }
}

/**
 * Poll l3-requests directory for bash-originated approval requests.
 * Called on a 10s interval from the bot.
 */
export async function pollL3Requests(client) {
  if (!existsSync(L3_REQUESTS_DIR)) return;

  const files = readdirSync(L3_REQUESTS_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const filePath = join(L3_REQUESTS_DIR, file);
    try {
      const req = JSON.parse(readFileSync(filePath, 'utf8'));
      unlinkSync(filePath); // consume immediately

      const channel = client.channels.cache.get(req.channelId) ||
        await client.channels.fetch(req.channelId).catch(() => null);
      if (!channel) continue;

      await requestApproval(channel, req);
    } catch (err) {
      console.error(`[approval] pollL3Requests error: ${err.message}`);
    }
  }
}
