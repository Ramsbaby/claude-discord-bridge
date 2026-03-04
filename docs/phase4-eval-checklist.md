# Phase 4 평가 체크리스트
작성: 2026-03-03 | 평가 기준: 긍정편향 없이, 실제 실행 가능성 기준

---

## 대상 에이전트

### ab-engineer
- ask-claude.sh: task 결과 SQLite 전송
- prompt-ab-analyzer.sh: A/B 실험 분석 스크립트
- A/B variant scaffold: 프롬프트 변형 구조

### dynamic-scheduler-engineer
- NYSE 휴일 감지
- TQQQ 가드 (고변동성 날 실행 억제)
- Discord presence 기반 standup 지연

---

## 평가 항목 (긍정편향 제거 기준)

### 1. 구문 검증 (Pass/Fail)
- [ ] bash -n ask-claude.sh → 0
- [ ] bash -n prompt-ab-analyzer.sh → 0
- [ ] bash -n NYSE 휴일 감지 스크립트 → 0
- [ ] node --check (JS 파일 있을 경우)

### 2. 의존성 실존 여부 (Pass/Fail - 흔한 실패 포인트)
- [ ] SQLite 실제로 설치됨? (`which sqlite3`)
- [ ] messages.db 경로 실제 존재?
- [ ] mq-cli.sh 참조 시 해당 파일 존재?
- [ ] NYSE API/데이터소스 실제 접근 가능?
- [ ] Discord presence API 권한 있음?

### 3. 환경 변수 / 경로 하드코딩 체크 (흔한 버그)
- [ ] `$BOT_HOME` 사용 vs 하드코딩 경로
- [ ] macOS vs Linux 명령어 호환 (`date -v` vs `date -d`)
- [ ] `python3` vs `python` 명령어
- [ ] jq 설치 여부

### 4. 에러 핸들링 (중요)
- [ ] SQLite 쓰기 실패 시 ask-claude.sh가 전체 abort 하지 않는지?
- [ ] NYSE API 타임아웃 시 fallback 있는지?
- [ ] TQQQ guard 실패해도 기본 스케줄 유지되는지?

### 5. 크론 통합 가능성
- [ ] tasks.json에 신규 태스크 추가됐는지?
- [ ] 기존 morning-standup 스케줄과 충돌 없는지?
- [ ] crontab 변경 필요한지?

### 6. 실제 실행 테스트 (smoke test)
- [ ] prompt-ab-analyzer.sh --help 또는 dry-run 실행
- [ ] NYSE 휴일 체크 스크립트 오늘 날짜 기준 실행
- [ ] TQQQ guard 로직 mock 데이터로 검증

### 7. 설계 리스크 (냉정하게)
- [ ] SQLite 동시성: 여러 크론이 동시에 write할 때 lock 이슈?
- [ ] A/B 실험 샘플 크기: 의미있는 결론 내기 충분한 데이터 쌓이는 주기?
- [ ] Discord presence 의존: 오너가 오프라인이면 standup 무한 지연?
- [ ] NYSE API 비용/한도 확인

---

## 결과 기록
평가 일시: (완료 후 기재)
총점: /7개 항목
P0 이슈:
P1 이슈:
권고 액션:
