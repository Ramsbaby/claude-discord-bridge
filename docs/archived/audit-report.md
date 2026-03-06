# Jarvis AI 감사 보고서
> 감사일: 2026-03-02 (월)
> 감사자: auditor agent

---

## 1. Git 관리 현황

### ~/.jarvis (실제 구현 코드)
- **상태**: 초기화 완료 (본 감사에서 수행)
- **커밋**: `abe4f86` - "Initial commit: Jarvis AI production system"
- **파일 수**: 64개 파일, 6,860줄
- **.gitignore**: 민감 정보 및 런타임 디렉토리 제외 확인
  - `discord/.env` (Discord 토큰)
  - `config/monitoring.json` (모니터링 설정)
  - `state/`, `logs/`, `results/`, `watchdog/`, `rag/lancedb/`, `discord/node_modules/`

### ~/jarvis-ai (설계 문서)
- **상태**: 커밋 완료 (본 감사에서 수행)
- **커밋**: `daff30c` - "Update: tasks.json 19개, Phase 3-5 완료 반영"
- **변경**: README.md (+1/-1), architecture.md (+133/-85)
- **원격**: origin/main 최신 상태

### 평가: PASS
- 두 저장소 모두 커밋 완료, .gitignore 적절히 설정됨
- 원격 push는 별도 수행 필요 (~/.jarvis는 원격 미설정)

---

## 2. 메모리/RAG 품질

### memory.md (12줄)
- **평가**: 빈약 (3개 항목만 기록)
- 기록: MacBook+Mac Mini+Galaxy 환경, gog tasks 사용, Discord 인터페이스
- **개선 필요**: 대화에서 발견된 선호/패턴이 거의 축적되지 않음. `/remember` 명령 활성 사용 안내 필요.

### decisions.md (12줄)
- **평가**: 양호 (핵심 결정 5건 기록)
- 주요 결정: claude -p 기반, RAG LanceDB 적용, Discord auto-thread
- 날짜/이유 형식으로 구조화됨

### handoff.md (33줄)
- **평가**: 양호 (구조적이고 실용적)
- 진행 중/P0/P1/완료 섹션으로 체계적 관리
- P0 항목 5개 (Company DNA, architecture.md 동기화 등)
- 최근 완료 12건 기록 (2026-03-01)

### RAG LanceDB 인덱스
- **크기**: 64MB (252개 data 파일)
- **상태**: 활성 (매시간 증분 인덱싱 크론 동작 중)
- **쿼리 테스트**: "손절선 기준" 검색 성공 -- 관련 문서 3건 반환 (DNA-C001 정보 정확)

### 평가: PARTIAL PASS
- RAG 검색 품질: 우수 (시맨틱 검색 정상 작동)
- memory.md: 개선 필요 (축적 부족)
- decisions.md / handoff.md: 양호

---

## 3. 코드 품질

### 파일 크기
| 파일 | 줄수 | 제한(1500) | 상태 |
|------|------|------|------|
| discord-bot.js | 1,193 | 79% | PASS |
| jarvis-cron.sh | 79 | 5% | PASS |
| route-result.sh | 91 | 6% | PASS |

### 주요 코드 구조
- **retry-wrapper.sh** (145줄): 지수 백오프, 에러 분류, 세마포어 통합
- **ask-claude.sh**: `claude -p` + `gtimeout` + 컨텍스트 주입
- **semaphore.sh**: mkdir 기반 슬롯 잠금 (MAX_SLOTS=2, STALE_TIMEOUT=600s)

### 평가: PASS
- 모든 파일 1,500줄 제한 이내
- bash 스크립트에 `set -euo pipefail` 적용됨
- 세마포어/재시도 로직 구조화 양호

---

## 4. 미실행 태스크 분석

### 오늘 (2026-03-02) 실행 통계
- **성공**: 151건 / **실패**: 2건 (크론 exit 124 타임아웃)
- **성공률**: 98.7%

### 미실행 태스크 분류

| 태스크 | 스케줄 | 미실행 사유 | 조치 |
|--------|--------|------------|------|
| daily-summary | 매일 20:00 | 아직 시간 안 됨 | 정상 |
| weekly-report | 일요일 20:05 | 오늘은 월요일 | 정상 |
| monthly-review | 매월 1일 09:00 | 오늘은 2일 | 정상 |
| cost-monitor | 일요일 09:00 | 오늘은 월요일 | 정상 |
| career-weekly | 금요일 18:00 | 오늘은 월요일 | 정상 |
| **weekly-kpi** | **월요일 08:30** | **크론 항목이 08:30 이후 추가됨** | **내일 확인** |
| **security-scan** | **매일 02:30** | **크론 항목이 02:30 이후 추가됨** | **내일 확인** |
| **rag-health** | **매일 03:00** | **크론 항목이 03:00 이후 추가됨** | **내일 확인** |
| test-echo | 수동 전용 | 크론 항목 없음 | 정상 |

---

## 2026-03-01 장애 분석 (분석일: 2026-03-02)

### 요약

- **발생**: 09:00~14:32 KST (약 5.5시간, 2개 Phase)
- **영향**: 33건 실패 (9건 timeout + 24건 exit code 1)
- **영향 태스크**: system-health, rate-limit-check, github-monitor, disk-alert
- **원인**: Claude CLI (`claude -p`) 일시적 장애 (Anthropic API 과부하 + Discord bot 배포 간섭)
- **자가복구**: 15:01:14Z (Phase 2 마지막 에러 14:32:26Z 이후 약 29분)
- **18:00~23:59**: 장애 없음 (전 태스크 정상 성공)

### Phase 1: 아침 timeout (09:00~09:21)

| 시각 | 태스크 | 유형 | 소요시간 |
|------|--------|------|----------|
| 09:02~09:03 | disk-alert | timeout (exit 124) | 30s x3 |
| 09:08~09:10 | rate-limit-check | timeout (exit 124) | 30s x3 |
| 09:12 | rate-limit-check | timeout (exit 124) | 30s x1 |
| 09:17 | rate-limit-check | timeout (exit 124) | 90s x1 |
| 09:21 | rate-limit-check | timeout (exit 124) | 90s x1 |

**원인 추정**: Anthropic API 응답 지연. `claude -p`가 내부 타임아웃(30s/90s)에 도달. retry-wrapper에서 exit 124는 non-retryable로 분류되어 즉시 실패 처리됨.

**복구**: 09:30부터 rate-limit-check 정상 성공 (disk-alert는 09:08부터 복구).

### Phase 2: Claude exit code 1 (13:31~14:32)

| 시간대 | 태스크 | 실패 횟수 | 소요시간 |
|--------|--------|-----------|----------|
| 13:31 | system-health | 3 (retry 3회) | 3~4s |
| 13:32 | rate-limit-check | 3 (retry 3회) | 3~4s |
| 14:01 | system-health | 3 (retry 3회) | 3~5s |
| 14:02 | rate-limit-check | 3 (retry 3회) | 3~5s |
| 14:03 | github-monitor | 3 (retry 3회) | 3~4s |
| 14:10 | disk-alert | 3 (retry 3회) | 3s |
| 14:31 | system-health | 3 (retry 3회) | 3~5s |
| 14:32 | rate-limit-check | 3 (retry 3회) | 3~4s |

**원인**: `claude -p`가 3~5초 만에 exit code 1로 종료. 이는 Claude CLI 자체가 즉시 거부하는 패턴으로, Anthropic API rate limit 또는 세션 충돌이 원인.

**배경 근거**:
- Discord bot이 12:12~12:56 사이 6회 SIGTERM/재시작 (배포/설정 변경 작업 추정)
- launchd-guardian이 13:00부터 watchdog를 매 3분 반복 복구 시도
- watchdog 자체는 정상 가동 중 (bot=healthy 보고)
- stale `claude -p` 프로세스 3건씩 반복 정리 (15:09, 15:30, 15:57)

**핵심**: Discord bot 재시작 + 크론 `claude -p` 동시 실행이 Anthropic rate limit 또는 세션 경합을 유발. 3~5s의 빠른 실패는 API 거부(rate limit 또는 인증 에러)를 시사함.

### Phase 3: Discord bot 추가 장애 (16:27~16:54)

- 16:30: watchdog가 bot 재시작 시도 #1
- 16:39: stale claude -p 3건 정리 후 재시작 시도 #1
- 16:42: 재시작 시도 #2
- 16:45: 재시작 시도 #3, **ALERT 발행**
- 16:48: cooldown 진입 (300s)
- 17:00 이후: 정상 복구

이 시간대에는 크론 태스크 자체는 정상 실행됨 (15:00 이후 전 태스크 성공).

### 자가복구 타임라인

| 시각 | 이벤트 |
|------|--------|
| 09:30 | Phase 1 timeout 복구 (rate-limit-check 성공) |
| 15:01 | Phase 2 exit code 1 복구 (system-health 성공) |
| 17:00 | Discord bot 완전 복구 |
| 21:13 | Discord bot 추가 재시작 (watchdog), 이후 안정 |

