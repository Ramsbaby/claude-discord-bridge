# 🔍 자비스 정보탐험 미션 — {{DATE}}

## Phase 1: 정찰 (Scout)
아래 영역에서 최신 업데이트를 웹 검색으로 수집하세요.

### 1-1. Anthropic/Claude 공식 업데이트
- `site:docs.anthropic.com` 또는 `site:anthropic.com/news` 최근 변경사항
- Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) npm 최신 버전 및 릴리즈 노트
- Claude Code 최신 버전 및 신규 기능
- Claude Max/API 가격/한도 변경

### 1-2. 경쟁사 벤치마킹
- **OpenAI** — GPT 모델 업데이트, Assistants API, Codex 변경
- **Cursor/Windsurf/Cline** — AI 코딩 도구 신규 기능 (자비스에 적용 가능한 것)
- **Discord 봇 생태계** — 다른 AI Discord 봇의 혁신적 기능

### 1-3. 커뮤니티 인사이트
- **Claude Hub** (`hub.claude.ai`) — 인기 프롬프트, 유용한 패턴
- **GitHub Trending** — MCP 서버, Claude 관련 오픈소스
- **Reddit r/ClaudeAI** — 사용자 팁, 워크플로우

## Phase 2: 분석 (Analyst)
수집된 정보를 현재 Jarvis 시스템과 대조 분석하세요.

### 분석 항목
1. 현재 Jarvis의 `package.json`에서 SDK 버전 확인 → 최신 버전과 비교
2. `claude-runner.js`의 Agent SDK 사용 패턴 → 새 API가 있으면 개선점 파악
3. `tasks.json` + 크론 시스템 → 자동화 확장 가능 영역
4. `teams/` 구조 → 새로운 팀/에이전트 추가 가능성
5. 현재 알려진 문제점 (로그 확인) → 해결 가능한 것

## Phase 3: 설계 (Architect)
구체적인 업그레이드 제안서를 작성하세요.

### 출력 형식

```markdown
# 🚀 Jarvis 업그레이드 리포트 — {{DATE}}

## 📡 AI 업계 동향 요약
(주요 변경사항 3~5개)

## 🎯 Quick Win (즉시 적용 가능)
1. [제목] — 설명, 예상 효과, 구현 코드 스니펫
2. ...

## 📋 Medium-term (1주 이내)
1. [제목] — 설명, 필요 작업, 리스크
2. ...

## 🔮 Long-term (설계 필요)
1. [제목] — 비전, 아키텍처 변경 필요
2. ...

## 🏆 벤치마킹 하이라이트
(경쟁사에서 훔쳐올 만한 기능 TOP 3)

## ⚠️ 주의사항
(안정성 리스크, 비용 영향 등)
```

## 지침
- 각 Phase를 순서대로 실행하세요
- Agent 도구를 활용하여 scout/analyst/architect를 병렬 실행하세요
- 보고서는 `{{BOT_HOME}}/rag/teams/reports/recon-{{DATE}}.md`에 저장하세요
- 추측이 아닌 실제 검색 결과 기반으로 작성하세요
- 오너가 바로 "이거 해줘"라고 지시할 수 있도록 구체적으로 작성하세요
