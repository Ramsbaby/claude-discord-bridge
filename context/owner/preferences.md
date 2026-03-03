# 정우님 시스템 선호도

> Jarvis가 도구/서비스 선택 시 참고해야 할 환경 설정.

## 캘린더
- **Kakao Calendar API** 사용 필수 (Google Calendar 금지)
- POST https://kapi.kakao.com/v2/api/calendar/create/event
- 환경변수: `KAKAO_ACCESS_TOKEN`, `KAKAO_REFRESH_TOKEN`, `KAKAO_CLIENT_SECRET`

## 할일 & 리마인더
- **Google Tasks 사용 필수** (Galaxy 폰과 동기화)
- `gog tasks` 명령어 사용
- ❌ Apple Reminders: 사용 안 함 (Galaxy 폰 비호환)
- 기본 목록 ID: `MDE3MjE5NzU0MjA3NTAxOTg4ODc6MDow`

## 기기 환경
- MacBook + Mac Mini + Galaxy 폰
- Galaxy 폰 → Google Tasks, Kakao Calendar 동기화 필수
- Apple 서비스 단독 사용 시 Galaxy 폰에서 접근 불가

## 언어 설정
- **한국어 필수** (Korean REQUIRED)
- 기술 응답, 크론 리포트 모두 한국어로

## 알림 채널
- **Discord 메인:** #jarvis (일상/범용)
- **ntfy 푸시:** Galaxy 폰 ntfy 앱 구독
- **Discord 채널별 역할:**
  - #jarvis-market: 주식/시장 분석
  - #jarvis-dev: 코딩/기술 디버깅
  - #jarvis-lite: 빠른 질문/계산
  - #jarvis-blog: 블로그/글쓰기
  - #jarvis-ceo: 팀 경영보고
  - #jarvis-family: 가족/보람님
  - #jarvis-preply-tutor: 보람님 한국어 수업
  - #jarvis-personal: 개인 전용

## 실시간 주식 API
- **Finnhub:** REST + WebSocket (무료 실시간)
- **Yahoo Finance:** 15분 지연 (백업)
- TQQQ 15분 모니터링 크론 운영 중
