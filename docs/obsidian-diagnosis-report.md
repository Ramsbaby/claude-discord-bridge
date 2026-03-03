# Obsidian 현황 진단 및 자율 진화 아키텍처 설계

**작성**: 2026-03-03 | **대상**: 자율 진화 시스템 구축

---

## A. Obsidian 현황 (정직한 진단)

### A-1. ~/jarvis-ai/ Vault 현황

**상태: 설계 단계 유물 + 부분 활성**

```
~/jarvis-ai/
├── .git (활성)
├── .obsidian (설정 파일만, 자동 동기화 X)
│   ├── app.json
│   ├── appearance.json
│   ├── core-plugins.json
│   └── workspace.json (Mar 1, 21:35 — 최후 수정)
├── README.md (설계 개요)
└── architecture.md (40KB, 핵심 문서)
```

**진단**:
- ✅ Obsidian 자체는 설치 가능한 상태 (`.obsidian/` 폴더 존재)
- ❌ **하지만 실제 사용은 안 됨**: workspace.json 최후 수정이 Mar 1 (2일 전)
- ❌ **Vault에 일일 문서 없음**: 아키텍처 설계만 있고, 크론 결과/에이전트 인사이트는 저장 안 됨
- ⚠️ **자동 동기화 미구현**: obsidian-git 플러그인 미설치, Git 수동 관리만 가능

### A-2. RAG와의 실제 연결

**현재**: 부분 연결 (설계 상태)

| 요소 | 상태 | 설명 |
|-----|------|------|
| **LanceDB 저장소** | ✅ 활성 | `~/.jarvis/rag/lancedb/` 운영 중 |
| **증분 인덱싱** | ✅ 실행 | `rag-index.mjs` 매시간 크론 |
| **인덱스 상태 추적** | ✅ 기록 | `index-state.json` 업데이트 중 |
| **자동 vault 인덱싱** | ❌ 미구현 | 파일 감시자(watcher) 없음, 매시간 배치만 |
| **검색 경로** | ⚠️ 부분 | ask-claude.sh에서 RAG 검색 가능하나, vault에 데이터 없음 |

**문제점**:
- 크론 결과가 `~/.jarvis/results/` → RAG 인덱싱됨 ✅
- 하지만 `~/jarvis-ai/` vault는 RAG에 포함 안 됨 ❌
- 대화/에이전트 인사이트가 vault로 저장 안 됨 ❌

### A-3. 현재 obsidian-sync-guide.md와 실제 간격

| 가이드 내용 | 현실 상태 | 격차 |
|-----------|---------|------|
| "obsidian-git 플러그인 설치" | 미설치 | ❌ 미구현 |
| "Vault → RAG 자동 동기화" | 수동 (매시간 배치) | ⚠️ 자동화 불완전 |
| "iCloud/Syncthing 동기화" | 구성 안 됨 | ❌ 미구현 |
| "BOT_EXTRA_MEMORY 외부 경로" | 설정 가능하나 미사용 | ⚠️ 미활용 |

---

## B. 현재 지식 관리 구조 (정보 흐름 맵핑)

### B-1. 데이터 저장 위치 현황

