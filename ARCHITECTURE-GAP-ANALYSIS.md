# Jarvis AI 아키텍처 갭 분석 & 자율 진화 설계

**분석 일자**: 2026-03-03
**대상 시스템**: ~/.jarvis (Claude 기반 AI 어시스턴트)
**분석가**: System Architect
**목표**: 자율 처리 레벨 L4 달성 (감시→감지→수정→진화 순환 구조)

---

## A. 현재 자율성 레벨 정밀 측정

### 1. 자가 관측 (Self-Monitoring) — 현황: **부분 구현 (30%)**

#### ✅ 가능한 것
- **실시간 로깅**: task-runner.jsonl에 모든 태스크 실행 기록 (status: start/success/error/timeout/warning)
- **구조화된 로그**: `ts`, `task`, `status`, `msg`, `duration_s`, `pid`, `cost_usd`, `input_tokens`, `output_tokens` 포함
- **기본 알림**: 3회 연속 실패 → L2 에스컬레이션 (autonomy-levels.md L55~57)
- **RAG 품질 감시**: 매일 03:00 rag-health 크론 (index chunks, DB size, error count 추적)
- **관찰 윈도우**: context-bus.md에 일일 점검 결과 수집 (council-insight 23:00 실행)

#### ❌ 불가능한 것
- **자동 패턴 감지 없음**: 로그가 있어도 "문제"를 자동으로 인식하지 못함
  - 예: rate-limit-check 로그는 있지만, "80% 이상"에서 자동으로 throttle 결정을 하지 않음
  - 현황: 정우님이 직접 읽고 판단 필요

- **메트릭 추이 분석 없음**: 일일 보고는 있지만 주간/월간 추세는 없음
  - 예: 이번 주 실패율이 5%인데, 지난주는 2%였는지 모름
  - 영향: 작은 성능 저하를 감지 못하고 누적됨

- **근본 원인 자동 분석 부재**: 에러 타입은 로깅되지만 원인까지 진단하지 않음
  - 예: "system-health FAILED" 기록만 있고, 왜 실패했는지 자동 분석 없음
  - 현황: council-insight가 Discord에 보고하지만, 다음 조치로 이어지지 않음

#### 🟡 진행 중인 시도
- **관찰 체계**: context-bus.md (2026-03-03)
  - council-insight가 매일 23:00 모든 팀 상태 수집
  - 현황: "🔴 watchdog 중단 + RAG API 전면 불능" 감지됨
  - 문제: 감지 후 자동 수정 루프가 없음 → 정우님 수동 개입 필요

### 2. 자가 수정 (Self-Healing) — 현황: **최소 구현 (15%)**

#### ✅ 가능한 것
- **기본 재시도**: ask-claude.sh에 run_with_retry() (최대 3회, exponential backoff)
- **LaunchAgent 자동 복구**: launchd-guardian.sh (3분마다 discord-bot/watchdog 재등록)
- **프로세스 감시**: bot-watchdog.sh (5분마다 "침묵 15분" 감지 → 재시작)

#### ❌ 불가능한 것
- **동적 파라미터 조정 없음**: 재시도 횟수·timeout은 고정값
  - 예: tqqq-monitor이 특정 시간에 자주 timeout → timeout을 자동으로 증가시키지 않음
  - 현황: tasks.json에서 수동 수정 필요

- **설정 자동 롤백 없음**: 위험한 변경 후 자동복구 불가
  - 예: rate-limit-check 실패율 50% (timeout 문제) → 변경했는데 더 악화 → 자동 롤백 없음

- **단계적 격리 없음**: 한 팀의 문제가 다른 팀으로 확산
  - 현황: RAG API 429 오류 → 모든 팀의 RAG 기능 중단 (공용 리소스)
  - 원하는 것: Team A RAG 실패 → Team B는 fallback 메모리로 계속 작동

### 3. 에이전트 간 협업 (Multi-Agent Coordination) — 현황: **기본 구현 (40%)**

#### ✅ 가능한 것
- **공용 게시판**: context-bus.md (모든 에이전트가 읽음, council-insight가 매일 갱신)
- **핸드오프 로그**: rag/handoff.md (진행 중 작업 기록, 손수레 원칙)
- **공유 인박스**: rag/teams/shared-inbox/ (팀 간 메시지)
- **보고서 디렉토리**: rag/teams/reports/ (주간/월간 보고서, 다른 팀이 읽을 수 있음)
- **DAG 구조**: 일부 크론에서 task dependency 구현 (예: council-insight → record-daily)

#### ❌ 불가능한 것
- **실시간 이벤트 버스 없음**: 폴더 기반 메시지 시스템 (레이턴시 높음)
  - 현황: Team A 문제 발생 → Team B가 5분 후 shared-inbox에서 읽음
  - 원하는 것: "watchdog 실패" 이벤트 → 즉시 infra-team이 반응

- **동적 태스크 스케줄링 없음**: 크론 스케줄은 crontab에 고정
  - 예: infra-daily 실패 → 즉시 재실행 불가 (다음 스케줄까지 대기)

- **협업 데이터 주권 부재**: 어떤 팀이 어떤 데이터를 소유하는지 정의 안 됨
  - 예: measure-kpi.sh가 모든 팀 로그를 읽지만, "이건 infra팀 데이터"라는 경계 없음

### 4. 피드백 루프 (Feedback Loop) — 현황: **설계만 됨 (0% 작동)**

#### ✅ 가능한 것
- **측정 도구**: measure-kpi.sh 존재 (주간 KPI 수집)
  - 수집 항목: 태스크 성공률, RAG 통계, Discord 응답 건수, 비용, 결과물 수

- **기준선**: autonomy-levels.md에 "성공률 90%" 명시

- **보고 채널**: Discord #jarvis-ceo (KPI 전송 가능)

#### ❌ 불가능한 것
- **측정 → 행동 경로 끊김**: measure-kpi.sh는 실행되지만 결과가 실제 에이전트 동작을 변경하지 않음

- **A/B 테스트 없음**: 변경 효과 측정 불가
  - 예: timeout 60초 → 120초로 증가 → 성공률 개선했는지 확인 불가

- **성과와 설정 간 연관성 분석 없음**: "이 설정 변경이 성과를 낳았나?"를 증명할 수 없음

### 5. 자가 진화 (Self-Evolution) — 현황: **문서만 있음 (5%)**

#### ✅ 가능한 것
- **성찰 문서**: self-evaluation.md 존재 (8개 축 평가 체계)
- **DNA 체계**: company-dna.md (패턴 학습 기록)
  - CORE (2개): TQQQ 분석 룰, 알림 시간 규칙
  - STANDARD (2개): Discord 보고 형식, 팀장 메시지 표준
  - EXPERIMENTAL (2개): WatchPaths 이벤트 드리븐, SQLite 메시지 버스

#### ❌ 불가능한 것
- **측정 기반 개선 없음**: DNA 추가는 "Council 합의" 기반 (정성적)

- **프롬프트 자동 최적화 없음**: ask-claude.sh의 시스템 프롬프트는 수동 편집만 가능

- **코드 자동 수정 불가**: 로그에서 "rate-limit-check 실패 원인 = timeout 부족"을 진단해도, 코드를 자동으로 변경할 수 없음

---

## B. 갭 × 임팩트 × 난이도 분석

### 갭 매트릭스

| ID | 갭 이름 | 설명 | 임팩트 | 난이도 | 선행조건 | 추정 효과 |
|---|---------|------|--------|--------|----------|----------|
| **G1** | 자동 패턴 감지 | 로그에서 이상을 자동으로 인식 (예: 성공률 90% 미달) | **H** | M | (없음) | 1시간 반응 → 5분 |
| **G2** | 메트릭 추이 분석 | 주간/월간 추세 추적 (이번 주 vs 지난 주) | **M** | M | G1 | 작은 성능 저하 감지 |
| **G3** | 근본 원인 진단 | 에러 타입 분석 (왜 실패했는지 자동 해석) | **M** | H | G1, G2 | 근본 해결 가능 |
| **G4** | 동적 파라미터 조정 | timeout/retry 자동 최적화 | **H** | M | G1, G3 | 실패 줄이기 30% |
| **G5** | 실시간 이벤트 버스 | 폴더 기반 → 이벤트 기반 메시징 | **H** | H | (없음) | 반응 시간 80% 단축 |
| **G6** | 동적 태스크 스케줄링 | 크론 고정 → 필요시 즉시 실행 | **M** | H | G5 | 시스템 복구 시간 단축 |
| **G7** | 측정→행동 자동화 | KPI 결과가 실제 설정 변경으로 반영 | **H** | M | G1, G4 | 폐쇄 루프 달성 |
| **G8** | A/B 테스트 프레임워크 | 설정 변경 효과 자동 측정 | **M** | H | G7 | 개선 신뢰도 ↑ |
| **G9** | 프롬프트 자동 최적화 | 피드백 기반 프롬프트 수정 | **M** | H | G7, G3 | 응답 품질 개선 |
| **G10** | 코드 자동 수정 | 진단 결과 → 코드 변경 자동 실행 | **H** | **H** | G3, G7 | L4 자율성 달성 |

