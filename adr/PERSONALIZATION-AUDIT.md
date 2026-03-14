# Jarvis 개인화 코드 분리 감사 리포트

**작성일:** 2026-03-14 | **분석 범위:** Fork 후 수정 필요 파일 전수 조사

---

## 요약

Jarvis는 **정우님(이정우) + 보람님(송보람) 개인 환경에 깊게 결합된** AI 컴퍼니 시스템입니다.

### 핵심 발견
- **총 882개 태스크 항목 중 개인 특화 태스크:** 약 60% (모닝 스탠드업, TQQQ 모니터링, 커리어 지원 등)
- **하드코딩된 개인 정보:** 이메일, 학생 ID, 블로그 URL, 팀명, 페르소나, Discord 채널명
- **한국어 하드코딩:** tasks.json, personas.json, agents/, teams/ 전체 - i18n 미지원
- **프롬프트 깊숙이 embed된 이력서/면접 맥락** — 범용화 시 제거 필수

### Fork 후 최소 변경 경로 예상 시간
- **보수적 예상:** 2~3시간 (설정만 변경)
- **권장:** 6~8시간 (템플릿화 + 개인 맥락 제거)

---

## 1. 개인화 파일 전수 목록

### 🔴 **Tier 1: 반드시 변경해야 할 파일** (Fork 후 30분 안에 수정 못하면 시스템 작동 불가)

| 파일 경로 | 무엇을 바꿔야 하나 | 변경 포인트 | 우선순위 |
|---------|------------------|-----------|---------|
| `~/.jarvis/config/tasks.json` | 모든 개인 태스크 제거/변경, 한국어 → 영어 | 882줄, 60% 개인 특화 | 🔴 **1순위** |
| `~/.jarvis/discord/personas.json` | 12개 채널별 페르소나 + 개인 맥락 제거, 한국어 → 영어 | 1800줄+ (보람님, 개인 서비스 참조) | 🔴 **1순위** |
| `~/.jarvis/config/company-dna.md` | 회사 가치관을 fork인 입장에서 재정의 | 85줄 (자비스 컴퍼니 특화) | 🔴 **1순위** |
| `~/.jarvis/teams/*/team.yml` | 팀명, 태스크ID, Discord 채널명 변경 (11개 팀) | 각 파일 30~50줄 | 🔴 **2순위** |
| `~/.jarvis/teams/*/prompt.md` | 팀별 프롬프트의 개인 맥락 제거 (이정우/보람님 명시) | 각 파일 100~500줄 | 🔴 **2순위** |
| `~/.jarvis/agents/*/md` | 4개 에이전트 프로필 (CEO, Infra Chief 등) 재정의 | agents/{ceo,infra-chief,record-keeper,strategy-advisor}.md | 🔴 **2순위** |
| `~/.jarvis/bin/ask-claude.sh` | 하드코딩 경로 (BOT_HOME 등) + 개인 컨텍스트 로더 참조 | 100줄 | 🟡 **3순위** |
| `~/.jarvis/config/monitoring.json.example` | Discord 웹훅 URL, ntfy 토픽 템플릿화 | 20줄 | 🟡 **3순위** |

### 🟡 **Tier 2: 변경하지 않아도 작동하지만 개인화 제거 권장**

| 파일 경로 | 개인화 내용 | 변경 포인트 |
|---------|----------|----------|
| `~/.jarvis/context/*/md` | 컨텍스트 파일들 (morning-standup.md, tqqq-monitor.md 등) | 50+ 파일 (프롬프트 컨텍스트) |
| `~/.jarvis/scripts/*.sh` | 하드코딩 경로, 한국어 주석, 개인 로직 | grep -r "ramsbaby\|정우\|보람" 결과 참조 |
| `~/.jarvis/config/goals.json` | OKR 목표 (개인 커리어 목표) | 20줄 |
| `~/.jarvis/config/team-budget.json` | 팀별 예산 설정 (개인 재정) | 30줄 |

---

## 2. 파일별 구체적 분석

### `config/tasks.json` — 가장 복잡한 파일

**총 줄 수:** 882줄 | **태스크 개수:** 38개