```
┌─────────────────────────────────────────────────────────────┐
│                     정보 흐름 맵                              │
└─────────────────────────────────────────────────────────────┘

1️⃣ 운영 결과 (크론 실행 결과)
   ├─ 생성: crontab → jarvis-cron.sh → ask-claude.sh → claude -p
   ├─ 저장: ~/.jarvis/results/{task}/*.md (336개 파일)
   │        예: daily-summary/2026-03-03_200001.md
   ├─ 형식: 마크다운 (크론별 디렉토리, 날짜_시간.md)
   ├─ 보존: 최근 N일 + 매일 정리 크론 (memory-cleanup)
   └─ RAG 인덱싱: ✅ rag-index.mjs 매시간 증분 인덱싱

2️⃣ 에이전트 인사이트/학습
   ├─ 생성: ask-claude.sh에서 claude -p 응답
   ├─ 일부 저장처:
   │  ├─ ~/.jarvis/rag/memory.md (사용자가 /remember로 추가)
   │  ├─ ~/.jarvis/rag/decisions.md (구조화된 결정 로그)
   │  ├─ ~/.jarvis/rag/handoff.md (세션 인수인계)
   │  └─ ~/.jarvis/rag/teams/* (팀별 보고서)
   ├─ 문제: memory.md는 수동 업데이트만 가능
   │        → 에이전트가 자동으로 배운 내용 기록 안 됨
   └─ RAG 인덱싱: ✅ 포함됨

3️⃣ 사용자 정보 (프로필/설정)
   ├─ 저장: ~/.jarvis/context/owner/*.md
   │        - owner-profile.md (이름, 배경)
   │        - persona.md (성격, 말투)
   │        - preferences.md (선호도)
   │        - milestones.md (목표)
   ├─ 업데이트: 수동 또는 매주 크론 (career-weekly.md)
   └─ RAG 인덱싱: ✅ 포함됨

4️⃣ 시스템 결정 (정책, 규칙)
   ├─ 저장: ~/.jarvis/config/
   │        - company-dna.md (핵심 규칙 SSoT)
   │        - tasks.json (크론 정의)
   │        - monitoring.json (알림 설정)
   │        - autonomy-levels.md (자율성 정책)
   ├─ Git 추적: ✅ 버전 관리됨
   └─ RAG 인덱싱: ✅ 포함됨

5️⃣ 장기 지식 (기술, 패턴, 아키텍처)
   ├─ 저장처 분산:
   │  ├─ ~/.jarvis/docs/ (개선 아이디어, 감사 보고서)
   │  ├─ ~/jarvis-ai/architecture.md (전체 설계)
   │  ├─ ~/.jarvis/README.md (개요)
   │  ├─ ~/.jarvis/ROADMAP.md (로드맵)
   │  └─ ~/.claude/projects/-Users-ramsbaby/memory/ (Claude Code 메모리)
   ├─ 문제: ⚠️ SSoT 분산 (여러 위치에 중복)
   └─ RAG 인덱싱: ⚠️ 부분만 (vault 외부 파일들)

6️⃣ 대화 기록
   ├─ 저장: ~/.jarvis/context/discord-history/ (일일 요약)
   ├─ Discord: 웹훅을 통한 실시간 기록 (Discord 자체)
   └─ RAG: ❌ 원본 대화는 인덱싱 안 됨 (요약만 가능)
```

### B-2. 정보 타입별 저장 위치 현황

| 정보 타입 | 현재 저장 위치 | SSoT 여부 | RAG 포함 | 검색 가능성 |
|----------|---------------|---------|---------|-----------|
| 크론 결과 | `~/.jarvis/results/` | ❌ (분산) | ✅ | ✅ (LanceDB) |
| 에이전트 학습 | `~/.jarvis/rag/*.md` | ⚠️ (수동) | ✅ | ✅ |
| 사용자 프로필 | `~/.jarvis/context/owner/` | ✅ | ✅ | ✅ |
| 시스템 정책 | `~/.jarvis/config/` | ✅ | ✅ | ✅ |
| 장기 지식 | 분산 (docs/+jarvis-ai/) | ❌ | ⚠️ | ⚠️ |
| 대화 기록 | Discord + `~/.jarvis/context/` | ❌ | ❌ | ❌ |
| 팀별 보고서 | `~/.jarvis/rag/teams/` | ⚠️ | ✅ | ✅ |
| 의사결정 로그 | `~/.jarvis/rag/decisions.md` | ✅ | ✅ | ✅ |

---

## C. 문제점 진단

### C-1. 중복 저장 (SSoT 위반)

**발견**:

1. **장기 지식이 여러 곳에**:
   - `~/jarvis-ai/architecture.md` (40KB)
   - `~/.jarvis/docs/` (audit-report, improvement-ideas 등)
   - `~/.claude/projects/-Users-ramsbaby/memory/` (Claude Code 메모리)
   - **누가 진실인가?** 불명확

2. **팀별 정보 중복**:
   - `~/.jarvis/rag/teams/` (팀 보고서)
   - `~/.jarvis/context/` (태스크별 컨텍스트)
   - OpenClaw의 `~/openclaw/memory/teams/` (기존 시스템)

3. **사용자 프로필 중복**:
   - `~/.jarvis/context/owner/` (현재)
   - 기존 Claude Code memory에도 "owner" 설정 존재?

