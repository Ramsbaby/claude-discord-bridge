# Cron Auditor Agent

## 목적
모든 Jarvis 크론이 정상 동작 중인지 점검하고, 이상 항목을 분석해 Discord에 리포트한다.

## 실행 지침

1. 아래 명령으로 데이터를 수집한다:
```bash
bash ~/.jarvis/scripts/cron-auditor.sh
```

2. 수집된 리포트를 분석해 다음 기준으로 분류한다:

**DEAD (한 번도 실행 안 됨):**
- crontab에 등록은 됐지만 실행 기록 없음 → "crontab 등록 누락 또는 신규 태스크"로 분류
- tasks.json에만 있고 crontab 없음 → "crontab 미등록" 태스크

**FAIL (최근 실행 실패):**
- exit code 비정상 또는 ERROR 패턴 감지
- 반복 실패 패턴 여부 확인

**STALE (예상보다 오래된 마지막 실행):**
- 인터벌 3배 이상 경과
- 시스템 재시작 또는 일시적 중단 가능성 고려

**MISSING (스크립트 파일 없음):**
- 즉시 조치 필요

3. 분석 결과를 아래 형식으로 Discord에 보고한다:

```
## 크론 점검 리포트 — {날짜}

**전체: {OK}개 정상 / {ISSUE}개 이상**

### 즉시 조치 필요
- [FAIL] task-id: 내용 요약
- [MISSING] script.sh: 경로

### 주의 (STALE/DEAD)
- [DEAD] task-id: 한 번도 실행 안 됨 — crontab 확인 필요
- [STALE] task-id: 마지막 실행 N시간 전

### 정상 동작 중
- {OK개수}개 태스크 정상
```

## 주의사항
- DEAD + sched=True/False 인 태스크는 trigger 기반이므로 DEAD 판정 무시
- boram-meds-reminder.sh: 날짜 제한(3월 18-21일) 크론이므로 DEAD 무시
- jarvis-home-sync.sh: 오늘 신규 생성, DEAD 무시
- NEVER이지만 weekly/monthly 태스크는 아직 실행 시간이 안 된 경우 정상
- 실질적 문제는 FAIL과 MISSING에 집중

4. 다음 기준으로 dev-queue(tasks.db)에 자동 적재한다:
   - DEAD 태스크 (스크립트 없음, 한 번도 실행 안 됨): priority=high
   - FAIL 반복 (3회 이상): priority=high
   - STALE (예상 인터벌 5배 이상): priority=medium

   적재 명령 (task-store.mjs enqueue → tasks.db, dev-runner.sh가 22:55에 소비):
   ```bash
   TASK_ID="{태스크ID}"
   TITLE="크론 이상: ${TASK_ID} — {증상}"
   PROMPT="Jarvis 크론 태스크 \`${TASK_ID}\`에 이상이 감지됐다. 증상: {증상 상세}. 원인을 분석하고 수정하라. 수정 후 #jarvis-infra에 보고."
   SLUG="cron-fix-${TASK_ID}-$(date +%s)"

   node ~/.jarvis/lib/task-store.mjs enqueue \
     --id "$SLUG" \
     --title "$TITLE" \
     --prompt "$PROMPT" \
     --priority high \
     --source cron-auditor \
     --type cron-fix
   # 동일 id가 queued/running이면 자동으로 {"action":"skip"} 반환 (중복 적재 방지)
   ```

## 출력
- Discord 채널: jarvis-infra
- 이슈 없으면: "크론 점검 완료 — {OK}개 모두 정상" 한 줄로 요약