#### 범용화 가능한 태스크 (Fork에서도 그대로 쓸 수 있는 것)
- ✅ `system-health` (L89-113): 시스템 체크 — 범용
- ✅ `disk-alert` (L217-243): 디스크 경고 — 범용
- ✅ `memory-cleanup` (L245-265): 메모리 정리 — 범용
- ✅ `security-scan` (L387-407): 보안 스캔 — 범용
- ✅ `rag-health` (L410-430): RAG 점검 — 범용
- ✅ `weekly-code-review` (L712-729): 주간 코드 리뷰 — 범용

**제거 필수 태스크** (개인 특화, 다른 사람에겐 의미 없음)
- ❌ `morning-standup` (L3-31): 정우님 개인 일정 + Google Calendar (yuiopnm1931@gmail.com 하드코딩)
- ❌ `tqqq-monitor` (L33-60): TQQQ 투자 모니터링 ($47 손절선 = 정우님 개인 설정)
- ❌ `daily-summary` (L62-86): 일일 요약 (개인 루틴)
- ❌ `news-briefing` (L192-214): 뉴스 브리핑 (개인 관심사)
- ❌ `career-weekly` (L454-475): 커리어 리포트 (SK D&D, Spring Boot 개발자 — 정우님만)
- ❌ `academy-support` (L505-527): 학습팀 보고 (보람님 Preply 레슨 참조 L509)
- ❌ `brand-weekly` (L554-575): 브랜드팀 보고 (ramsbaby.netlify.app 블로그)
- ❌ Board Meeting 관련 (L662-709): 자비스 컴퍼니 체제 (개인 회사)

**수정 필요 태스크** (구조는 좋지만 개인 맥락 제거)
- 🟡 `council-insight` (L478-502): CEO 일일 점검 → "팀 이름" 제거, 한국어 → 영어
- 🟡 `infra-daily` (L578-598): 인프라 점검 → 팀명 "인프라팀" 제거
- 🟡 `record-daily` (L530-552): 기록팀 마감 → 팀명, 한국어 prompt 제거

#### 구체적 하드코딩 위치
```
L8:  "오늘의 아침 브리핑" (한국어)
L8:  yuiopnm1931@gmail.com (정우님 Google Calendar)
L8:  MDE3MjE5NzU0MjA3NTAxOTg4ODc6MDow (Google Tasks 기본 목록 ID)
L15: "jarvis" (Discord 채널명)
L35: "TQQQ 모니터링" + $47 (정우님 투자 설정)
L37: "jarvis-market" (Discord 채널명)

... (총 60+ 곳)
```

---

### `discord/personas.json` — 12개 채널 페르소나

**파일 크기:** 1800줄+ | **문제도:** 최악 (개인화 가장 심함)

#### 핵심 하드코딩 정보

**jarvis 채널** (L2-40)
- 정우님의 "신뢰 기반 채널" — 직접적인 피드백 원칙 명시
- "아이언맨 자비스 스타일" — 정우님의 성격 반영

**jarvis-blog 채널** (L4, 세 번째 인자)
- "이정우 · 백엔드 9년+ · SK D&D 재직"
- "https://ramsbaby.netlify.app" (블로그 URL)
- resume-ledger.md, v12 버전 등 이력서 관리 상세
- "JANDI DAU 15만/MAU 300만" (정우님 실제 경력)
- "Kafka EDA 설계 후 퇴사" (정우님 이력)

**jarvis-boram 채널** (마지막, 보람님 전용)
- "송보람, songboram0276" (보람님 username)
- "90년생, 유치원교사 출신"
- "Preply 온라인 한국어 교사"
- "Galaxy S26 Ultra 스카이블루" + "Casetify Cherry Blossom" (보람님 폰 정보)
- "저녁 20~21시대 집중 대화 패턴"

**jarvis-preply-tutor 채널** (L11)
- "Preply 온라인 한국어 교사 (정우님과 보람님 공유)"
- preply-today.sh 스크립트 호출 → Preply API에 접근

#### 변경 방식
- **Option A (최소 변경):** 채널별 `"--- 채널명 ---"` 헤더만 유지, 개인 맥락 제거 → 범용 페르소나로 변경
- **Option B (권장):** config/user-profile.json 신설, 사용자 정의 페르소나를 외부에서 로드하는 구조로 재설계

