# 봇 자체 평가 항목 체계 v1.0
> 작성: 2026-03-02 | 업데이트 주기: 매주 월요일 (weekly-kpi 태스크 연동)

## 평가 항목 (8개 축)

### 1. 크론 신뢰성 (Reliability)
- **측정**: task-runner.jsonl 태스크별 success/error 집계
- **기준**: 성공률 90%+ ✅ | 70-90% ⚠️ | 70% 미만 ❌
- **측정 도구**: `~/claude-discord-bridge/scripts/measure-kpi.sh --days 7`
- **현재**: 크론 성공률 84% ⚠️ (타임아웃 이슈 수정 완료, 개선 중)

### 2. 자비스 컴퍼니 팀 구조 완성도 (Team Coverage)
- **측정**: tasks.json 중 company team cron 수 / 목표 7
- **기준**: 7/7 ✅ | 5-6/7 ⚠️ | 4이하 ❌
- **현재**: 7/7 ✅ (council/academy/record/brand/infra + career + weekly-kpi)

### 3. Discord 라우팅 정확성 (Routing)
- **측정**: monitoring.json webhooks 등록 채널 수 / 필요 채널 수
- **기준**: 5채널+ ✅ | 3-4 ⚠️ | 2이하 ❌
- **현재**: 5채널 ✅ (bot/system/market/blog/ceo)

### 4. RAG 커버리지 (Memory)
- **측정**: rag-index.log 최신 total chunks 수
- **기준**: 2,000+ ✅ | 1,000-2,000 ⚠️ | 1,000 미만 ❌
- **현재**: 1,933 ⚠️ (성장 중, 매시간 증분)

### 5. Company DNA SSoT 준수 (Governance)
- **측정**: ~/claude-discord-bridge/config/company-dna.md 최신화 여부 (최근 업데이트 날짜 확인)
- **기준**: 일치 ✅ | 불일치 ❌
- **현재**: ✅ (2026-03-02 동기화 완료)

### 6. 자비스 페르소나 품질 (Persona)
- **측정**: Discord에서 "자기소개 해봐" 응답이 ChatGPT식 친절봇 패턴 없는지
- **기준**: 영국식 위트 + 금지표현 없음 ✅ | 친절봇 패턴 감지 ❌
- **현재**: ✅ (채널별 페르소나 주입 완료)

### 7. 봇 완성도 (Completion Rate)
- **측정**: ROADMAP.md 완성도 수치
- **기준**: 90%+ ✅ | 70-90% ⚠️ | 70% 미만 ❌
- **현재**: 68% ⚠️ (목표 90%)

### 8. 비용 효율성 (Cost)
- **측정**: 월 예상 비용 (cost-monitor 태스크 결과)
- **기준**: $15 이하 ✅ | $15-25 ⚠️ | $25+ ❌
- **현재**: claude -p 기반, API 비용 없음 (Claude Max 정액제)

## 평가 실행 방법

```bash
# 즉시 평가
~/claude-discord-bridge/scripts/measure-kpi.sh --days 7

# Discord 전송
~/claude-discord-bridge/scripts/measure-kpi.sh --days 7 --discord

# 개별 태스크 수동 실행 및 검증
/bin/bash ~/claude-discord-bridge/bin/bot-cron.sh council-insight
```

## 평가 스케줄
- 일일: council-insight (23:00) — 크론 신뢰성 자동 감시
- 주간: weekly-kpi (월 08:30) — 전체 KPI 집계 + Discord 보고
- 월간: monthly-review (매월 1일 09:00) — 장기 트렌드 분석
