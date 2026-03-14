# Jarvis Windows 설치 스크립트
# 실행: PowerShell을 관리자 권한으로 열고 .\setup.ps1 실행

$ErrorActionPreference = "Stop"
$JarvisHome = "$env:USERPROFILE\.jarvis"

Write-Host "=== Jarvis 설치 스크립트 ===" -ForegroundColor Cyan

# 1. Docker Desktop 설치 여부 확인
Write-Host "`n[1/4] Docker Desktop 확인 중..." -ForegroundColor Yellow
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker가 설치되지 않았습니다." -ForegroundColor Red
    Write-Host "https://www.docker.com/products/docker-desktop/ 에서 설치 후 재실행하세요."
    Write-Host ""
    Write-Host "설치 전 WSL2도 활성화하세요 (PowerShell 관리자 권한에서):" -ForegroundColor Yellow
    Write-Host "  wsl --install" -ForegroundColor White
    exit 1
}
$dockerVersion = docker --version
Write-Host "Docker 확인: $dockerVersion" -ForegroundColor Green

# Docker 데몬 실행 여부 확인 (외부 명령은 $ErrorActionPreference 무관 → $LASTEXITCODE 사용)
docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop이 실행 중이지 않습니다." -ForegroundColor Red
    Write-Host "트레이에서 Docker Desktop을 시작한 후 재실행하세요."
    exit 1
}
Write-Host "Docker 데몬: 실행 중" -ForegroundColor Green

# 2. .env 파일 생성
Write-Host "`n[2/4] 환경변수 파일 설정..." -ForegroundColor Yellow
if (-not (Test-Path ".env")) {
    if (-not (Test-Path ".env.example")) {
        Write-Host ".env.example 파일이 없습니다. 프로젝트 루트 디렉터리에서 실행하세요." -ForegroundColor Red
        exit 1
    }
    Copy-Item ".env.example" ".env"
    Write-Host ".env 파일이 생성됐습니다." -ForegroundColor Green
} else {
    Write-Host ".env 파일이 이미 있습니다. 기존 값을 유지하며 업데이트합니다." -ForegroundColor Green
}

# 3. 필수 항목 대화형 입력
Write-Host "`n[3/4] 필수 항목 입력" -ForegroundColor Yellow
Write-Host "Enter 만 누르면 기존값을 유지합니다." -ForegroundColor DarkGray
Write-Host ""

$envContent = Get-Content ".env" -Raw

Write-Host "--- Discord 봇 토큰 ---" -ForegroundColor DarkCyan
Write-Host "취득 방법: https://discord.com/developers/applications → Bot → Reset Token" -ForegroundColor DarkGray
$discordToken = Read-Host "Discord 봇 토큰"
if ($discordToken) {
    $envContent = $envContent -replace "DISCORD_TOKEN=.*", "DISCORD_TOKEN=$discordToken"
}

Write-Host ""
Write-Host "--- Anthropic API 키 ---" -ForegroundColor DarkCyan
Write-Host "취득 방법: https://console.anthropic.com → API Keys → Create Key" -ForegroundColor DarkGray
$anthropicKey = Read-Host "Anthropic API 키"
if ($anthropicKey) {
    $envContent = $envContent -replace "ANTHROPIC_API_KEY=.*", "ANTHROPIC_API_KEY=$anthropicKey"
}

Write-Host ""
Write-Host "--- Discord 서버 ID ---" -ForegroundColor DarkCyan
Write-Host "취득 방법: Discord 설정 → 고급 → 개발자 모드 활성화 → 서버 우클릭 → 서버 ID 복사" -ForegroundColor DarkGray
$guildId = Read-Host "Discord 서버 ID"
if ($guildId) {
    $envContent = $envContent -replace "GUILD_ID=.*", "GUILD_ID=$guildId"
}

Write-Host ""
Write-Host "--- 봇 응답 채널 ID ---" -ForegroundColor DarkCyan
Write-Host "취득 방법: 채널 우클릭 → 채널 ID 복사 (여러 채널이면 쉼표 구분, 공백 없이)" -ForegroundColor DarkGray
$channelIds = Read-Host "채널 ID (예: 123456789,987654321)"
if ($channelIds) {
    $envContent = $envContent -replace "CHANNEL_IDS=.*", "CHANNEL_IDS=$channelIds"
}

Write-Host ""
Write-Host "--- 오너 Discord 사용자 ID ---" -ForegroundColor DarkCyan
Write-Host "취득 방법: 본인 프로필 우클릭 → 사용자 ID 복사" -ForegroundColor DarkGray
$ownerDiscordId = Read-Host "오너 Discord 사용자 ID"
if ($ownerDiscordId) {
    $envContent = $envContent -replace "OWNER_DISCORD_ID=.*", "OWNER_DISCORD_ID=$ownerDiscordId"
}

Write-Host ""
Write-Host "--- Claude CLI 인증 경로 ---" -ForegroundColor DarkCyan
Write-Host "claude auth login 으로 인증한 계정의 자격증명 폴더 경로입니다." -ForegroundColor DarkGray
Write-Host "기본값: $env:USERPROFILE (Enter 누르면 자동 설정)" -ForegroundColor DarkGray
$claudeHome = Read-Host "Claude 홈 경로 (기본: $env:USERPROFILE)"
if (-not $claudeHome) { $claudeHome = $env:USERPROFILE }
# Windows 경로를 Docker 볼륨용 슬래시 형식으로 변환 (C:\Users\foo → C:/Users/foo)
$claudeHome = $claudeHome -replace "\\", "/"
$envContent = $envContent -replace "# CLAUDE_HOME=.*", "CLAUDE_HOME=$claudeHome"
if ($envContent -notmatch "CLAUDE_HOME=") {
    $envContent += "`nCLAUDE_HOME=$claudeHome"
}

Set-Content ".env" $envContent -NoNewline
Write-Host ""
Write-Host "Claude 인증 경로 설정: $claudeHome" -ForegroundColor Green
Write-Host ""
Write-Host ".env 저장 완료." -ForegroundColor Green

# 4. Docker Compose 실행
Write-Host "`n[4/4] Jarvis 시작 중..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Jarvis 설치 완료!" -ForegroundColor Green
    Write-Host ""
    Write-Host "유용한 명령어:" -ForegroundColor Cyan
    Write-Host "  로그 확인  : docker logs jarvis --follow" -ForegroundColor White
    Write-Host "  상태 확인  : docker compose ps" -ForegroundColor White
    Write-Host "  중지       : docker compose down" -ForegroundColor White
    Write-Host "  재시작     : docker compose restart" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "시작 실패. 아래를 확인하세요:" -ForegroundColor Red
    Write-Host "  로그 확인  : docker logs jarvis" -ForegroundColor White
    Write-Host "  WSL2 확인  : wsl --status" -ForegroundColor White
    Write-Host "  Docker 확인: docker info" -ForegroundColor White
}