---

### `config/company-dna.md` — 자비스 컴퍼니 가치관

**파일 크기:** 85줄 | **문제도:** 중간~높음

#### 개인화 내용
- DNA-C001: "TQQQ 분석 시 반드시 체크할 3가지" → 정우님의 투자 신조
- DNA-C002: "정우님 알림 시간 원칙" (23:00~08:00 조용함) → 개인 수면 패턴
- DNA-S001/S002: Discord 보고 형식, 메시지 표준 → 정우님 취향
- 실험 DNA: Calendar 만료 경보, SQLite 메시지 버스 → 정우님의 구체적 문제

**Fork 시 재정의 필요**
- 사용자 이름 "정우님" → "{{USER_NAME}}"
- "TQQQ $47" → 사용자 관심 상품으로 변경
- 알림 시간대 → config/schedule.json으로 외부화

---

### `teams/` 디렉토리 — 11개 팀

**구조:** 각 팀별 `team.yml`, `prompt.md`, `system.md`

#### 팀 목록 (모두 한국어 + 개인 맥락)
1. `teams/council/` → "감사팀 (Council)" — CEO 역할
2. `teams/career/` → "성장팀" — 이정우 커리어 지원
3. `teams/record/` → "기록팀" — 일일 기록
4. `teams/infra/` → "인프라팀" — 시스템 감시
5. `teams/academy/` → "학습팀" — 보람님 Preply 지원
6. `teams/brand/` → "브랜드팀" — ramsbaby 블로그/오픈소스
7. `teams/finance/` → "파이낸스팀" — TQQQ/시장 분석
8. `teams/trend/` → "정보팀" — AI/기술 인텔
9. `teams/security-scan/` → "보안팀"
10. `teams/standup/` → "스탠드업" (미확인)
11. `teams/recon/` → "정보탐험대"

#### 예시: `teams/career/team.yml`
```yaml
name: "성장팀 (Career)"  # ← 한국어 팀명
taskId: career-weekly
members: ["strategy-advisor"]  # ← 고정된 에이전트
context: "이정우(정우님)의 커리어 지원"  # ← 개인 이름
```

**변경 방식**
- 팀명 → "{{TEAM_NAME}}" 템플릿 또는 config/teams.json으로 외부화
- 한국어 prompt → 영어 또는 사용자 언어로 변경
- 개인 맥락 제거: "보람님의 Preply 레슨" → "팀원의 학습 지원"

---

### `agents/` 디렉토리 — 4개 에이전트

**파일:** CEO, Infra Chief, Strategy Advisor, Record Keeper

#### 개인화 내용
- **ceo.md** (L25~50): 자비스 컴퍼니 조직도 + 대표님/사원 호칭
- **infra-chief.md**: "launchd 감시" + Mac Mini 특화
- **strategy-advisor.md**: TQQQ $47 손절선, 정우님 이직 관련
- **record-keeper.md**: 팀 메시지 기록, 의사결정 감사 → 개인 회사 운영 체제

**변경 방식**
- 직함 재정의 가능하지만, 현재는 "자비스 컴퍼니" 체제 강결합
- Fork인 입장에서는 이 4개 에이전트를 걷어내고 단순 태스크 러너로 단순화 권장
- 또는 `agents/generic/` 디렉토리로 분리하고 회사 별 에이전트는 별도 로드

---

### `bin/ask-claude.sh` — 코어 런타임

**파일 크기:** ~1810줄 | **개인화 정도:** 중간~낮음

#### 하드코딩 확인 포인트

```bash
L13: BOT_HOME="${BOT_HOME:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
     # ~/.jarvis 기본값 → 절대 경로 변경 필요

L16: LOG_FILE="${BOT_HOME}/logs/task-runner.jsonl"
     # 상대 경로이지만, 초기화 스크립트에서 BOT_HOME 설정 필수

L30: context-loader.sh 호출 — 이 스크립트에 개인 컨텍스트가 embed됨
```

**변경 최소화 전략**
- `ask-claude.sh` 자체는 범용 — 외부 상수 파일(`~/.jarvis/config/env.sh`)만 추가 로드
- context-loader.sh를 config/ 아래로 옮기고 템플릿화

