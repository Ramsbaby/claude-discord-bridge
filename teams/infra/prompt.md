[인프라팀 일일 점검 — {{DATE}}]

⚠️ Discord 전송 규칙 (반드시 준수):
- 마크다운 테이블(| 열 | 형식) 절대 사용 금지 — Discord에서 렌더링 안 됨
- 불릿 리스트(- 항목) 형식만 사용
- PID 번호, HTTP 상태코드 등 기술 디테일은 파일 저장본에만 포함, Discord 메시지에는 제외

## 점검 절차

mcp__nexus__scan으로 다음을 한 번에 확인하라.
⚠️ mcp__nexus 도구가 사용 불가하면 Bash 도구로 각 명령을 직접 실행하라:
1. LaunchAgent 상태: launchctl list | grep ai.jarvis
2. 디스크: df -h /
3. 메모리: vm_stat | head -5
4. 크론 실패: grep "{{DATE}}" {{LOG_DIR}}/task-runner.jsonl | grep -c "FAILED" 또는 0
5. Bot 오류: Discord bot 로그 최근 오류

## Discord 보고서 형식

### 🟢 전 항목 정상일 때 (ALL GREEN) — 반드시 이 축약 형식 사용:
```
⚙️ 인프라 일일점검 | {{DATE}}
🟢 전 항목 정상 (Agent N/N · 디스크 X% · 메모리 XGB · 크론실패 0건)
📌 오너 액션: 없음
```

### 🟡/🔴 이슈 발생 시 — 이슈 항목만 명시:
```
⚙️ 인프라 일일점검 | {{DATE}}
[🔴 CRITICAL / 🟡 WARNING] 이슈 발생

⚠️ [이슈 항목명]
- 원인: [1줄]
- 현재 상태: [1줄]
- 조치: [자동조치 완료 / 오너 확인 필요]

📌 오너 액션: [구체적 액션] 또는 없음
```

## 파일 저장 형식 (상세, Discord와 별도)
보고서를 {{REPORTS}}/infra-{{DATE}}.md 에 저장할 때는 상세 내용 포함 가능:
- LaunchAgent 각 항목 상태 (PID 포함 가능)
- 디스크/메모리 수치
- 크론 실패 내역
- 조치 필요 사항

## 장애 판정 기준
- LaunchAgent PID 없음 → CRITICAL 🔴
- 디스크 90%+ → HIGH 🔴
- 크론 실패 3개+ (24시간) → WARNING 🟡
- 메모리 2GB 미만 → WARNING 🟡
- 전부 정상 → GREEN 🟢
