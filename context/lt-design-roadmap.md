# LT 설계 로드맵

_작성일: 2026-03-14_
_작성자: Claude Opus 4.6 (자동 생성)_

---

## LT-2: Opus+Sonnet 오케스트레이터/서브에이전트 비용 최적화

### 현재 상태

**모델 등급 정의** (`~/.jarvis/config/models.json`):
```
budget  → claude-haiku-4-5-20251001
small   → claude-sonnet-4-6
medium  → claude-sonnet-4-6
large   → claude-opus-4-6
```

**태스크별 모델 배분 현황** (`tasks.json` 분석):

| 모델 | 태스크 수 | 대표 태스크 |
|------|----------|------------|
| `claude-sonnet-4-6` (명시) | 14개 | morning-standup, tqqq-monitor, weekly-report, council-insight, infra-daily 등 |
| `claude-haiku-4-5` (명시) | 10개 | daily-summary, system-health, disk-alert, rate-limit-check 등 |
| 미지정 (MODELS.medium=Sonnet 적용) | 나머지 | code-auditor, dev-runner 등 |

**company-agent.mjs 모델 선택 로직**:
- 263행: `model: MODELS.medium` 하드코딩 → 모든 팀 에이전트가 Sonnet으로 실행
- team.yml에 모델 오버라이드 필드 없음
- Opus(`MODELS.large`)는 사용 경로가 없음 (Discord 봇의 `contextBudget: 'large'`에서만 사용)

**Discord 봇 모델 선택** (`claude-runner.js`):
- 694~696행: `contextBudget`에 따라 small/medium/large 매핑
- `large` 예산 시 Opus 사용, `medium` 시 Sonnet 사용
- `contextBudget`은 사용자 메시지 복잡도 기반 자동 분류 (`context-budget.js`)

**핵심 발견**: Opus가 오케스트레이터 역할을 할 수 있는 구조적 경로가 현재 존재하지 않음. company-agent.mjs의 `runTeam()`이 단일 `query()` 호출로 모든 작업을 수행하며, 오케스트레이터/서브에이전트 분리 개념이 없음.

### 목표 아키텍처

```
현재:
  Sonnet → 단일 세션으로 전체 태스크 실행 (도구 호출 포함)

목표:
  ┌─────────────────────────────────┐
  │  Opus (오케스트레이터)            │
  │  - 태스크 분해 및 실행 계획       │
  │  - 서브에이전트 결과 종합/판단     │
  │  - 최종 보고서 품질 보장          │
  │  maxTurns: 5~10 (경량)           │
  └────────────┬──────────────────┘
               │ agents 필드 활용
               ▼
  ┌─────────────────────────────────┐
  │  Sonnet (서브에이전트, 1~N개)     │
  │  - 데이터 수집 (Bash, Read 등)   │
  │  - 계산/분석 실행                │
  │  - 도구 호출 전담               │
  │  maxTurns: 20~30                │
  └─────────────────────────────────┘
```

**구현 전략**: team.yml의 `agents` 필드가 이미 존재 (team-loader.mjs 88~97행). 현재는 서브에이전트의 모델을 별도 지정하는 기능이 없으나, SDK `query()`의 `agents` 옵션에 `model` 필드를 전달하면 서브에이전트별 모델 분리가 가능할 수 있음.

**비용 절감 효과 추정**:
- Claude Max 구독제 환경에서는 직접적인 달러 비용 절감 효과 없음
- 대신 Rate Limit 관점의 최적화 효과:
  - Opus 오케스트레이터: 짧은 턴(5~10턴) → 낮은 토큰 소모
  - Sonnet 서브에이전트: 도구 호출 위주 → 효율적 토큰 사용
  - 전체 Opus 토큰 사용량 감소 → 5시간/7일 Rate Limit 여유 확보
- API 키 기반 환경 전환 시: Opus $15/Sonnet $3 단가 차이로 약 40~60% 비용 절감 가능

### 구현 단계

