# RAG Health Check

## 목적
매일 새벽 03:00에 RAG 인덱싱 시스템 무결성을 점검한다.

## 점검 항목
1. **인덱싱 상태**: 최근 3회 rag-index.log — 에러 없고 chunk 수 유지/증가 확인
2. **LanceDB 크기**: 비정상적 증가 (>500MB) 또는 감소 감지
3. **추적 파일 수**: index-state.json 엔트리가 0이면 이상

## 정상 기준
- 로그에 "Error" 없음
- chunk 수 전날 대비 감소 없음
- LanceDB 디렉토리 존재

## 출력 규칙
- 정상: `RAG: 정상 (XXXX chunks, XXX sources)`
- 경고: `⚠️ RAG: [문제 내용]`

## 주의사항
- L1 태스크 — 결과는 파일만. 이상 시 다음날 weekly-kpi에서 집계됨
- rag-index.mjs는 매시 정각 실행 중 (cron `0 * * * *`)
