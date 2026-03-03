# 결정 로그

주요 아키텍처 결정 및 합의 사항.

| 날짜 | 결정 | 이유 |
|------|------|------|
| 2026-02-28 | Bot = claude -p 기반 | Claude Max $330 이미 지불, 추가비용 $0 |
| 2026-02-28 | Discord bot → claude -p bot 마이그레이션 | 토큰 비용 절감, 단일화 |
| 2026-03-01 | RAG = 파일 기반 (LanceDB Phase 2) | 초기 단순성 우선 |
| 2026-03-01 | RAG = LanceDB 하이브리드 검색 적용 | Vector + BM25, 시맨틱 검색으로 컨텍스트 품질 향상 |
| 2026-03-01 | Discord auto-thread + ntfy 연동 | 대화 격리, Galaxy 푸시 알림 |