**Phase 1: team.yml에 모델 필드 도입 (1~2일)**
- `team-loader.mjs`에서 `yml.model` 읽어 team 객체에 포함
- `company-agent.mjs` 263행의 `MODELS.medium` 하드코딩을 `team.model || MODELS.medium`으로 변경
- 고가치 팀(council, standup)에만 `model: large` 설정
- 변경 파일: `team-loader.mjs`, `company-agent.mjs`, 해당 team.yml 2~3개

**Phase 2: agents 필드에 모델 분리 적용 (2~3일)**
- `team-loader.mjs`의 agents 빌드에 `model` 필드 전달
- `company-agent.mjs`에서 `opts.agents`에 모델 정보 포함
- SDK `query()` agents 옵션의 모델 지정 지원 여부 확인 필요 (SDK 문서 확인)
- 변경 파일: `team-loader.mjs`, `company-agent.mjs`, team.yml 내 agents 섹션

**Phase 3: 모니터링 및 튜닝 (1주)**
- 태스크별 Opus/Sonnet 토큰 사용량 로깅 추가
- Rate Limit 추적기(`rate-tracker.json`)에 모델별 분리 카운트 반영
- 실제 절감 효과 측정 후 오케스트레이터 대상 팀 확대/축소

### 예상 작업량

| 항목 | 수정 줄수 | 파일 수 |
|------|----------|---------|
| Phase 1 | ~15줄 | 3~5개 (team-loader.mjs, company-agent.mjs, team.yml 2~3개) |
| Phase 2 | ~30줄 | 3~4개 (team-loader.mjs, company-agent.mjs, team.yml agents 섹션) |
| Phase 3 | ~40줄 | 2~3개 (company-agent.mjs 로깅, rate-limit-check.sh) |
| **합계** | **~85줄** | **6~10개** |

### 리스크

1. **SDK agents 모델 분리 미지원**: `@anthropic-ai/claude-agent-sdk`의 `agents` 옵션이 서브에이전트별 모델 지정을 지원하지 않을 수 있음. 이 경우 Phase 2는 SDK PR 또는 우회 구현(별도 `query()` 호출 + 결과 주입) 필요 → 복잡도 대폭 증가
2. **Opus Rate Limit 별도 카운팅**: Claude Max 구독에서 Opus/Sonnet 한도가 공유인지 분리인지 확인 필요. 공유라면 비용 최적화 효과 반감
3. **오케스트레이터 품질 저하**: Opus 턴을 너무 줄이면 판단 품질 하락. 최소 5턴 보장 필요
4. **하위 호환성**: 기존 team.yml에 model 필드가 없는 팀은 기본값(Sonnet) 유지 필수

---

## LT-3: Cursor Automations 스타일 이벤트 트리거

### 현재 상태

**event-watcher.sh (178줄, 완전 구현됨)**:
- LaunchAgent 데몬으로 상시 실행, 30초 간격 폴링
- `~/.jarvis/state/events/*.trigger` 파일 감지
- tasks.json의 `event_trigger` 필드와 매칭하여 해당 태스크 실행
- debounce 지원 (`event_trigger_debounce_s`)
- 새벽 무음 시간대(KST 00:00~06:00) 이벤트 지연 처리
- `bot-cron.sh`를 통한 태스크 실행 (sentinel lock 기반 중복 방지)

**emit-event.sh (73줄, 완전 구현됨)**:
- `emit-event.sh <event_name> [json_payload]` 형식
- trigger 파일에 JSON 메타데이터 기록 (이벤트명, 타임스탬프, 페이로드)
- 이벤트명 유효성 검사 (영문/숫자/점/하이픈/언더스코어)

**등록된 이벤트 트리거 (tasks.json 기준, 10종)**:
```
morning.trigger         → morning-standup (86400s debounce)
market.emergency        → tqqq-monitor (900s)
system.alert           → system-health (300s)
github.push            → github-monitor (300s)
disk.threshold_exceeded → disk-alert (1800s)
claude.rate_limit_warning → rate-limit-check (900s)
task.failed            → auto-diagnose (120s)
github.pr_opened       → github-pr-handler (60s)
discord.mention        → discord-mention-handler (30s)
system.cost_alert      → cost-alert-handler (300s)
```

**company-agent.mjs 이벤트 라우팅 (별도 경로)**:
- `EVENT_ROUTES` 객체로 5종 이벤트 → 팀 매핑 (tqqq-critical, disk-critical, claude-overload 등)
- `--event <type> --data '{}'` CLI 인터페이스
- 이벤트 로그: `state/event-bus.jsonl`

**현재 갭 분석**:
1. GitHub Webhook → emit-event.sh 연동: 설계 문서만 존재 (`event-triggers.md` 72~93행), 실제 HTTP 리스너 미구현
2. Discord 메시지 이벤트 → 태스크 트리거: `discord.mention` 이벤트는 등록되었으나, 실제 Discord 봇 코드에서 `emit-event.sh`를 호출하는 로직 미확인
3. 이벤트 체이닝 없음: 이벤트 A → 태스크 B 실행 → 이벤트 C 발생 구조 미지원
4. Cursor Automations의 핵심인 "파일 변경 감지 → 자동 실행" 패턴 미구현

### 목표 아키텍처

```
Cursor Automations 스타일 목표 구조:

┌───────────────────────────────────────────────────┐
│               이벤트 소스 레이어                    │
├───────────┬─────────────┬─────────────────────────┤
│ GitHub    │  Discord    │  파일시스템 (fswatch)     │
│ Webhook   │  Bot Event  │  - CLAUDE.md 변경        │
│ (smee.io  │  - 멘션     │  - config/*.json 변경    │
│  proxy)   │  - 키워드   │  - teams/*.yml 변경      │
│           │  - 리액션   │                         │
└─────┬─────┴──────┬──────┴───────────┬─────────────┘
      │            │                  │
      ▼            ▼                  ▼
┌───────────────────────────────────────────────────┐
│         이벤트 버스 (event-bus.sh 통합)             │
│   emit-event.sh <event> [payload]                  │
│   → state/events/<event>.trigger                   │
│                                                   │
│   이벤트 체이닝: 태스크 완료 → 후속 이벤트 발행     │
│   조건부 트리거: payload 조건 매칭 (jq 기반)        │
└───────────────────┬───────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────┐
│         event-watcher.sh (기존 + 확장)             │
│   - 기존 30초 폴링 유지                            │
│   - 이벤트 체이닝 지원                             │
│   - 조건부 실행 (payload 필터)                     │
└───────────────────────────────────────────────────┘
```

### 구현 단계

**Phase 1: GitHub Webhook 수신기 구현 (2~3일)**
- `~/.jarvis/scripts/webhook-listener.sh` 신규 작성
  - `smee-client`를 통한 GitHub Webhook 수신 (로컬 개발환경 호환)
  - 또는 `python3 -m http.server` 기반 경량 HTTP 리스너
  - Webhook payload 파싱 → `emit-event.sh github.pr_opened '{"repo":"...", "pr_number":...}'` 호출
- LaunchAgent plist 추가 (`ai.jarvis.webhook-listener.plist`)
- 지원 이벤트: `github.pr_opened`, `github.push`, `github.issue_opened`

**Phase 2: Discord 봇 이벤트 발행 연동 (1~2일)**
- `handlers.js`에서 특정 조건 충족 시 `emit-event.sh` 호출:
  - 봇 멘션 감지 → `emit-event.sh discord.mention`
  - 특정 키워드(예: "긴급", "장애") → `emit-event.sh system.alert`
- `child_process.execFile` 비동기 호출 (fire-and-forget, 메인 응답 차단 없음)

**Phase 3: 파일시스템 감지 + 이벤트 체이닝 (3~5일)**
- `fswatch` 기반 설정 파일 변경 감지 → 자동 reload 이벤트 발행
  - `config/*.json` 변경 → `emit-event.sh config.changed`
  - `teams/*.yml` 변경 → `emit-event.sh team.config_changed`
- tasks.json에 `post_event` 필드 추가: 태스크 성공 시 후속 이벤트 발행
  - 예: `infra-daily` 완료 후 이상 발견 시 → `emit-event.sh infra.anomaly_detected`
- event-watcher.sh 확장: `post_event` 실행 로직 추가 (~20줄)

### 예상 작업량

| 항목 | 수정/신규 줄수 | 파일 수 |
|------|--------------|---------|
| Phase 1 | ~120줄 신규 | 2~3개 (webhook-listener.sh, plist, 설정) |
| Phase 2 | ~25줄 수정 | 1~2개 (handlers.js, 유틸리티) |
| Phase 3 | ~80줄 (수정 30 + 신규 50) | 3~4개 (event-watcher.sh, tasks.json, fswatch 스크립트, plist) |
| **합계** | **~225줄** | **6~9개** |

### 리스크

1. **GitHub Webhook 수신 환경**: 로컬 Mac에서 외부 Webhook 수신은 smee.io 프록시 의존. 네트워크 단절 시 이벤트 유실. ngrok 또는 Cloudflare Tunnel 대안 고려 필요
2. **이벤트 폭풍**: 파일시스템 감지(fswatch)가 빈번한 파일 변경 시 이벤트 과다 발생 가능. debounce 정책 필수 (최소 30초)
3. **emit-event.sh 동시 호출 경합**: 여러 소스에서 동시에 같은 이벤트명으로 emit 시 trigger 파일 덮어쓰기 경합. 현재 구현은 "최신 우선"이므로 이전 이벤트 유실 가능
4. **보안**: Webhook 리스너가 외부 HTTP 요청을 수신하므로, 시크릿 검증(HMAC-SHA256) 미구현 시 위조 이벤트 주입 위험
5. **LaunchAgent 관리 복잡도 증가**: event-watcher + webhook-listener + fswatch 등 데몬 증가 → watchdog 감시 대상 추가 필요

---

## LT-4: Windsurf Continue My Work -- 세션 재시작 이어받기

### 현재 상태

**세션 관리 메커니즘** (`claude-runner.js`):
```
세션 식별: threadId + userId 조합 → sessionKey
세션 저장: ~/.jarvis/state/sessions.json
  {
    "threadId-userId": {
      "id": "uuid (Claude SDK session_id)",
      "updatedAt": timestamp_ms,
      "tokenCount": number
    }
  }
```

- `isResuming` (643행): `sessionId`가 존재하면 true → SDK `queryOptions.resume = sessionId`로 세션 이어받기
- `promptVersion` (600행): 시스템 프롬프트의 STABLE 섹션 MD5 해시 → 변경 시 강제 새 세션 (758~765행)
- 세션 당 토큰 추적: `sessionTokenCounts` Map (handlers.js, in-memory + sessions.json 백업)
- 컴팩션: 80,000 토큰 초과 시 SDK 네이티브 컴팩션 + AI 시맨틱 컴팩션 (haiku)

**session-summary.js (현재 구현)**:
- `saveSessionSummary(sessionKey, userText, assistantText)`: 최근 10턴 원문 저장
  - 저장 위치: `~/.jarvis/state/session-summaries/{sessionKey}.md`
  - 위험 명령 필터링 (rm -rf, kill -9 등)
- `loadSessionSummary(sessionKey)`: 세션 요약 로드 → "이전 세션 요약" 헤더 포함
- `compactSessionWithAI(sessionKey)`: haiku로 5-섹션 구조화 요약 생성
  - 섹션: 사용자 의도 / 완료된 작업 / 오류 및 수정 / 미완 작업 / 핵심 참조
  - `<!-- compacted at ... -->` 헤더로 컴팩트 여부 표시

**handlers.js 세션 resume 흐름**:
- 스레드에 기존 세션 존재 → `createClaudeSession({sessionId})` 호출
- SDK resume 실패 시 → 새 세션 생성 + `loadSessionSummary()`로 이전 컨텍스트 주입
- 타임아웃(90초) 발생 시 → `_savePendingTask()`로 프롬프트 보존 → "계속" 입력 시 재주입