**영향**: 정보 업데이트 시 어느 것을 수정해야 할지 불명확

### C-2. 정보 소실 (저장되지 않는 데이터)

**발견**:

1. **에이전트 자동 학습 미기록**:
   - ask-claude.sh가 실행하면서 발견한 패턴/개선사항이 어디로?
   - memory.md는 수동 입력만 가능
   - **RAG로 자동 피드백 루프 없음**

2. **대화 컨텍스트 분실**:
   - Discord 대화는 Discord 웹훅으로만 저장
   - ask-claude.sh로 실행한 크론 결과 중 "인사이트"는?
   - 에이전트끼리의 대화(팀 간 공유)는?

3. **실시간 상태 추적 부재**:
   - rate-tracker.json (API 사용률)
   - alerts.json (알림 상태)
   - **이들이 RAG에 포함 안 됨** → 다음 실행 시 컨텍스트 손실

### C-3. 검색 불가 (있는데 못 찾는 정보)

**발견**:

1. **Vault 데이터 RAG 미포함**:
   - `~/jarvis-ai/` 문서는 RAG 인덱싱 대상 아님
   - 아키텍처 문서가 LanceDB에 없음 → 검색 불가
   - ask-claude.sh에서 "Jarvis 아키텍처 설명해봐" → 답변 못 함

2. **대화 기록 검색 불가**:
   - Discord 대화 원본이 RAG에 없음
   - 과거 대화 컨텍스트 활용 불가

3. **동적 상태 조회 불가**:
   - 현재 API 사용률이 몇 %? → state/rate-tracker.json 확인 필요
   - 최근 에러가 뭐? → logs/ 직접 확인 필요
   - LanceDB 쿼리로는 불가능

### C-4. 연결 끊김 (업데이트가 반영 안 되는 경우)

**발견**:

1. **Vault → RAG 단방향**:
   - `~/jarvis-ai/` 파일 수정 → ✅ rag-index.mjs가 매시간 인덱싱
   - 하지만 RAG 검색 결과 → ❌ Vault로 피드백 없음
   - "이 정보는 틀렸다" → Vault 업데이트 수동

2. **메모리 → 컨텍스트 수동**:
   - memory.md 수정 → ✅ RAG 인덱싱
   - 하지만 ask-claude.sh가 사용 시작 → ❌ 다음 실행 대기
   - 실시간 반영 안 됨 (매시간 배치 대기)

3. **Discord ↔ RAG 연결 없음**:
   - Discord 대화 → ❌ RAG로 자동 저장 안 됨
   - RAG 검색 결과 → ❌ Discord로 자동 전송 안 됨
   - 수동 공유만 가능

---

## D. 자율 진화를 위한 새 아키텍처 설계

### D-1. 핵심 원칙

자율 진화의 조건 (3가지 필수):

```
1️⃣ 정보 자동 저장
   에이전트가 실행 → 결과 자동 기록 (수동 입력 X)

2️⃣ 정보 자동 검색
   다음 실행 시 기존 인사이트 자동 로드 (명시적 참조 X)

3️⃣ 정보 자동 피드백
   검색 결과의 유용성 평가 → 다음 인덱싱에 가중치 반영
```

**현재 상태**:
- ✅ 1번: 부분 (크론 결과는 자동, 에이전트 학습은 수동)
- ✅ 2번: 부분 (LanceDB 있으나 context 설정 미완)
- ❌ 3번: 미구현

### D-2. 새 저장 아키텍처 (SSoT 정의)

