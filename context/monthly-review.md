# 월간 회고 — 실행 지침

## 목적
지난 달 Jarvis 운영 전체를 데이터 기반으로 회고하고 다음 달 개선 목표를 수립.

## 데이터 수집 Step

**Step 1: 크론 성공률 계산**
```bash
LAST_MONTH=$(date -v-1m +%Y-%m 2>/dev/null || date -d "last month" +%Y-%m)
TOTAL=$(grep "$LAST_MONTH" ~/.jarvis/logs/cron.log | grep -cE "START")
SUCCESS=$(grep "$LAST_MONTH" ~/.jarvis/logs/cron.log | grep -cE "SUCCESS")
echo "성공: $SUCCESS / 전체: $TOTAL"
```

**Step 2: 가장 많이 실행된 태스크 Top 3**
```bash
LAST_MONTH=$(date -v-1m +%Y-%m 2>/dev/null || date -d "last month" +%Y-%m)
grep "$LAST_MONTH" ~/.jarvis/logs/cron.log | grep "START" \
  | sed 's/.*\[\(.*\)\] START/\1/' | sort | uniq -c | sort -rn | head -3
```

**Step 3: 실패 빈도 높은 태스크 Top 3**
```bash
grep "$LAST_MONTH" ~/.jarvis/logs/cron.log | grep -E "FAIL|ERROR" \
  | sed 's/.*\[\(.*\)\].*/\1/' | sort | uniq -c | sort -rn | head -3
```

**Step 4: 시스템 안정성 (watchdog 크래시 횟수)**
```bash
grep "$LAST_MONTH" ~/.jarvis/logs/watchdog.log 2>/dev/null | grep -c "restart\|crash\|RESTART" || echo 0
```

**Step 5: RAG 임베딩 규모**
```bash
grep "$LAST_MONTH" ~/.jarvis/logs/rag-index.log 2>/dev/null | grep -c "indexed" || echo 0
```

**Step 6: dev-runner 처리 건수**
```bash
grep "$LAST_MONTH" ~/.jarvis/logs/dev-runner.log 2>/dev/null | grep -c "SUCCESS" || echo 0
```

## 보고서 형식

```
# Jarvis 월간 회고 — {YYYY년 MM월}

## 핵심 지표
- 크론 성공률: {N}% (목표 90%)
- 총 실행: {N}건 / 성공: {N}건 / 실패: {N}건
- 시스템 재시작: {N}회
- dev-runner 처리: {N}건

## 잘 된 것
1. {구체적 성과}

## 개선 필요
1. {반복 실패 태스크 + 원인}
2. {구조적 문제}

## Top 3 실행 태스크
1. {태스크명} — {N}회
2. ...

## 다음 달 개선 목표
1. {SMART 목표}
2. {SMART 목표}
3. {SMART 목표}
```

## 저장
`~/.jarvis/rag/teams/reports/monthly-review-$(date -v-1m +%Y-%m 2>/dev/null || date -d "last month" +%Y-%m).md` 에 저장.