**기존 세션 요약 디렉토리 현황**: 14개 세션 파일, `.bak` 파일 3개 (컴팩션 전 백업)

**Windsurf "Continue My Work" vs 현재 Jarvis 갭**:

| 항목 | Windsurf | 현재 Jarvis | 갭 |
|------|---------|------------|-----|
| 세션 종료 감지 | 명시적 종료 트리거 | 암묵적 (새 메시지 없으면 방치) | 세션 종료 시점 판단 없음 |
| 작업 진행 상황 요약 | 종료 시 자동 구조화 요약 | compactSessionWithAI 존재하나 컴팩션 시점에만 실행 | 정상 세션 종료 시 요약 미생성 |
| 다음 세션 자동 주입 | "Continue" 클릭 → 이전 요약 자동 로드 | loadSessionSummary 존재하나 SDK resume 성공 시 미사용 | resume 실패 시에만 요약 활용 |
| 세션 간 작업 연속성 | 명시적 handoff 프로토콜 | pending-tasks.json (타임아웃 시만) | 정상 흐름에서 handoff 없음 |
| 크로스 스레드 컨텍스트 | 전체 프로젝트 워크스페이스 공유 | threadId별 격리된 세션 | 다른 스레드의 작업 내용 불가시 |

### 목표 아키텍처

```
현재:
  스레드A: 세션1 ─── 대화 ─── (방치) ─── 새 메시지 → resume 시도
                                          ├─ 성공: 이전 컨텍스트 유지
                                          └─ 실패: 새 세션 (컨텍스트 손실)

목표:
  스레드A: 세션1 ─── 대화 ─── 세션 종료 감지 ─── 자동 요약 생성
                                                    │
                                                    ▼
                                      session-summaries/{key}.md
                                      (5-섹션 구조화 요약)
                                                    │
                              ┌───────────────────────┐
                              │                       │
  스레드A: 세션2 시작 ◄────────┘           스레드B에서도 참조 가능
  (자동 주입: "이전 작업 이어서")            (크로스 스레드 연속성)

세션 종료 감지 기준:
  1. 마지막 메시지 후 30분 경과 (비활동 타임아웃)
  2. 사용자가 명시적 종료 신호 ("끝", "마무리", "/done")
  3. 컴팩션 발생 시 (기존 컴팩션 훅 활용)

자동 요약 생성 → 다음 세션 주입 흐름:
  ┌─────────────────────────────────────────────────┐
  │  세션 종료 감지                                   │
  │  └─ compactSessionWithAI(sessionKey)             │
  │     └─ 5-섹션 요약 생성 (haiku)                   │
  │        └─ saveCompactionSummary() 저장            │
  └──────────────────────┬──────────────────────────┘
                         │
                         ▼
  ┌─────────────────────────────────────────────────┐
  │  다음 세션 시작 시                                │
  │  └─ loadSessionSummary(sessionKey)               │
  │     └─ resume 성공/실패 무관하게 항상 주입         │
  │        └─ 시스템 프롬프트 DYNAMIC 섹션:           │
  │           "## 이전 작업 요약 (자동 생성)"         │
  └─────────────────────────────────────────────────┘
```

### 구현 단계

**Phase 1: 세션 종료 감지 + 자동 요약 (2~3일)**
- `handlers.js`에 세션 비활동 타임아웃 감지 로직 추가:
  - `session-sync.sh`(15분 크론)에서 30분 이상 비활동 세션 감지
  - 감지된 세션에 대해 `compactSessionWithAI()` 호출
  - 또는 새 메시지 수신 시 이전 세션 마지막 활동 시각 확인 → 30분 초과면 먼저 요약 생성
- 명시적 종료 신호 감지: 사용자 메시지 패턴 매칭 ("끝", "마무리", "여기까지", "/done")
- 변경 파일: `handlers.js` (~30줄), `session-sync.sh` (~20줄)

