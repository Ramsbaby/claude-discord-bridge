# Jarvis 설치 가이드

Jarvis는 macOS 네이티브, Linux, Windows(Docker) 환경을 지원합니다.

---

## macOS (네이티브) — 권장

### 요구사항
- macOS 12+
- Node.js 22+
- Homebrew

### 설치

```bash
git clone https://github.com/Ramsbaby/claude-discord-bridge ~/.jarvis
cd ~/.jarvis
cp .env.example .env
# .env 파일 열어서 토큰 입력
```

### 환경변수 설정

`.env` 파일에서 필수 항목 입력:

```bash
DISCORD_TOKEN=your_discord_bot_token
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### 실행 (launchd — 자동시작)

```bash
# LaunchAgent 등록
cp ~/Library/LaunchAgents/ai.jarvis.discord-bot.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/ai.jarvis.discord-bot.plist

# 상태 확인
launchctl list | grep jarvis
```

### 실행 (PM2 — 대안)

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 startup && pm2 save
```

---

## Linux (네이티브)

### 요구사항
- Ubuntu 22.04+ / Debian 12+ / RHEL 9+
- Node.js 22+
- PM2

### 설치

```bash
git clone https://github.com/Ramsbaby/claude-discord-bridge ~/.jarvis
cd ~/.jarvis
cp .env.example .env
nano .env  # 토큰 입력
```

### 실행 (PM2 + systemd)

```bash
npm install -g pm2
cd ~/.jarvis
pm2 start ecosystem.config.cjs
pm2 startup systemd  # 자동시작 등록 명령어 출력됨
pm2 save
```

### 상태 확인

```bash
pm2 list
pm2 logs jarvis-bot --lines 50
```

---

## Windows (Docker Desktop) — Windows 유저 권장

### 요구사항
- Windows 10 21H2+ / Windows 11
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (무료)
- Git for Windows

### 설치

**1. Docker Desktop 설치**
- https://www.docker.com/products/docker-desktop/ 에서 다운로드 및 설치
- 설치 후 Docker Desktop 실행 확인

**2. 프로젝트 클론**

PowerShell 또는 Git Bash:
```powershell
git clone https://github.com/Ramsbaby/claude-discord-bridge $env:USERPROFILE\.jarvis
cd $env:USERPROFILE\.jarvis
```

**3. 환경변수 설정**

```powershell
copy .env.example .env
notepad .env
```

`.env` 파일에서 필수 항목 입력:
```
DISCORD_TOKEN=your_discord_bot_token
ANTHROPIC_API_KEY=your_anthropic_api_key
```

**4. 실행**

```powershell
docker compose up -d
```

**5. 상태 확인**

```powershell
docker logs jarvis --follow
docker compose ps
```

**6. 중지**

```powershell
docker compose down
```

---

## 공통: 환경변수 레퍼런스

| 변수 | 필수 | 설명 |
|------|------|------|
| `DISCORD_TOKEN` | ✅ | Discord 봇 토큰 |
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API 키 |
| `JARVIS_HOME` | ❌ | 설치 경로 (기본: `~/.jarvis`) |
| `NODE_ENV` | ❌ | 환경 (기본: `production`) |
| `GOOGLE_CLIENT_ID` | ❌ | Google Calendar 연동 |
| `GOOGLE_CLIENT_SECRET` | ❌ | Google Calendar 연동 |

---

## 트러블슈팅

### Discord 봇이 응답하지 않음
```bash
# 로그 확인
pm2 logs jarvis-bot --lines 100     # Linux/macOS
docker logs jarvis --tail 100        # Windows/Docker
```

### PM2 프로세스 재시작
```bash
pm2 restart jarvis-bot
```

### Docker 컨테이너 재빌드
```bash
docker compose down
docker compose up -d --build
```

---

## 지원 OS 매트릭스

| OS | 방식 | 자동시작 | 상태 |
|----|------|----------|------|
| macOS 12+ | launchd 또는 PM2 | ✅ | ✅ 공식 지원 |
| Ubuntu 22.04+ | PM2 + systemd | ✅ | ✅ 지원 |
| Windows 10/11 | Docker Desktop | ✅ | ✅ 지원 |
| Windows (WSL2) | PM2 | ✅ | ⚠️ 실험적 |