**주목: G1, G4, G7은 "최소 완전 루프" 구성 (Phase 1)**

---

## C. 구체적 설계 제안

### C1. 관측 루프 설계 (Observation Loop)

#### RAG 품질 자동 점검 (매 시간)

**현재**: `rag-health` 크론이 실행되지만, 결과가 파일에만 저장됨

**개선안**: 자동 이상 감지 + Discord 알림

```bash
#!/usr/bin/env bash
# ~/.jarvis/scripts/rag-quality-check.sh
# 실행: 매시간 (현 rag-health 대신)

set -euo pipefail

RAG_LOG="$BOT_HOME/logs/rag-index.log"
QUALITY_STATE="$BOT_HOME/state/rag-quality.json"

# 1. 최근 인덱싱 통계 추출
LAST_RUN=$(tail -1 "$RAG_LOG" | grep -o '"ts":"[^"]*"' | head -1 | cut -d'"' -f4)
ERRORS=$(grep -c '"level":"error"' "$RAG_LOG" | tail -20 || echo 0)

# 2. 기준과 비교
ISSUE_COUNT=0
ALERTS=()

# 기준: 에러가 3개 이상
if (( ERRORS >= 3 )); then
    ALERTS+=("⚠️ RAG 에러: ${ERRORS}건 (5회 이상 시 중대)")
    ISSUE_COUNT=$((ISSUE_COUNT + 1))
fi

# 3. 이상 없으면 조용히 종료
if (( ISSUE_COUNT == 0 )); then
    echo "RAG 정상"
    exit 0
fi

# 4. 이상 있으면 Discord 알림
echo "🔴 RAG 품질 저하 감지" > /tmp/rag-alert.txt
```

#### 메트릭 정의
- ✅ 에러율 (에러 수 / 총 실행 수)
- ✅ 인덱싱 지연 (마지막 실행 ~ 현재)
- ✅ 추가된 청크 수 (증가 추세)
- ✅ API 429 오류 빈도 (비용 감시)

---

### C2. 피드백 루프 설계 (완전 루프 예시)

#### 시나리오: rate-limit-check 실패율 관리

**Step 1: 매 시간 측정** (ask-claude.sh 기존)
```
task-runner.jsonl에 기록됨
```

**Step 2: 주간 통계 집계** (measure-kpi.sh 확장)
```bash
# 결과: weekly-metrics/rate-limit-check-2026-W10.json
{
  "task": "rate-limit-check",
  "success_rate": 92,
  "target": 90,
  "status": "OK"
}
```

**Step 3: 이상 감지** (새로운 스크립트)
```bash
# kpi-anomaly-detector.sh (주간 실행)
# If success_rate < 90 → write decision to kpi-decisions.jsonl
```

**Step 4: 행동 변경** (자동 실행)
```bash
# kpi-auto-remediator.sh
# timeout 값 증가, Discord 알림, 재측정 trigger
```

**Step 5: 재측정**
```
다음 주 measure-kpi.sh가 새로운 timeout으로 재측정
```

**루프 완성**:
```
측정 → 이상 감지 → 행동 변경 → 재측정 → 효과 평가 [루프]
```

---

### C3. 에이전트 협업 강화

#### 최소 이벤트 버스 (파일 기반)

```bash
#!/usr/bin/env bash
# ~/.jarvis/scripts/event-bus.sh (매분 실행)

set -euo pipefail

TRIGGERS_DIR="$BOT_HOME/state/triggers"

# 미처리 이벤트 순회
for EVENT_FILE in "$TRIGGERS_DIR"/*.event; do
    [[ -f "$EVENT_FILE" ]] || continue

    # 이벤트 타입 확인
    EVENT_TYPE=$(grep -o '"type":"[^"]*"' "$EVENT_FILE" | head -1 | cut -d'"' -f4)

    case "$EVENT_TYPE" in
        "watchdog_failure")
            # infra-team에 재진단 요청
            touch "$BOT_HOME/state/triggers/infra-recheck-now"
            ;;
        "rag_api_failure")
            # 모든 팀에 RAG fallback 알림
            echo "[RAG 다운] $(date)" >> "$BOT_HOME/logs/rag-downtime.log"
            ;;
    esac
done
```