### 재발 방지 권고

1. **exit 124 retryable 변경**: retry-wrapper.sh에서 exit 124를 retryable로 변경 (이미 기존 감사보고서에서도 권고됨)
2. **세마포어 슬롯 검토**: Discord bot 재시작 시 claude -p 동시 실행 제한 (현재 MAX_SLOTS=2)
3. **Discord bot 배포 시 크론 일시 중단**: 배포/설정 변경 시 crontab 일시 비활성화 절차 필요
4. **rate limit 사전 감지 강화**: rate-tracker.json의 80% 경고를 60%로 하향 (Discord+cron 합산 경합 고려)
5. **exit code 1 원인 상세 로깅**: 현재 "claude exited with code 1"만 기록 -- stderr 캡처 추가 필요

---

**핵심 발견**: security-scan, rag-health, weekly-kpi, cost-monitor, career-weekly, monthly-review 6개 태스크의 crontab 항목은 존재하지만, **cron 로그에 단 한 번도 실행 기록이 없음**. 이들은 오늘 세션에서 crontab에 추가된 것으로, 해당 스케줄 시각 이후에 등록되었기 때문. 내일 첫 실행 예정.

---

## 5. 크론 타임아웃 분석

### 장애 현황
- **실패 2건**: 10:30 (exit 124, 121s), 11:00 (exit 124, 121s)
- **성공 30건**: 10:45 이후 전부 정상 (평균 30~40초)
- **실패율**: 6.25% (2/32)

### 원인 분석
1. **exit 124** = `gtimeout`이 아닌 `claude -p` 자체의 내부 타임아웃
   - gtimeout은 180s이지만, 실제 종료 시점은 121s (~120s + 1s 오버헤드)
   - `claude -p`에 내부적으로 120초 유휴/네트워크 타임아웃이 존재하는 것으로 추정
2. **연속 실패 후 자동 복구**: 10:30, 11:00 실패 -> 10:45부터 전부 성공
   - Anthropic API 일시적 과부하 또는 rate limit이 원인으로 추정
3. **retry-wrapper에서 exit 124는 non-retryable로 분류** (line 53)
   - 따라서 재시도 없이 즉시 실패 처리됨

### 설정 확인
- `timeout: 180` (tasks.json) -- 정상 반영됨
- `retry.max: 2, backoff: exponential` -- 설정되어 있으나 exit 124는 재시도 대상에서 제외

### 권고
- exit 124를 `retryable`로 변경 검토 (일시적 API 문제일 수 있으므로)
- 또는 claude -p 내부 타임아웃을 늘리는 옵션이 있는지 확인

---

## 6. sessions.json 구조

- **세션 수**: 7개
- **구조**: `{ "channelId": { "id": "sessionId", "updatedAt": "timestamp" } }`
- **12h TTL 마이그레이션**: updatedAt 필드 존재 확인 -- 구조 양호

---

## 7. 개선 권고사항 (우선순위별)

### P0 -- 즉시
1. **security-scan/rag-health 실행 확인**: 내일(03-03) 02:30/03:00 로그 확인
2. **weekly-kpi 실행 확인**: 내일(03-03) 08:30 로그 확인
3. **크론 exit 124 재시도 정책**: retry-wrapper.sh line 53의 `124) "non-retryable"` -> `124) "retryable"` 변경 검토

### P1 -- 이번 주
4. **memory.md 품질 향상**: RAG memory.md에 대화 중 발견한 사용자 선호/패턴 적극 기록. 현재 3건 -> 목표 10건 이상
5. **~/.jarvis 원격 저장소 설정**: GitHub private repo 생성 후 push (백업)
6. **handoff.md P0 항목 처리**: Company DNA SSoT, architecture.md 경로 동기화 등 5건

### P2 -- 다음 주
7. **RAG 커버리지 확장**: reports/(25개), decisions/(3개) 디렉토리 인덱싱 추가 (handoff.md P1 항목)
8. **세마포어 슬롯 증설 검토**: MAX_SLOTS=2 -> 3 (신규 태스크 6개 추가로 동시 실행 경쟁 증가 예상)

---

## 부록: 실행 현황 요약

```
총 태스크: 19개 (tasks.json)
크론 등록: 18개 (test-echo 제외)
오늘 실행: 10종 (151 성공 / 2 실패)
신규 등록 (미실행): 6종 (내일 첫 실행 예정)
스케줄 미도래: 2종 (daily-summary 20:00, weekly-report 일요일)
수동 전용: 1종 (test-echo)
```
