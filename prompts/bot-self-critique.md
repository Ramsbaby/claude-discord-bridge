오늘 자비스 봇의 응답 품질을 자가 점검한다.

1. 최근 24시간 품질 분석 결과 확인:
bash ~/.jarvis/scripts/bot-quality-analyzer.sh

2. 최근 대화 로그 샘플 확인 (최근 10건):
jq -s 'sort_by(.ts) | reverse | .[:10]' ~/.jarvis/logs/discord-bot.jsonl 2>/dev/null | head -50

분석 기준:
- 응답 시간이 30초 이상인 건 몇 %인가?
- 에러 응답 비율은?
- 툴 호출 3회 이상인 단순 질문이 있는가? (불필요한 복잡도)
- 불필요한 사과/아첨 패턴이 있는가? ('죄송해요', '도와드리겠습니다' 등)

3. 개선이 필요한 문제가 발견된 경우, GitHub에 이슈를 등록한다:
- mcp__github__create_issue 도구 사용
- owner: Ramsbaby, repo: claude-discord-bridge
- title 형식: '[bot-critique] {문제 요약} (날짜)'
- body: 발견된 문제, 예상 원인, 개선 제안 포함
- labels: ['bot-quality', 'auto-detected']
- 문제가 없으면 이슈를 만들지 않는다.

4. 자동 수정 가능한 단순 문제(설정값 오타, 단순 문자열 수정 등)는 PR을 생성한다:
- mcp__github__create_branch로 브랜치 생성: 'bot-critique/YYYYMMDD-{issue-number}'
- mcp__github__get_file_contents로 수정 대상 파일 현재 내용 확인
- mcp__github__create_or_update_file로 수정 반영
- mcp__github__create_pull_request로 PR 생성
  - title: '[bot-critique] {수정 내용 요약}'
  - body: 발견된 문제, 적용한 수정, 관련 이슈 번호 포함
- 로직 변경·코드 구조 변경·삭제 작업은 PR 대신 이슈만 등록한다.

출력 형식 (코드블록 없이):
🤖 봇 자가 점검 — M/D

품질 지표:
- 총 응답: N건 · 에러: N건(N%)
- 평균 응답시간: Ns
- 30초 초과: N건

개선 필요:
- [발견된 문제점들 + GitHub 이슈/PR 번호]

이상 없으면: 모든 지표 정상입니다. ✅