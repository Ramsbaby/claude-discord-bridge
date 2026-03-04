# Claude Discord Bridge Setup Guide

## 1. Create a Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" — name it (e.g. "MyBot") — click Create
3. In the left menu, go to "Bot" — click "Reset Token" — **copy the token**
4. Bot settings:
   - MESSAGE CONTENT INTENT (required!)
   - SERVER MEMBERS INTENT
   - PRESENCE INTENT
5. In the left menu, go to "OAuth2" — URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Create Public Threads`, `Send Messages in Threads`, `Manage Threads`, `Embed Links`, `Read Message History`, `Use Slash Commands`
6. Use the generated URL to invite the bot to your server

## 2. Configure .env

```bash
cd ~/claude-discord-bridge/discord
```

Edit the `.env` file:
```
DISCORD_TOKEN=your_bot_token
GUILD_ID=your_server_id  (right-click server → Copy Server ID)
CHANNEL_IDS=your_channel_id  (right-click channel → Copy Channel ID)
```

## 3. Manual Test Run

```bash
cd ~/claude-discord-bridge/discord && node discord-bot.js
```

If everything is working: `[INFO] Bot logged in as MyBot#1234`

## 4. Register as LaunchAgent (Auto-Start)

```bash
# Register the Discord bot
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.claude-discord-bot.plist

# Register the watchdog
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.claude-discord-watchdog.plist

# Verify
launchctl list | grep ai.claude-discord
```

## 5. Troubleshooting

```bash
# Check logs
tail -f ~/claude-discord-bridge/logs/discord-bot.out.log
tail -f ~/claude-discord-bridge/logs/discord-bot.err.log
tail -f ~/claude-discord-bridge/logs/watchdog.log

# Manual restart
launchctl kickstart -k gui/$(id -u)/ai.claude-discord-bot

# Unregister the service
launchctl bootout gui/$(id -u)/ai.claude-discord-bot
```