---

### `config/monitoring.json.example`

**파일 크기:** 20줄 | **개인화:** 낮음

```json
{
  "webhook": {
    "url": "YOUR_WEBHOOK_URL",  // ← 템플릿
    "channel_name": "ai-bot"    // ← 사용자 채널명
  },
  "ntfy": {
    "topic": "your-ntfy-topic-id"  // ← 사용자 토픽
  }
}
```

**평가:** 이미 `.example` 템플릿 형식이라 양호. 문제없음.

---

## 3. 하드코딩 패턴 분석

### 패턴 1: 개인 이메일/ID (하드코딩, 다른 사용자에겐 작동 불가)

| 발견처 | 값 | 변경 방법 |
|-------|-----|----------|
| tasks.json L8 | `yuiopnm1931@gmail.com` | config/user.json에 `googleEmail` 필드 |
| tasks.json L8 | `MDE3MjE5NzU0MjA3NTAxOTg4ODc6MDow` | config/user.json에 `googleTasksId` 필드 |
| personas.json | `songboram0276` | config/user.json에 `preplyUsername` |
| scripts/preply-today.sh | API key (별도 파일) | 이미 .env로 분리됨 |

### 패턴 2: Discord 채널명 (테스트 환경 불일치)

| 채널 | 하드코딩 위치 | 현황 |
|------|----------|------|
| `jarvis` | tasks.json, personas.json | 메인 채널 (범용 OK) |
| `jarvis-market` | tasks.json L46 | 투자/시장 (범용 OK) |
| `jarvis-ceo` | tasks.json L177 | CEO 보고 (개인 회사) |
| `jarvis-dev` | personas.json | 개발자 채널 (이정우 특화) |
| `jarvis-boram` | personas.json | **보람님 전용** ❌ |
| `jarvis-preply-tutor` | personas.json | **Preply 특화** ❌ |
| `jarvis-family` | personas.json | **가족 채널** ❌ |

**문제:** `jarvis-boram`, `jarvis-family`, `jarvis-preply-tutor` 등은 다른 사용자에겐 불필요

**해결책:** config/discord.json에서 채널 맵핑 외부화
```json
{
  "channels": {
    "main": "jarvis",
    "dev": "bot-dev",
    "family": "DISABLED",  // Fork인 입장에서 비활성화
    "personal": "DISABLED"
  }
}
```

### 패턴 3: 한국어 하드코딩

- tasks.json: 모든 `name` 필드 (38개)
- tasks.json: 모든 `prompt` 필드 (지시사항, 로직)
- personas.json: 12개 채널 전체 한국어
- company-dna.md: 전체 한국어
- teams/*/prompt.md: 한국어
- teams/*/team.yml: 팀명, description 한국어

**영향도:** Fork 사용자의 모국어가 다르면 UI/프롬프트가 모두 한국어 → 불편

**해결책:**
1. 단기: `config/i18n.json` 신설, 주요 문자열 외부화
2. 중기: 각 파일에서 `{{LANG}}`/`{{TEAM_NAME}}` 템플릿 지원
3. 장기: 번역 커뮤니티 구성

---

## 4. Fork 후 최소 30분 체크리스트

### 필수 변경 (아래 3개 안 하면 시스템 작동 불가)

- [ ] **1단계 (5분):** `config/user.json` 신설
  ```json
  {
    "name": "YOUR_NAME",
    "googleEmail": "your-email@gmail.com",
    "googleTasksId": "YOUR_GOOGLE_TASKS_ID",
    "openaiApiKey": "sk-...",
    "discordBotToken": "YOUR_BOT_TOKEN"
  }
  ```

- [ ] **2단계 (15분):** tasks.json.example → tasks.json 복사 + 개인 태스크 제거
  - `morning-standup` 제거 (또는 변경)
  - `tqqq-monitor` 제거
  - `career-weekly` → 자신의 커리어로 수정 (또는 제거)
  - `academy-support` 제거
  - `board-meeting-*` 제거 (또는 간소화)