**Phase 2: 세션 시작 시 이전 요약 항상 주입 (1~2일)**
- `claude-runner.js` `createClaudeSession()` 수정:
  - 현재: resume 실패 시에만 `loadSessionSummary()` 활용
  - 목표: resume 성공 시에도 DYNAMIC 섹션에 이전 요약 간략 삽입
  - 조건: 요약이 존재하고, 마지막 세션으로부터 30분 이상 경과한 경우만
- 요약 주입 형식: `[이전 작업 요약] {compacted summary 300자}` → 토큰 낭비 최소화
- 변경 파일: `claude-runner.js` (~15줄), `handlers.js` (~10줄)

**Phase 3: 크로스 스레드 컨텍스트 공유 (3~5일)**
- `state/session-summaries/latest-{userId}.md` 파일 유지:
  - 가장 최근 활성 세션의 요약을 사용자별로 저장
  - 새 스레드에서 대화 시작 시 → latest 요약 참조 가능
- `userMemory`와 통합: `getPromptSnippet()`에 최근 세션 요약 1건 포함
- 프라이버시 주의: 다른 채널의 대화 내용이 크로스 채널로 노출되지 않도록 채널 카테고리 기반 필터 필요
- 변경 파일: `session-summary.js` (~30줄), `claude-runner.js` (~15줄), `user-memory.js` (~10줄)

### 예상 작업량

| 항목 | 수정/신규 줄수 | 파일 수 |
|------|--------------|---------|
| Phase 1 | ~50줄 수정 | 2~3개 (handlers.js, session-sync.sh) |
| Phase 2 | ~25줄 수정 | 2개 (claude-runner.js, handlers.js) |
| Phase 3 | ~55줄 수정 | 3개 (session-summary.js, claude-runner.js, user-memory.js) |
| **합계** | **~130줄** | **4~6개** |

### 리스크

1. **세션 종료 오탐**: 30분 비활동 기준이 "사용자가 잠깐 자리 비운 것"과 "진짜 세션 종료"를 구분 불가. 너무 공격적이면 불필요한 요약 생성 → 토큰 낭비. 너무 느슨하면 요약 미생성
2. **Haiku 요약 품질**: `compactSessionWithAI()`가 haiku로 요약을 생성하는데, 복잡한 코딩 세션의 경우 핵심 정보 누락 가능. Sonnet으로 요약 시 품질 향상하나 비용/Rate 부담
3. **토큰 이중 지출**: resume 성공 시 SDK가 이미 이전 컨텍스트를 보유하고 있는데, 추가로 요약을 주입하면 중복 정보로 토큰 낭비. 요약 삽입 조건(30분 경과) 튜닝 필요
4. **크로스 스레드 프라이버시**: Phase 3에서 다른 스레드(예: 가족 대화 채널)의 내용이 기술 채널에 노출될 위험. 채널 카테고리 기반 격리 또는 사용자 동의 모델 필요
5. **session-summaries 디스크 증가**: 세션 종료마다 요약 파일 생성 → `memory-cleanup` 크론의 정리 대상에 포함 필요 (현재 7일 이상 삭제 정책 존재하나 session-summaries는 미포함)
6. **기존 windsurf-memories-design.md와 중복**: 해당 문서의 Phase 3와 본 LT-4가 겹침. 구현 시 설계 통합 필요

---

## 우선순위 요약

| LT | 작업량 | 난이도 | 즉시 효과 | 권장 순서 |
|----|-------|--------|----------|----------|
| LT-2 | ~85줄, 6~10파일 | 중 (SDK 지원 확인 필요) | Rate Limit 최적화 | 2순위 |
| LT-3 | ~225줄, 6~9파일 | 중~고 (외부 연동) | 이벤트 드리븐 자동화 확대 | 3순위 |
| LT-4 | ~130줄, 4~6파일 | 중 (기존 코드 활용) | 사용자 경험 즉시 개선 | 1순위 |

**권장**: LT-4 Phase 1~2 → LT-2 Phase 1 → LT-3 Phase 1 → 나머지 순차 진행