```
┌──────────────────────────────────────────────────────────────┐
│        정보 타입별 저장 위치 (Single Source of Truth)        │
└──────────────────────────────────────────────────────────────┘

1. 운영 결과 (Operational Results)
   SSoT: ~/.jarvis/results/{task}/*.md
   RAG: ✅ 자동 포함 (rag-index.mjs 매시간)
   보관: 최근 30일 자동 로테이션
   → 설정: ~/.jarvis/context/{task}.md (task별 프롬프트)

2. 에이전트 학습 & 인사이트 (Agent Learnings)
   ⚠️ **NEW**: ~/.jarvis/rag/auto-insights/*.md
   구조:
     ├── {task}-trends.md (태스크별 패턴 발견)
     ├── {task}-optimizations.md (성능 개선 제안)
     └── cross-team-insights.md (팀 간 공유 인사이트)
   RAG: ✅ 자동 포함 (매시간)
   생성: ask-claude.sh --record-insight 플래그

3. 사용자 정보 (User Profile)
   SSoT: ~/.jarvis/context/owner/*.md
   RAG: ✅ 자동 포함
   업데이트: 크론 career-weekly 또는 /update-profile 명령
   구조:
     ├── owner-profile.md (기본 정보)
     ├── persona.md (성격, 말투, 가치관)
     ├── preferences.md (기술스택, 선호 도구)
     ├── milestones.md (단기/중기/장기 목표)
     └── learning-goals.md (학습 영역) [NEW]

4. 시스템 정책 (System Policies) ← 최우선 SSoT
   SSoT: ~/.jarvis/config/company-dna.md
   관리 규칙:
     ✅ Git 버전 관리 (모든 변경 추적)
     ✅ RAG 자동 포함
     ✅ 변경 시 Discord 알림 (governance 채널)
   하위 파일들 (tasks.json, monitoring.json):
     모두 company-dna.md를 참조하는 구현 파일
     중복 규칙 금지

5. 대화 기록 (Conversation History)
   ⚠️ **NEW**: ~/.jarvis/context/discord-history/
   구조:
     ├── {YYYY-MM-DD}.md (일일 요약)
     ├── threads/{thread-id}/ (스레드별 원본)
     │  └── messages.jsonl
     └── search-index.json (쿼리 최적화용)
   RAG: ✅ auto-insights로 요약화
   보관: 최근 90일

6. 장기 지식 (Long-term Knowledge)
   **아키텍처 & 패턴**:
     SSoT: ~/Vault/jarvis-knowledge/
     구조:
       ├── architecture/
       │  ├── system-design.md
       │  ├── data-flow.md
       │  └── module-reference.md
       ├── patterns/
       │  ├── error-handling.md
       │  ├── performance-tuning.md
       │  └── security.md
       └── decisions/
          ├── ADR-001-*.md (Architecture Decision Records)
          └── rejected-ideas.md
     RAG: ✅ 자동 포함 (Vault 감시자)

   **학습 자료**:
     SSoT: ~/Vault/jarvis-learning/
     구조:
       ├── tech-stack/
       ├── team-playbooks/
       └── market-insights/
     RAG: ✅ 자동 포함

7. 팀별 정보 (Team-specific)
   SSoT: ~/.jarvis/rag/teams/
   구조:
     ├── {team-name}/
     │  ├── charter.md (팀 설립)
     │  ├── current-status.md
     │  ├── reports/
     │  │  └── {YYYY-MM-DD}.md
     │  └── shared-inbox/
     │     └── {date}_{from-team}.md
   RAG: ✅ 자동 포함
   단일 소스: OpenClaw의 `~/openclaw/memory/teams/company-dna.md`와 동기

8. 의사결정 로그 (Decision Log)
   SSoT: ~/.jarvis/rag/decisions.md
   RAG: ✅ 자동 포함
   구조: 마크다운 테이블 (날짜 | 결정 | 이유 | 영향도)

9. 메모리 & 기억 (Quick Memories)
   SSoT: ~/.jarvis/rag/memory.md
   추가 방법:
     ✅ /remember 명령 (Discord)
     ✅ ask-claude.sh --remember "..." (CLI)
     ✅ auto-insights에서 자동 마이그레이션
   RAG: ✅ 자동 포함
```

### D-3. 자동 인덱싱 파이프라인 재설계

**현재**: 매시간 배치 (rag-index.mjs)
**문제**: 실시간 반영 안 됨, 파일 이동 감지 불가

**새 설계**:

