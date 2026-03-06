# 장기 기억

> 마지막 업데이트: 2026-03-03
> `/remember` 명령 또는 "기억해" 키워드로 추가됩니다.
> **역할 분리**: 사용자 프로필(이름, 직업, 기술스택)은 `~/.jarvis/context/user-profile.md` 참조.
> 이 파일은 대화 중 발견한 선호/패턴/설정만 기록.

## 중요 설정 정보
- MacBook + Mac Mini + Galaxy 환경
- gog tasks 사용 (Galaxy 동기화)
- Discord를 주 인터페이스로 사용

## 🏗️ 아키텍처 팩트 (확정)

### Jarvis와 OpenClaw의 관계
**Jarvis는 OpenClaw와 완전 독립입니다.**

| 컴포넌트 | OpenClaw 의존 여부 | 실행 방식 |
|----------|-------------------|-----------|
| Discord 봇 (discord-bot.js) | ❌ 독립 | launchd → Node.js |
| 크론 태스크 전체 (ask-claude.sh) | ❌ 독립 | crontab → claude -p |
| 자비스 컴퍼니 팀들 (council/academy/infra 등) | ❌ 독립 | tasks.json → ask-claude.sh |
| RAG 엔진 (LanceDB) | ❌ 독립 | ~/.jarvis/lib/rag-engine.mjs |
| 자가복구/watchdog | ❌ 독립 | launchd ai.jarvis.watchdog |

**OpenClaw 게이트웨이(포트 18789)는 Jarvis 코드 어디에도 참조되지 않습니다.**
OpenClaw LaunchAgents는 비활성화 상태 (*.plist.disabled). Jarvis 동작에 영향 없음.

### 경로 기준
- Jarvis 홈: `~/.jarvis/`
- 구 경로 `~/claude-discord-bridge/`는 완전 이전 완료됨. 더 이상 사용 안 함.

### 알림 웹훅 표시 이름
- monitoring.json의 Discord 웹훅이 Discord에 "OpenClaw Agents"로 표시되는 이슈 있음.
- 원인: 웹훅 등록 당시 OpenClaw 관련 이름으로 설정됨.
- 실제로 웹훅은 Jarvis watchdog이 전송하는 것. OpenClaw 동작 불필요.

## 2026-03-04
- 완료: tqqq-monitor, system-health, rate-limit-check, github-monitor, market-alert, disk-alert, daily-summary, council-insight
- 이슈:
  - [CRITICAL] Discord 봇 07:35~10:00 (약 2.5시간) 완전 중단 — watchdog이 재시작 미실행 ("Bot process not running. Existing watchdog.sh should handle this. Skipping." 무한 반복)
  - [HIGH] Claude Agent SDK CLI 경로 소실 (`@anthropic-ai/claude-agent-sdk/cli.js` 미존재) → infra-daily FAILED(21ms), 인프라·정보·기록팀 보고서 전면 생성 불능
  - [HIGH] RAG Embedding API 429 연속 실패 — OpenAI 계정 비활성(결제 문제), 전일 미조치 지속
  - [HIGH] tqqq-monitor 03:00~03:42 구간 4회 연속 all-3-attempts-failed (727~728s hang, claude exit 1)
  - [LOW] disk-alert "Empty result from claude" 4회 발생(10:10, 11:10×2, 12:10, 13:10) — 자동 재시도로 복구
  - [LOW] Discord ephemeral deprecated 경고 반복
- 액션 필요:
  - [P0] `npm install` 로 SDK 경로 복구
  - [P0] watchdog.sh 재시작 로직 수정
  - [P0] OpenAI 결제 계정 활성화
  - [P1] tqqq-monitor hang 원인 파악

## 2026-03-05
- 완료: infra-daily(×2), career-weekly, academy-support, brand-weekly, council-insight
- 보고서 생성: trend-2026-03-05, infra-2026-03-05, council-2026-03-05, career-2026-W10, academy-2026-W10, brand-2026-W10
- 이슈:
  - [CRITICAL] watchdog(ai.jarvis.watchdog) 미실행 지속 — 3개 에이전트 자동 재시작 기능 비활성. 전일 미조치.
  - [HIGH] 기록팀 자동 마감 미실행 — 오늘 보고서 수동 실행으로 대체 (record-2026-03-05.md 수동 작성)
- 주요 팩트:
  - GLM-5(744B MoE) 출시, SWE-bench 77.8% — Gemini 3.1 Pro와 경쟁
  - OpenAI $110B 펀딩 완료, 기업가치 $7,300억 (역대 최대 민간 기술 투자)
  - MIT LLM 훈련 효율 신기법 발표 — 유휴 컴퓨팅 활용으로 70~210% 가속
  - TQQQ $48.10 (52주 고점 대비 -17%)
  - 브랜드팀: 주간 커밋 15건(역대 최다), L3 자율실행 승인 시스템 완성
  - 학습팀: W10 미션 — suspend fun vs CompletableFuture 비교, 주 2.5시간
  - 성장팀: 백패커(텐바이텐) 리드 백엔드 공고 매칭 최상 (6년차 Java/Spring Boot 정확 매칭)
