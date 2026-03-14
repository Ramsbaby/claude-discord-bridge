#!/usr/bin/env bash
# Jarvis Linux/macOS 설치 스크립트
# 실행: chmod +x setup.sh && ./setup.sh

set -e

CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
GRAY='\033[0;37m'
RESET='\033[0m'

echo -e "${CYAN}=== Jarvis 설치 스크립트 ===${RESET}"

# OS 감지
OS="$(uname -s)"
case "$OS" in
  Linux*)   PLATFORM="linux" ;;
  Darwin*)  PLATFORM="mac" ;;
  *)        echo -e "${RED}지원되지 않는 OS: $OS${RESET}"; exit 1 ;;
esac
echo -e "${GRAY}플랫폼 감지: $PLATFORM${RESET}"

# 1. 런타임 감지 (Docker 우선, 없으면 PM2)
echo -e "\n${YELLOW}[1/4] 런타임 확인 중...${RESET}"

USE_DOCKER=false
USE_PM2=false

if command -v docker &>/dev/null; then
  if docker info &>/dev/null 2>&1; then
    USE_DOCKER=true
    DOCKER_VERSION=$(docker --version)
    echo -e "${GREEN}Docker 감지: $DOCKER_VERSION${RESET}"
  else
    echo -e "${GRAY}Docker 설치됨 but 데몬 미실행 — PM2로 폴백${RESET}"
  fi
fi

if [ "$USE_DOCKER" = false ]; then
  if command -v pm2 &>/dev/null; then
    USE_PM2=true
    PM2_VERSION=$(pm2 --version)
    echo -e "${GREEN}PM2 감지: v$PM2_VERSION${RESET}"
  elif command -v node &>/dev/null; then
    echo -e "${YELLOW}PM2 미설치. 설치 중...${RESET}"
    npm install -g pm2
    USE_PM2=true
    echo -e "${GREEN}PM2 설치 완료${RESET}"
  else
    echo -e "${RED}Docker도 Node.js도 없습니다.${RESET}"
    echo "  Docker: https://docs.docker.com/engine/install/"
    echo "  Node.js: https://nodejs.org/"
    exit 1
  fi
fi

# 2. .env 파일 생성
echo -e "\n${YELLOW}[2/4] 환경변수 파일 설정...${RESET}"

if [ ! -f ".env.example" ]; then
  echo -e "${RED}.env.example 파일이 없습니다. 프로젝트 루트 디렉터리에서 실행하세요.${RESET}"
  exit 1
fi

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo -e "${GREEN}.env 파일이 생성됐습니다.${RESET}"
else
  echo -e "${GREEN}.env 파일이 이미 있습니다. 기존 값을 유지하며 업데이트합니다.${RESET}"
fi

# sed in-place 호환 처리 (macOS vs Linux)
sedi() {
  if [ "$PLATFORM" = "mac" ]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# 3. 필수 항목 대화형 입력
echo -e "\n${YELLOW}[3/4] 필수 항목 입력${RESET}"
echo -e "${GRAY}Enter 만 누르면 기존값을 유지합니다.${RESET}"

echo -e "\n${CYAN}--- Discord 봇 토큰 ---${RESET}"
echo -e "${GRAY}취득 방법: https://discord.com/developers/applications → Bot → Reset Token${RESET}"
read -r -p "Discord 봇 토큰: " DISCORD_TOKEN
if [ -n "$DISCORD_TOKEN" ]; then
  sedi "s|DISCORD_TOKEN=.*|DISCORD_TOKEN=$DISCORD_TOKEN|" .env
fi

echo -e "\n${CYAN}--- Anthropic API 키 ---${RESET}"
echo -e "${GRAY}취득 방법: https://console.anthropic.com → API Keys → Create Key${RESET}"
read -r -p "Anthropic API 키: " ANTHROPIC_API_KEY
if [ -n "$ANTHROPIC_API_KEY" ]; then
  sedi "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY|" .env
fi

echo -e "\n${CYAN}--- Discord 서버 ID ---${RESET}"
echo -e "${GRAY}취득 방법: Discord 설정 → 고급 → 개발자 모드 → 서버 우클릭 → 서버 ID 복사${RESET}"
read -r -p "Discord 서버 ID: " GUILD_ID
if [ -n "$GUILD_ID" ]; then
  sedi "s|GUILD_ID=.*|GUILD_ID=$GUILD_ID|" .env
fi

echo -e "\n${CYAN}--- 봇 응답 채널 ID ---${RESET}"
echo -e "${GRAY}취득 방법: 채널 우클릭 → 채널 ID 복사 (여러 채널이면 쉼표 구분, 공백 없이)${RESET}"
read -r -p "채널 ID (예: 123456789,987654321): " CHANNEL_IDS
if [ -n "$CHANNEL_IDS" ]; then
  sedi "s|CHANNEL_IDS=.*|CHANNEL_IDS=$CHANNEL_IDS|" .env
fi

echo -e "\n${CYAN}--- 오너 Discord 사용자 ID ---${RESET}"
echo -e "${GRAY}취득 방법: 본인 프로필 우클릭 → 사용자 ID 복사${RESET}"
read -r -p "오너 Discord 사용자 ID: " OWNER_DISCORD_ID
if [ -n "$OWNER_DISCORD_ID" ]; then
  sedi "s|OWNER_DISCORD_ID=.*|OWNER_DISCORD_ID=$OWNER_DISCORD_ID|" .env
fi

echo -e "\n${GREEN}.env 저장 완료.${RESET}"

# 4. 실행
echo -e "\n${YELLOW}[4/4] Jarvis 시작 중...${RESET}"

if [ "$USE_DOCKER" = true ]; then
  docker compose up -d
  if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}Jarvis 설치 완료! (Docker)${RESET}"
    echo -e "\n${CYAN}유용한 명령어:${RESET}"
    echo "  로그 확인  : docker logs jarvis --follow"
    echo "  상태 확인  : docker compose ps"
    echo "  중지       : docker compose down"
    echo "  재시작     : docker compose restart"
  else
    echo -e "\n${RED}시작 실패. 로그를 확인하세요: docker logs jarvis${RESET}"
    exit 1
  fi

elif [ "$USE_PM2" = true ]; then
  if [ "$PLATFORM" = "linux" ]; then
    pm2 start ecosystem.config.cjs
    pm2 save

    echo -e "\n${GREEN}Jarvis 설치 완료! (PM2)${RESET}"
    echo -e "\n${YELLOW}자동시작 등록을 위해 아래 명령어를 실행하세요:${RESET}"
    pm2 startup systemd 2>/dev/null | tail -1 || true
    echo ""
    echo -e "${CYAN}유용한 명령어:${RESET}"
    echo "  로그 확인  : pm2 logs jarvis-bot"
    echo "  상태 확인  : pm2 list"
    echo "  중지       : pm2 stop jarvis-bot"
    echo "  재시작     : pm2 restart jarvis-bot"
  else
    # macOS: PM2는 실행하지만 launchd 등록은 수동 안내
    pm2 start ecosystem.config.cjs
    pm2 save
    echo -e "\n${GREEN}Jarvis 실행됨 (PM2)${RESET}"
    echo -e "\n${YELLOW}macOS 자동시작(launchd) 등록은 INSTALL.md 를 참고하세요.${RESET}"
    echo -e "${CYAN}유용한 명령어:${RESET}"
    echo "  로그 확인  : pm2 logs jarvis-bot"
    echo "  상태 확인  : pm2 list"
    echo "  중지       : pm2 stop jarvis-bot"
    echo "  재시작     : pm2 restart jarvis-bot"
  fi
fi