```
┌──────────────────────────────────────────────────────────┐
│           RAG 자동 인덱싱 (증분 + 실시간)               │
└──────────────────────────────────────────────────────────┘

1️⃣ 파일 감시자 (File Watcher) [NEW]
   도구: chokidar (Node.js)
   감시 대상:
     ├─ ~/.jarvis/rag/
     ├─ ~/.jarvis/results/
     ├─ ~/.jarvis/context/
     └─ ~/Vault/jarvis-*/ (외부 Vault)

   이벤트:
     ├─ add: 새 파일 → 즉시 인덱싱
     ├─ change: 파일 수정 → 즉시 인덱싱
     └─ unlink: 파일 삭제 → LanceDB에서 제거

   구현: 별도 daemon (rag-watch.mjs)
         LaunchAgent: ai.jarvis.rag-watch

2️⃣ 백그라운드 인덱서 (Background Indexer)
   기존 rag-index.mjs 확장:
     ├─ 파일 감시자의 이벤트 수신
     ├─ 청크 단위 처리 (중단 가능)
     └─ 실패 시 재시도 큐

3️⃣ 증분 인덱싱 상태 추적
   저장: ~/.jarvis/rag/index-state.json (이미 존재)
   추적 정보:
     ├─ 파일경로 → (mtime, vector_id, chunk_count)
     ├─ 마지막 동기화 시각
     └─ 미처리 파일 큐

4️⃣ 주기적 Full Re-index (일 1회)
   시점: 새벽 3시 (crontab)
   목적:
     ├─ 벡터 재계산 (선택사항)
     ├─ 문제 파일 복구
     └─ 통계 업데이트

5️⃣ Vault 감시 (Galaxy 동기화)
   Syncthing 활용:
     ~/Vault/ ↔ Galaxy의 ~/Vault/
   변경 감지:
     ├─ Mac에서 수정 → Syncthing → Galaxy
     ├─ Galaxy에서 수정 → Syncthing → Mac → 감시자 감지
     └─ 양쪽 모두 최신 상태 유지
```

### D-4. 컨텍스트 주입 (Context Injection) 재설계

**현재**: ask-claude.sh에서 수동으로 파일 읽음
**문제**: 관련 정보를 놓치기 쉬움, 매번 구성 필요

**새 설계**:

```
┌──────────────────────────────────────────────────────────┐
│           자동 컨텍스트 주입 (Intelligent Injection)    │
└──────────────────────────────────────────────────────────┘

ask-claude.sh 실행 시:

1️⃣ 작업 식별
   입력: 태스크 이름 (예: tqqq-monitor)
   매핑: tasks.json → 태스크 정의

2️⃣ 명시적 컨텍스트 로드
   경로: ~/.jarvis/context/{task}.md
   내용: 태스크 프롬프트 (항상 포함)

3️⃣ 자동 컨텍스트 검색 [NEW]
   RAG 쿼리:
     a) 태스크명 + 최근 결과 (지난 7일)
        → "tqqq-monitor" 검색 → 최근 인사이트 로드

     b) 관련 정책 검색
        → company-dna.md에서 해당 태스크 관련 규칙

     c) 사용자 선호도 & 조건부 지식
        → user-profile.md + 현재 환경 상태

   통합: RAG 쿼리 결과를 프롬프트 끝에 자동 추가

4️⃣ 동적 정보 주입 [NEW]
   실시간 조회:
     ├─ ~/.jarvis/state/rate-tracker.json (API 사용률)
     ├─ ~/.jarvis/logs/latest (최근 에러)
     ├─ ~/.jarvis/rag/teams/*/current-status.md (팀 상태)
     └─ gog cal / gog tasks (Google 일정/할일)

   포맷: JSON → 마크다운 테이블로 변환

5️⃣ 프롬프트 최종화
   순서:
     [1] 명시적 컨텍스트 (task.md)
     [2] 사용자 프로필 (owner/*.md)
     [3] RAG 검색 결과 (auto-context)
     [4] 동적 정보 (상태, 일정, 정책)
     [5] 사용자 입력

예시:
  ```
  # System
  You are Jarvis, a personal AI assistant...

  ## Explicit Context (from ~/.jarvis/context/tqqq-monitor.md)
  Monitor TQQQ, SOXL, NVDA prices...

  ## Auto-Context (from RAG search)
  Recent insights:
  - 2 days ago: TQQQ volatility increased
  - Pattern: Friday exits more common

  ## User Profile
  Risk tolerance: 1.5x budget
  Trading style: Momentum + Mean reversion

  ## Current State
  API usage: 45/900 turns (5%)
  Last error: None
  Teams status: 3 active, 1 paused

  ## Task
  [User input]
  ```
```

---

