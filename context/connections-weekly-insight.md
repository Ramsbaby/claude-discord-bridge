# Connections 주간 인사이트 — 실행 지침

## 목적
`~/.jarvis/state/connections.jsonl` 데이터를 분석해 크로스팀 협업 패턴, 반복 신호, 이상 징후를 파악하고 #jarvis-ceo에 보고.

## 데이터 수집 Step (순서대로 실행)

**Step 1: 7일치 connections 데이터 로드**
```bash
SINCE=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "7 days ago" +%Y-%m-%d)
grep -E "\"date\":\"${SINCE:0:7}" ~/.jarvis/state/connections.jsonl 2>/dev/null | tail -200
```
파일이 없으면: "데이터 없음 — connections.jsonl 미생성" 보고 후 종료.

**Step 2: 패턴 분석**
- 가장 많이 발생한 이벤트 유형 Top 5
- 팀 간 상호작용 빈도 (팀A → 팀B 메시지/이벤트 수)
- 반복 에러/이슈 패턴 (3회 이상 반복)
- 이전 주 대비 증감 추세

**Step 3: 이상 징후 확인**
- 특정 팀 활동 급감 (전주 대비 50% 이하)
- 미처리 에스컬레이션 항목
- 동일 에러 3회 이상 반복

## 보고서 형식

```
## Connections 주간 인사이트 — {기간}

### 핵심 패턴
- {패턴 1}
- {패턴 2}

### 주목 신호
- {반복되는 이상 징후 또는 개선 기회}

### 팀별 활동 요약
| 팀 | 이벤트 수 | 전주 대비 |
|---|---|---|

### 권고 액션
1. {구체적 조치 1}
2. {구체적 조치 2}
```

## 저장
`~/.jarvis/rag/teams/reports/connections-insight-$(date +%Y-W%V).md` 에 저장.
