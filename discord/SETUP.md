# Claude Discord Bridge 설정 가이드

## 1. Discord Bot 생성

1. https://discord.com/developers/applications 접속
2. "New Application" → 이름: "MyBot" → Create
3. 좌측 "Bot" 메뉴 → "Reset Token" → **토큰 복사**
4. Bot 설정:
   - ✅ MESSAGE CONTENT INTENT (필수!)
   - ✅ SERVER MEMBERS INTENT
   - ✅ PRESENCE INTENT
5. 좌측 "OAuth2" → URL Generator:
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `Send Messages`, `Create Public Threads`, `Send Messages in Threads`, `Manage Threads`, `Embed Links`, `Read Message History`, `Use Slash Commands`
6. 생성된 URL로 서버에 봇 초대

## 2. .env 설정

```bash
cd ~/claude-discord-bridge/discord
```

`.env` 파일 수정:
```
DISCORD_TOKEN=복사한_봇_토큰
GUILD_ID=서버_ID  (서버 우클릭 → Copy Server ID)
CHANNEL_IDS=채널_ID  (채널 우클릭 → Copy Channel ID)
```

## 3. 수동 실행 테스트

```bash
cd ~/claude-discord-bridge/discord && node discord-bot.js
```

정상이면: `[INFO] Bot logged in as MyBot#1234`

## 4. LaunchAgent 등록 (자동 실행)

```bash
# Discord 봇 등록
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.claude-discord-bot.plist

# Watchdog 등록
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.claude-discord-watchdog.plist

# 확인
launchctl list | grep ai.claude-discord
```

## 5. 트러블슈팅

```bash
# 로그 확인
tail -f ~/claude-discord-bridge/logs/discord-bot.out.log
tail -f ~/claude-discord-bridge/logs/discord-bot.err.log
tail -f ~/claude-discord-bridge/logs/watchdog.log

# 수동 재시작
launchctl kickstart -k gui/$(id -u)/ai.claude-discord-bot

# 서비스 해제
launchctl bootout gui/$(id -u)/ai.claude-discord-bot
```