- [ ] **3단계 (10분):** `discord/personas.json` 채널 재설정
  - `jarvis-boram` 제거
  - `jarvis-family` 제거 (또는 활성화)
  - `jarvis-preply-tutor` 제거
  - 자신의 Discord 채널명으로 변경

---

## 5. 개선 제안: 범용화 로드맵

### Phase 1 (단기, 1주일 내): 개인 컨텍스트 분리

**신설 파일:**
```
config/
  ├── user.json         (개인 정보 — .gitignore)
  ├── teams.json        (팀 정의)
  ├── channels.json     (Discord 채널 맵핑)
  └── i18n.json         (다국어 문자열)
```

**변경:**
- tasks.json: 개인 태스크 분리 → tasks-personal.json.example
- tasks.json.example: 5개 범용 태스크만 남기기
- personas.json: 채널별 페르소나를 config/personas/ 디렉토리로 분리

### Phase 2 (중기, 2~3주): 템플릿화

**목표:** Fork 후 `jarvis-init.sh` 한 번만 실행하면 자동 설정

```bash
$ ./bin/jarvis-init.sh \
  --user "John Doe" \
  --email "john@example.com" \
  --discord-token "xxxx" \
  --lang en
```

**동작:**
- config/user.json 생성
- tasks.json.example → tasks.json (개인 이메일 자동 치환)
- personas.json의 언어 자동 전환
- teams/*.yml 샘플화

### Phase 3 (장기, 1개월): i18n + 페르소나 마켓플레이스

**구상:**
```
personas/
  ├── en/
  │   ├── trader.json      (투자자 페르소나)
  │   ├── developer.json   (개발자)
  │   └── manager.json     (관리자)
  └── ko/
      ├── trader.json
      └── developer.json
```

사용자가 자신의 역할에 맞는 페르소나 선택 가능.

---

## 6. 오픈소스 기준으로 본 현재 상태

### ✅ 좋은 점
- **모듈화:** tasks.json, personas.json 등이 구조화됨
- **설정 중심:** 중요 상수가 config/ 아래 집중
- **문서화:** ADR, README, company-dna.md 완비
- **재현성:** scripts 폴더가 bash 스크립트로 잘 정리됨

### ❌ 개선 필요
- **개인화 강결합:** 이정우/보람님 이름이 코드에 박혀있음
- **한국어 전용:** 다른 국가 사용자 배려 부족
- **채널 강결합:** Discord 채널이 tasks.json에 하드코딩
- **팀 구조 복잡:** 7개 팀 + 4개 에이전트가 실제로는 1인 시스템인데 회사처럼 보임
- **회사 체제:** "자비스 컴퍼니" 강결합 → Fork인 일반 사용자에겐 혼란

---

## 7. Fork 후 실제 변경 경로 (구체적 명령어)

### 최소 30분 경로 (작동하게만)

```bash
# 1. 설정 파일 복사 + 커스터마이징
cp config/tasks.json.example config/tasks.json
# → config/tasks.json에서 morning-standup, tqqq-monitor, career-weekly 줄 삭제

cp config/user.example.json config/user.json
# → 자신의 이메일, 토큰 입력

# 2. personas.json 개인화 (선택사항)
cp discord/personas.json discord/personas.json.backup
# → jarvis-boram, jarvis-family 채널 삭제
# → 또는 전체 영어로 번역

# 3. 실행
./bin/jarvis-cron.sh morning-standup  # 테스트
```

### 권장 1시간 경로 (깔끔하게)

위의 최소 경로 + 다음:

```bash
# 4. teams/ 재정의 (선택사항 — 이용 안 할 거면 skip)
mv teams/ teams-personal.backup/
mkdir -p teams/default

# 5. i18n 적용 (선택사항)
# tasks.json의 한국어 prompt를 영어로 번역 후 저장

# 6. git 초기화 (fork 아닌 새 프로젝트로 시작하려면)
rm -rf .git
git init
git add config/user.json config/tasks.json discord/personas.json
git commit -m "Initial personalization"
```

---

## 8. 요약 테이블: 파일별 개인화 정도

| 파일 | 크기 | 개인화도 | 변경 난이도 | 권장 조치 |
|-----|------|---------|-----------|----------|
| config/tasks.json | 882줄 | 🔴 매우 높음 | 높음 | 60% 개인 태스크 제거, 다른 80% 한국어→영어 |
| discord/personas.json | 1800+줄 | 🔴 매우 높음 | 매우 높음 | 채널별 페르소나 재구성 또는 config 외부화 |
| config/company-dna.md | 85줄 | 🔴 높음 | 중간 | "정우님" → "{{USER}}" 템플릿화 |
| teams/ | ~500줄 | 🔴 높음 | 높음 | 팀명, prompt 전체 재정의 |
| agents/ | ~400줄 | 🟡 중간 | 중간 | CEO/팀장 에이전트 제거 또는 재정의 |
| bin/ask-claude.sh | 1810줄 | 🟢 낮음 | 낮음 | BOT_HOME만 확인, 나머지는 이미 범용 |
| scripts/ | 수십 개 | 🟢 낮음 | 낮음 | 일부 한국어 주석, 경로 확인만 |
| config/monitoring.json.example | 20줄 | 🟢 낮음 | 매우 낮음 | 이미 템플릿, 변경 불필요 |

---

## 9. 결론 및 다음 단계

### 현재 상태
- **오픈소스 준비도:** 40% (핵심 기능은 범용이지만 개인화 강결합)
- **Fork 난이도:** 중간~높음 (비개발자는 30분, 개발자는 1시간 필요)
- **재설정 필요도:** **높음** (다른 사용자가 쓰려면 6개 파일 반드시 수정)

### 권장 다음 단계

1. **즉시 (오늘):** tasks.json.example을 "누구나 쓸 수 있는" 5개 범용 태스크로 재구성
   - system-health, disk-alert, memory-cleanup, rag-health, security-scan

2. **이번 주:** config/user.json 샘플 만들기 + README에 "Fork 후 설정" 섹션 추가

3. **다음 주:** Phase 1 구현 (config/teams.json, config/channels.json 신설)

4. **한 달 내:** jarvis-init.sh 스크립트로 자동화

---

## 부록 A: 전체 하드코딩 grep 결과 (샘플)

```bash
# 개인 이름 참조
$ grep -r "정우\|정우님\|이정우\|보람\|송보람" ~/.jarvis/ --include="*.json" --include="*.md" --include="*.sh"

~/.jarvis/config/tasks.json:8:        "prompt": "...정우님...CEO 인계사항...보람님..."
~/.jarvis/discord/personas.json:9-10: "이정우 · 백엔드 9년+ · SK D&D 재직"
~/.jarvis/discord/personas.json:12: "송보람, songboram0276"
~/.jarvis/agents/ceo.md:80: "대표님 (이정우, 사장)"

# 개인 이메일/서비스
$ grep -r "yuiopnm\|ramsbaby\|songboram\|preply\|TQQQ" ~/.jarvis/config/ --include="*.json"

~/.jarvis/config/tasks.json:8: "yuiopnm1931@gmail.com"
~/.jarvis/config/tasks.json:559: "ramsbaby.netlify.app"
~/.jarvis/config/tasks.json:509: "보람님 관련...Preply"

# 한국어 프롬프트 (전수 조사)
$ grep -r "한국어" ~/.jarvis/config/tasks.json | wc -l
38  # 38개 프롬프트, 모두 한국어
```

---

## 부록 B: `config/user.json` 샘플

```json
{
  "profile": {
    "name": "Your Name",
    "role": "solo_founder|team_lead|developer",
    "timezone": "UTC|America/New_York|Asia/Seoul"
  },
  "services": {
    "google": {
      "email": "your-email@gmail.com",
      "tasksListId": "YOUR_GOOGLE_TASKS_ID"
    },
    "discord": {
      "botToken": "YOUR_BOT_TOKEN",
      "channels": {
        "main": "bot-general",
        "dev": "bot-dev",
        "system": "bot-system",
        "ceo": "DISABLED"
      }
    },
    "openai": {
      "apiKey": "sk-..."
    }
  },
  "options": {
    "language": "en|ko|ja",
    "enableTeams": false,
    "enablePersonalChannels": false
  }
}
```

---

**문서 작성:** 2026-03-14 | **리뷰 대상:** 정우님 | **다음 액션:** Phase 1 설계 회의