## E. 새 Vault 폴더 구조 설계

### E-1. 최종 Vault 아키텍처 (~/Vault/ 기준)

```
~/Vault/
│
├── 📁 jarvis-ai/                  # Jarvis 운영 & 설계 (메인 Vault)
│   │   (현재 ~/jarvis-ai/ 위치 유지, symlink 이용)
│   │
│   ├── 📁 01-system/
│   │   ├── architecture/
│   │   │   ├── system-design.md           ← 전체 아키텍처 (현 architecture.md)
│   │   │   ├── data-flow.md               ← 정보 흐름
│   │   │   ├── module-reference.md        ← 모듈별 API 문서
│   │   │   └── decision-log.md            ← 아키텍처 결정 기록
│   │   │
│   │   ├── operations/
│   │   │   ├── runbook.md                 ← 운영 가이드
│   │   │   ├── troubleshooting.md         ← 문제 해결
│   │   │   ├── monitoring.md              ← 모니터링 설정
│   │   │   └── scaling.md                 ← 확장 계획
│   │   │
│   │   └── security/
│   │       ├── auth-policy.md
│   │       ├── data-protection.md
│   │       └── audit-log.md
│   │
│   ├── 📁 02-daily/                      # 일일 운영
│   │   ├── daily-summary/
│   │   │   ├── 2026-03-03.md
│   │   │   ├── 2026-03-02.md
│   │   │   └── index.md (최근 30일 요약)
│   │   │
│   │   ├── team-standup/
│   │   │   ├── council.md (매일)
│   │   │   ├── academy.md
│   │   │   ├── brand.md
│   │   │   └── infra.md
│   │   │
│   │   ├── health-check/
│   │   │   ├── system-health.md
│   │   │   ├── api-usage.md
│   │   │   └── error-summary.md
│   │   │
│   │   └── market/
│   │       ├── tqqq-monitor.md
│   │       ├── market-alert.md
│   │       └── trading-log.md
│   │
│   ├── 📁 03-insights/                   # 에이전트 인사이트 (자동 생성)
│   │   ├── auto-insights/
│   │   │   ├── 2026-03-03-system-trends.md (실행 중 발견)
│   │   │   ├── 2026-03-03-optimization.md
│   │   │   ├── cross-team-connections.md (팀 간)
│   │   │   └── index.md (주간 요약)
│   │   │
│   │   ├── pattern-detection/
│   │   │   ├── recurring-failures.md     ← 반복 실패 분석
│   │   │   ├── peak-load-times.md
│   │   │   └── anomalies.md
│   │   │
│   │   └── optimization-opportunities/
│   │       ├── speed-improvements.md
│   │       ├── cost-reductions.md
│   │       └── reliability-gains.md
│   │
│   ├── 📁 04-decisions/                  # 의사결정 로그
│   │   ├── architecture-decisions/
│   │   │   ├── ADR-001-claude-p-architecture.md
│   │   │   ├── ADR-002-lancedb-rag.md
│   │   │   └── ADR-003-obsidian-vault.md [NEW]
│   │   │
│   │   ├── business-decisions/
│   │   │   ├── budget-allocation.md
│   │   │   ├── team-priorities.md
│   │   │   └── feature-prioritization.md
│   │   │
│   │   ├── rejected-ideas/
│   │   │   ├── 2026-02-28-microservices.md
│   │   │   └── 2026-03-01-external-api.md
│   │   │
│   │   └── index.md (의사결정 타임라인)
│   │
│   ├── 📁 05-teams/                      # 팀별 정보
│   │   ├── council/
│   │   │   ├── charter.md
│   │   │   ├── kpi.md
│   │   │   ├── current-status.md
│   │   │   ├── reports/
│   │   │   │   └── 2026-03-03.md
│   │   │   └── members.md
│   │   │
│   │   ├── academy/
│   │   │   ├── charter.md
│   │   │   ├── curriculum.md
│   │   │   ├── current-status.md
│   │   │   └── reports/
│   │   │
│   │   ├── brand/
│   │   │   ├── brand-guidelines.md
│   │   │   ├── current-status.md
│   │   │   └── reports/
│   │   │
│   │   ├── infra/
│   │   │   ├── infrastructure.md
│   │   │   ├── current-status.md
│   │   │   └── reports/
│   │   │
│   │   └── shared-inbox/               ← 팀 간 메시지
│   │       ├── 2026-03-03_brand_to_council.md
│   │       └── 2026-03-03_infra_to_academy.md
│   │
│   ├── 📁 06-knowledge/                 # 장기 지식
│   │   ├── tech-stack/
│   │   │   ├── claude-api.md
│   │   │   ├── discord-js.md
│   │   │   ├── lancedb.md
│   │   │   └── bash-patterns.md
│   │   │
│   │   ├── patterns/
│   │   │   ├── error-handling.md
│   │   │   ├── performance-tuning.md
│   │   │   ├── testing.md
│   │   │   └── deployment.md
│   │   │
│   │   ├── learnings/
│   │   │   ├── market-domain.md (TQQQ 관련)
│   │   │   ├── claude-best-practices.md
│   │   │   └── infrastructure-insights.md
│   │   │
│   │   └── glossary.md                 ← 용어집
│   │
│   ├── 📁 07-roadmap/
│   │   ├── vision.md (장기 비전)
│   │   ├── q1-2026.md (분기 계획)
│   │   ├── current-sprint.md (현재 진행)
│   │   ├── backlog.md (우선순위)
│   │   └── completed.md (완료 항목)
│   │
│   └── 📁 08-inbox/                     # 임시 처리 대기
│       ├── capture-templates/
│       │   ├── quick-insight.md (템플릿)
│       │   ├── bug-report.md
│       │   └── feature-idea.md
│       ├── processing-queue/            # 정리 대기
│       ├── templates/
│       └── archive.md
│
│
├── 📁 owner/                             # 개인 정보 (선택사항, Galaxy 미동기)
│   ├── profile.md                        # 커리어, 배경
│   ├── goals.md                          # 개인 목표
│   ├── learning.md                       # 학습 계획
│   └── journal.md                        # 개인 일기 (선택)
│
│
└── 📁 reference/                         # 참고 자료
    ├── claude-api-docs/                  (외부 링크 또는 요약)
    ├── research-papers/
    ├── benchmarks/
    └── external-resources.md
```