---

### C4. 예산 거버넌스 (Claude Max 한도 관리)

#### 자동 throttle

```bash
#!/usr/bin/env bash
# ~/.jarvis/scripts/budget-throttle-manager.sh (매 30분)

set -euo pipefail

RATE_TRACKER="$BOT_HOME/state/rate-tracker.json"

# 현재 사용률 계산
COUNT=$(jq 'length' "$RATE_TRACKER" 2>/dev/null || echo 0)
USAGE_PCT=$((COUNT * 100 / 900))

# 임계값 초과 시 조절
if (( USAGE_PCT >= 80 )); then
    echo "⚠️ Rate limit 경고: $USAGE_PCT%"
fi

if (( USAGE_PCT >= 95 )); then
    export JARVIS_RATE_CRITICAL=1
    echo "🔴 CRITICAL Rate limit"
fi
```

---

## D. Phase별 추천 순서 (실행 로드맵)

### Phase 1: 관측 루프 폐쇄 (1주)
**목표**: 자동 감지 + 기본 알림
**필요 파일**:
- rag-quality-check.sh
- kpi-anomaly-detector.sh
- system-metrics-aggregator.sh

**결과**:
- RAG 문제 5분 내 감지 ✅
- 태스크 성공률 추적 ✅
- 이상 자동 Discord 보고 ✅

### Phase 2: 자동 수정 루프 (2주)
**목표**: 감지 → 자동 변경 → 재측정
**필요 파일**:
- kpi-auto-remediator.sh
- timeout/retry 동적 조정 로직
- A/B 테스트 프레임워크

**결과**:
- timeout 자동 증가 ✅
- retry 전략 자동 최적화 ✅
- 변경 효과 자동 측정 ✅

### Phase 3: 에이전트 협업 강화 (2주)
**목표**: 이벤트 버스 + 동적 스케줄링
**필요 파일**:
- event-bus.sh
- trigger-handler.sh
- 크론 대신 이벤트 기반 실행

**결과**:
- 팀 간 반응 시간 80% 단축
- watchdog 자동 복구
- RAG 다운 시 fallback 자동 활성화

### Phase 4: 지능형 진화 (3주)
**목표**: 프롬프트/코드 자동 최적화
**필요 파일**:
- prompt-optimizer.js
- code-auto-fixer.sh
- DNA 검증 자동화

**결과**:
- 피드백 기반 프롬프트 수정
- 로그 기반 버그 자동 수정
- DNA 승격 자동화

---

## E. 현재 상태 스냅샷

**측정 기준: 2026-03-03 00:00 UTC**

| 레벨 | 항목 | 현황 | 근거 |
|------|------|------|------|
| 자가관측 | 로깅 | ✅ 100% | task-runner.jsonl 상세 기록 |
| | 패턴 감지 | ❌ 0% | 자동 분석 루프 없음 |
| | 추이 분석 | ❌ 0% | 일주 단위 비교 안 함 |
| 자가수정 | 재시도 | ✅ 70% | ask-claude.sh 기본 retry |
| | 파라미터 조정 | ❌ 0% | 수동 수정만 |
| 협업 | 공용 게시판 | ✅ 60% | context-bus.md 업데이트 |
| | 이벤트 버스 | ❌ 0% | 파일 기반만 |
| 피드백 | 측정 | ✅ 50% | measure-kpi.sh 존재 |
| | 폐쇄 루프 | ❌ 0% | 측정 → 행동 경로 끊김 |
| 진화 | 프롬프트 최적화 | ❌ 0% | 수동 편집만 |
| | 코드 자동 수정 | ❌ 0% | 진단 후 수정 불가 |

**자율성 점수**: L2.5/L4 (62.5% 달성)

**도달 목표 (L4)**: Phase 1~4 완성 시 **8주 후** 달성 가능

---

## 즉시 액션 아이템 (이번 주)

1. **G1 구현**: rag-quality-check.sh + Discord 알림 (2일)
2. **G2 추가**: 주간 메트릭 추이 비교 로직 (1일)
3. **G1 통합**: crontab에 등록 + 운영 1주일 (모니터링)
4. **정우님 검증**: 자동 감지 결과 피드백 (진화 속도 결정)

---

**작성자**: System Architect
**검토 필요**: 정우님 (자율성 기준, L3/L4 의사결정)
**다음 리뷰**: 2026-03-10 (Phase 1 진행 상황)
