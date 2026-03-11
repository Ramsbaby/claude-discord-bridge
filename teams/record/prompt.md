[기록팀 일일 마감 — {{DATE}}]

1. **오늘 보고서 목록**
   {{REPORTS}}/ 에서 {{DATE}}로 시작하는 파일 목록 확인 (Glob)

2. **완료 태스크 집계**
   {{LOG_DIR}}/task-runner.jsonl에서 오늘 SUCCESS 태스크 목록

3. **주요 내용 요약**
   각 팀 보고서 핵심 1-2줄씩 읽기

4. **memory.md 업데이트**
   {{BOT_HOME}}/rag/memory.md에 다음 항목 추가:
   ```
   ## {{DATE}}
   - 완료: [태스크 목록]
   - 이슈: [있으면 기록]
   ```

5. **일일 마감 보고서 저장**
   {{REPORTS}}/record-{{DATE}}.md에 저장