### E-2. Symlink 구성 (기존 경로 유지)

현재 `~/jarvis-ai/` vault를 보존하면서 Obsidian이 사용하는 경로:

```bash
# Option 1: iCloud 동기화 (Mac만)
~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/jarvis-ai → 심링크

# Option 2: Syncthing (Galaxy 포함)
~/Vault/jarvis-ai → SSoT
~/.jarvis/obsidian-vault → ~/Vault/jarvis-ai 심링크 (로컬 참조)

# 권장: Option 2 (Galaxy 지원)
```

---

## F. 구현 로드맵

### Phase 1: 기초 정비 (1주, 우선순위 최고)

- [ ] **F1-1**: SSoT 정의 확정
  - [ ] 각 정보 타입별 저장 위치 최종화
  - [ ] 파일명 규칙 통일 (날짜 형식, 계층 구조)
  - [ ] config/ 및 docs/ 중복 제거

- [ ] **F1-2**: Vault 구조 생성
  - [ ] ~/Vault/jarvis-ai/ 생성 (기존 ~/jarvis-ai/ 대체)
  - [ ] 01-system/, 02-daily/ 등 8개 폴더 생성
  - [ ] 기존 architecture.md → 01-system/architecture/
  - [ ] 기존 docs/ → 01-system/ 재정렬

- [ ] **F1-3**: Obsidian 설정
  - [ ] Obsidian Vault 생성 (~/Vault/jarvis-ai/)
  - [ ] 핵심 플러그인 설치:
    - [ ] obsidian-git (자동 커밋)
    - [ ] templater (템플릿 자동화)
    - [ ] graph (시각화)
  - [ ] Graph 설정 (관계도 표시)
  - [ ] 검색 설정 (정규표현식)

### Phase 2: 자동화 파이프라인 (2주)

- [ ] **F2-1**: RAG 증분 인덱싱 개선
  - [ ] rag-watch.mjs 구현 (파일 감시자)
  - [ ] LaunchAgent ai.jarvis.rag-watch 등록
  - [ ] index-state.json 확장 (상태 추적)
  - [ ] 테스트: 파일 변경 → 1초 내 인덱싱

