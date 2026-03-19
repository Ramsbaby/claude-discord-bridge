# CEO 일일 다이제스트 — 실행 지침

## 목적
자비스 컴퍼니 대표님(이정우)께 오늘 하루 전체 운영 현황을 1페이지로 요약 보고.

## 데이터 수집 Step (순서대로 실행)

**Step 1: 오늘 크론 실행 현황**
```bash
grep "$(date +%Y-%m-%d)" ~/.jarvis/logs/cron.log | grep -cE "SUCCESS|DONE"
grep "$(date +%Y-%m-%d)" ~/.jarvis/logs/cron.log | grep -cE "FAIL|ERROR"
```

**Step 2: 시스템 상태**
```bash
cat ~/.jarvis/state/health.json 2>/dev/null | node -e "const d=require('fs').readFileSync(0,'utf8'); try{const j=JSON.parse(d); console.log('updated:', j.updated_at, 'disk:', j.disk_usage_pct+'%')}catch{}"
```

**Step 3: 오늘 Discord 활동 건수**
```bash
grep "$(date +%Y-%m-%d)" ~/.jarvis/logs/discord-bot.jsonl 2>/dev/null | wc -l
```

**Step 4: dev-queue 현황**
```bash
node --experimental-sqlite --no-warnings ~/.jarvis/lib/task-store.mjs fsm-summary 2>/dev/null
```

**Step 5: 오늘 발생한 주요 에러**
```bash
grep "$(date +%Y-%m-%d)" ~/.jarvis/logs/cron.log | grep -E "FAIL|ERROR" | sed 's/.*\[\(.*\)\].*/\1/' | sort | uniq -c | sort -rn | head -5
```

**Step 6: RAG 현황**
```bash
node --experimental-sqlite --no-warnings ~/.jarvis/lib/task-store.mjs count-queued 2>/dev/null
```

## 보고서 형식

```
# 자비스 컴퍼니 일일 다이제스트 — YYYY-MM-DD

## 오늘 요약 (한 줄)
{전체를 1문장으로}

## 크론 실행
- 성공: {N}건 / 실패: {N}건 (성공률: {%})
- 주목 이슈: {실패한 태스크명 + 원인 1줄}

## 시스템 상태
- 헬스체크: {최신 업데이트 시간, 디스크 사용률}
- dev-queue: queued {N}개 / running {N}개

## Discord 활동
- 총 {N}건 응답

## 대표님 확인/판단 필요
{있으면 기재, 없으면 "없음"}

## 내일 예정
{중요 크론 스케줄 + 주목할 이벤트}
```

## 저장 및 전송
1. `~/.jarvis/rag/teams/reports/ceo-digest-$(date +%Y-%m-%d).md` 에 저장
2. Discord #jarvis-ceo 에 요약 전송 (500자 이내)