- [ ] **F2-2**: 자동 컨텍스트 주입
  - [ ] ask-claude.sh에 `--auto-context` 플래그 추가
  - [ ] RAG 쿼리 통합 (task 관련 검색)
  - [ ] state/ 파일 자동 포함
  - [ ] 테스트: 프롬프트 자동 확장 확인

- [ ] **F2-3**: 에이전트 학습 자동 기록
  - [ ] ask-claude.sh `--record-insight` 플래그
  - [ ] auto-insights/ 자동 저장
  - [ ] 포맷: 태스크-날짜-유형.md
  - [ ] 테스트: 크론 실행 후 insights 생성 확인

### Phase 3: 정보 흐름 통합 (1주)

- [ ] **F3-1**: 크론 결과 → Vault 자동 저장
  - [ ] route-result.sh 확장
  - [ ] 결과 파일 → ~/Vault/jarvis-ai/02-daily/ 복사
  - [ ] 메타데이터 (크론명, 시간, 상태) 추가

- [ ] **F3-2**: Discord ↔ Vault 양방향
  - [ ] Discord 메시지 → daily-summary.md 기록
  - [ ] Vault 변경 → Discord 스레드 알림
  - [ ] 구현: Discord 웹훅 + file watcher

- [ ] **F3-3**: Galaxy 동기화 (Syncthing)
  - [ ] Syncthing 설치 & 구성
  - [ ] ~/Vault/ ↔ Galaxy 동기화 테스트
  - [ ] 충돌 해결 정책 정의
  - [ ] Obsidian Android 앱 설치

### Phase 4: 검증 & 최적화 (1주)

- [ ] **F4-1**: RAG 검색 품질 평가
  - [ ] 쿼리 테스트 (태스크명, 정책, 학습 등)
  - [ ] 잘못된 결과 분석 및 가중치 조정
  - [ ] 응답 시간 최적화 (< 1초)

- [ ] **F4-2**: 자동화 안정성 테스트
  - [ ] 대량 파일 변경 시뮬레이션
  - [ ] 에러 복구 테스트
  - [ ] 로그 분석 (rag-watch.log)

- [ ] **F4-3**: 문서화 & 기초 정보 입력
  - [ ] README.md 갱신 (새 Vault 구조)
  - [ ] 기존 docs 마이그레이션 완료
  - [ ] 초기 팀 보고서 작성

---

## G. 체크리스트

### 구현 완료 시 검증 항목

- [ ] **정보 흐름**: 크론 결과 → RAG 인덱싱 → ask-claude.sh 검색 → 다음 실행 (사이클 완성)
- [ ] **자동화**: 파일 수정 → 1초 내 RAG 반영
- [ ] **검색**: "Jarvis 아키텍처 설명해봐" → Vault에서 답변 가능
- [ ] **Galaxy**: Syncthing으로 Vault 동기화 확인
- [ ] **용량**: 월 분석 후 로테이션 자동화 (결과/ 30일, 일일/ 90일)
- [ ] **SSoT**: 중복 정보 0개 (grep으로 검증)

---

## 결론

**현재 상태**: Obsidian은 설치 가능하나 **실제 운영 연결 없음**. RAG는 부분 운영 중.

**핵심 문제**:
1. 크론 결과 수집 ✅ | RAG 인덱싱 ✅ | 다음 실행 적용 ❌
2. 에이전트 학습 미기록 → 자율 진화 불가능
3. Vault 데이터 RAG 미포함 → 검색 기능 제한
4. 정보 타입별 SSoT 불명확 → 업데이트 혼란

**해결책**:
- Vault 구조 재설계 + Obsidian 자동화
- 파일 감시자 + 증분 인덱싱 (실시간)
- 에이전트 자동 학습 기록 (auto-insights)
- 동적 컨텍스트 자동 주입

**자율 진화 활성화 조건**:
1. 모든 크론 → 자동 저장 (이미 부분 가능)
2. 자동 저장된 정보 → 자동 검색 (구현 필요)
3. 검색 결과 → 자동 평가 & 가중치 반영 (고급)

구현 순서: Phase 1 (SSoT) → Phase 2 (자동화) → Phase 3 (통합) → Phase 4 (검증)

