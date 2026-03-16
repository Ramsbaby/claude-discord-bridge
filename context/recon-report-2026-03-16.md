# 정찰 보고서 — 2026-03-16

생성일시: 2026-03-16
정찰 에이전트: Recon Scout (claude-sonnet-4-6)

---

## 1-A. Anthropic / Claude

### Q1. anthropic claude API changelog March 2026
**상태: 성공**
- Claude Sonnet 4.6 출시 — 속도·지능 균형 모델, 1M 토큰 컨텍스트(베타), Extended Thinking 지원
- Claude Haiku 3 (claude-3-haiku-20240307) 2026-04-19 퇴역 예정 → Haiku 4.5로 마이그레이션 권고
- API 코드 실행이 웹 서치·웹 패치 함께 사용 시 무료
- 데이터 레지던시 컨트롤 추가 (inference_geo 파라미터, US-only 1.1x 요금)
- structured outputs GA, output_format → output_config.format 변경
- Fine-grained tool streaming GA on all models

### Q2. @anthropic-ai/claude-agent-sdk npm 최신 버전
**상태: 성공**
- Claude Code SDK가 Claude Agent SDK로 리브랜딩
- 마이그레이션 가이드 제공 (breaking changes 포함)
- 패키지 URL: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- 자율 에이전트 구축 가능: 코드베이스 이해, 파일 편집, 명령 실행, 복잡한 워크플로우

### Q3. anthropic new model release 2026
**상태: 성공**
- Claude Opus 4.6 (2026-02-05): 에이전트 팀 기능, Claude in PowerPoint, 14.5시간 태스크 완료 지평선
- Claude Sonnet 4.6 (2026-02-17): Sonnet 4.5와 동일 가격, 코딩·컴퓨터 사용 강화, 현재 기본 모델
- Claude 5 (코드명 "Fennec") 유출 — Google Vertex AI 로그에서 발견, 2026년 2-3월 출시 예상, Opus 4.6 초월 코딩 성능, "Dev Team" 멀티에이전트 모드, 현 플래그십 대비 50% 저렴한 가격 예상

### Q4. anthropic claude code CLI update March 2026
**상태: 성공**
- 버전 2.1.63 → 2.1.76 범위 업데이트
- Push-to-talk 음성 모드, /loop 명령(반복 실행), 1M 토큰 컨텍스트
- -n / --name 플래그로 세션 표시 이름 설정
- worktree.sparsePaths로 대형 모노레포 체크아웃 최적화
- /effort 슬래시 명령 (모델 노력 수준 설정)
- MCP Elicitation 지원 — MCP 서버가 태스크 중간에 구조화 입력 요청 가능
- 버그 수정: 제3자 게이트웨이 사용 시 API 400 오류, CJK/이모지 클립보드 손상

---

## 1-B. 경쟁사

### Q5. openai new features update March 2026
**상태: 성공**
- GPT-5.1 계열 ChatGPT에서 제거 (2026-03-11): GPT-5.3 Instant, GPT-5.4 Thinking/Pro로 전환
- 인터랙티브 시각 학습 (70개 이상 수학·과학 주제 수식·그래프 실시간 실험)
- Google·Microsoft 앱 ChatGPT 연동 → 이메일 작성, 문서·스프레드시트 생성, 미팅 예약 write action 지원
- Analytics Viewer 신규 사용자 유형 추가
- OpenAI Compliance Logs Platform 출시 (Audit/Auth/Codex 로그, 분 단위 레이턴시)
- Codex 앱 Windows 버전 출시 (PowerShell 샌드박스, Skills/Automations/Worktrees 지원)

### Q6. cursor AI update March 2026 new features
**상태: 성공**
- Cloud Agents/Automations (2026-03-05): 스케줄·이벤트 트리거 기반 상시 에이전트, Slack/Linear/GitHub/PagerDuty/웹훅 연동
- JetBrains IDE 통합 (2026-03-04): IntelliJ/PyCharm/WebStorm에서 Agent Client Protocol(ACP)로 사용
- 30+ 신규 플러그인 (Atlassian, Datadog, GitLab, Glean, Hugging Face, monday.com, PlanetScale)
- 버전 2.6 MCP Apps: Amplitude 차트, Figma 다이어그램, tldraw 화이트보드를 에이전트 채팅 내 렌더링

### Q7. windsurf AI IDE features 2026
**상태: 성공**
- Cascade 에이전트: 멀티파일 추론, 레포지토리 수준 이해, 멀티스텝 태스크 실행, 터미널 자율 실행(Turbo Mode)
- 영속 지식 레이어 (코딩 스타일·패턴·API 학습)
- Arena Mode: 두 Cascade 에이전트 블라인드 대결로 최적 모델 선택
- 2026-03 기준 지원 모델: Gemini 3.1 Pro, Claude Sonnet 4.6, GLM-5, Minimax M2.5, GPT-5.4
- JetBrains IDE 네이티브 통합 (IntelliJ, PyCharm, WebStorm)

### Q8. cline AI agent github update March 2026
**상태: 성공**
- 최신 버전: v3.72.0 (2026-03-12 배포)
- Cline SDK API 인터페이스 추가 — 프로그래매틱 Cline 기능 통합 가능
- Claude 3.7+ 모델의 maxTokens 값 업데이트 (Anthropic/Bedrock/Vertex/SAP AI Core)
- 전 세계 개발자 500만명 이상 사용
- "Clinejection" 공급망 공격 사례 (Snyk 보고) — 프롬프트 인젝션·GitHub Actions 취약점

### Q9. AI personal assistant discord bot open source 2026
**상태: 성공**
- OpenClaw (구 Clawdbot): GitHub 최속 성장 중, 68,000+ stars, "Moltbot"으로 리네임 (Anthropic 유사 명칭 우려)
- 100개 이상 AgentSkills: 쉘 명령, 파일 시스템, 웹 자동화
- WhatsApp/Telegram/Slack/Discord/Signal/iMessage/Teams 연동
- 로컬 모델 지원, 자체 API 키 사용 가능
- npm install -g moltbot@latest (Node.js 22+ 필요)

---

## 1-C. 오픈소스 벤치마킹

### Q10. github anthropic claude agent bot open source stars 2026
**상태: 성공**
- everything-claude-code: 50K+ stars, 6K+ forks — Cerebral Valley x Anthropic 해커톤(2026-02) 산출물
- 지능형 자동화·멀티에이전트 오케스트레이션: 30.8K stars
- awesome-claude-code (hesreallyhim): 27.2K stars — 스킬/훅/슬래시 커맨드/에이전트 오케스트레이터 큐레이션
- Claude Code GUI 툴킷: 20.8K stars
- 에이전트 오케스트레이션 플랫폼: 20.2K stars
- 공식 anthropics/claude-agent-sdk-demos 저장소 운영 중

### Q11. github trending AI assistant automation March 2026
**상태: 성공**
- OpenClaw: 60일 내 9,000 → 188,000 stars (역대 최속 성장)
- Ollama: 162,000 stars 돌파
- Dify: 130,000 stars (TypeScript, 프로덕션 에이전틱 워크플로우 플랫폼)
- Lightpanda: AI/자동화용 헤드리스 브라우저 (2026-03-15 GitHub Trending)
- ByteDance DeerFlow 2.0: 오픈소스 SuperAgent 하네스 (샌드박스/메모리/툴/서브에이전트)
- 트렌드 방향: 에이전트 + 로컬 인터페이스 (프라이버시 중시)

### Q12. github jarvis AI discord personal assistant
**상태: 성공**
- YeLwinOo-Steve/jarvis-discord-bot: Dart + Express JS, Meta LLAMA 2 70B, Vercel 호스팅
- Kxvin1/jarvis: 단순 Discord 봇, Geolocation/Weather API 통합, Replit + Uptime Robot
- isair/jarvis: 완전 로컬 실행, MCP 서버 연동, 24/7, 코드 지원·건강 목표 관리·웹 검색
- manojsaharan01/jarvis-os: WhatsApp/Telegram/Slack/Discord 멀티채널 지원
- 주목할 점: 로컬+MCP 조합 패턴이 현 /jarvis 아키텍처와 유사

### Q13. awesome-claude-prompts github 2026
**상태: 성공**
- langgptai/awesome-claude-prompts: 4.2K stars, 413 forks (2026-01-23 업데이트)
- 개발자 전용 카테고리: 코드 리뷰·아키텍처 계획·기술 문서·디버깅·성능 최적화
- Piebald-AI/claude-code-system-prompts: Claude Code 전체 시스템 프롬프트 추출 (18개 빌트인 툴, Plan/Explore/Task 서브에이전트)
- rohitg00/awesome-claude-code-toolkit: 135 에이전트, 35 스킬, 42 커맨드, 120 플러그인, 19 훅, 15 룰

### Q14. MCP server awesome list github new March 2026
**상태: 성공**
- punkpeye/awesome-mcp-servers: 프로덕션 레디 + 실험적 MCP 서버 목록
- wong2/awesome-mcp-servers: 카테고리별 종합 큐레이션
- modelcontextprotocol/servers: 공식 MCP 레퍼런스 서버 (MCP steering group 관리)
- jaw9c/awesome-remote-mcp-servers: 원격 MCP 서버 특화 목록
- mcpmarket.com: 매일 GitHub 스타 기준 상위 MCP 서버 랭킹 (2026-03 기준 일일 업데이트)

---

## 1-D. 커뮤니티 인사이트

### Q15. reddit ClaudeAI best prompts workflow March 2026
**상태: 성공**
- 자기 비판 워크플로우: 질문→답변→문서 저장→새 세션→문서 비판→개선 (r/PromptEngineering)
- "이전 답변의 가장 약한 가정을 찾아서 개선해라" — 높은 효과
- 필수 4요소: Role + Context + Task + Constraints
- XML 태그 구조화 프롬프트가 비구조화 텍스트보다 높은 정확도
- Artifacts 기능: 라이브 인터랙티브 출력 (React 컴포넌트 실시간 렌더링)
- Perplexity로 실시간 리서치 후 Claude에서 분석하는 2단계 워크플로우 유행

### Q16. claude hub popular prompts automation 2026
**상태: 성공**
- Claude Hub: Skills/Agents/Commands/Hooks/Plugins/마켓플레이스 확장 통합 허브
- K-Dense Claude Scientific Skills: 리서치·과학·엔지니어링·분석·금융·작문용 에이전트 스킬
- Parry: Claude Code 훅용 프롬프트 인젝션 스캐너 (시크릿·데이터 유출 시도 탐지)
- 2026년 프롬프트 엔지니어링 최대 변화: "태스크 실행"에서 "성과 위임"으로 전환
- 시스템 프롬프트에 위임 권한 포함 → 반응형 → 능동형 협업자로 전환

### Q17. hacker news claude agent workflow tips 2026
**상태: 성공**
- 스펙 기반 개발: 최소 스펙 작성 → AskUserQuestionTool로 인터뷰 → 새 세션에서 실행
- 12단계 구현 문서 2시간 작성 → Claude가 단계별로 코드 작성 → 6-10시간 절감 사례
- 성공 기준 제시 (단계별 지침 X)
- 멀티에이전트 아키타입: System Architect + Code Reviewer 패턴 유용
- 에이전트 함정: 잘못된 가정, 명확화 요청 미흡, 1,000줄 비대 코드 → "눈을 떼지 말것"
- HN 주목 링크: Claude March 2026 usage promotion (ycombinator)

### Q18. claude system prompt best practices 2026
**상태: 성공**
- "계약 형식" 구조: Role(1줄) + 성공 기준(불릿) + 제약사항(불릿) + 불확실성 처리 규칙 + 출력 형식
- XML 태그 = 시맨틱 컨테이너 (포맷이 아닌 의미 분리)
- 프로덕션 팀은 안정화까지 평균 5-10회 반복
- CLAUDE.md 파일을 활용한 프롬프트 학습 최적화 (arize.com 사례)
- 공식 Anthropic 모범 사례: https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices

---

## 수집 품질 요약

| 항목 | 결과 |
|------|------|
| 성공 쿼리 수 | 18 / 18 |
| Rate Limit 발생 | 0건 |
| 수집 불가 항목 | 없음 |

### 핵심 발견 사항 (우선순위 순)

1. **Claude 5 (Fennec) 임박**: Google Vertex AI 로그에서 발견, 2026-03 출시 가능성. Opus 4.6 대비 코딩 성능 향상 + "Dev Team" 멀티에이전트 모드 + 50% 저렴한 가격.

2. **Claude Agent SDK**: Claude Code SDK에서 리브랜딩 완료. /jarvis가 현재 사용 중인 SDK의 공식 명칭 변경 — 의존성 업데이트 검토 필요.

3. **Claude Code CLI v2.1.76**: /loop, /effort, MCP Elicitation, 음성 모드 추가. /jarvis 자동화 루프에 /loop 명령 활용 가능.

4. **경쟁 구도**: Cursor 2.6 + JetBrains 통합, Cloud Agents/Automations로 공격적 확장. Windsurf는 Arena Mode + 다중 모델 지원. Cline v3.72.0 SDK API 추가로 프로그래매틱 통합 가능.

5. **오픈소스 트렌드**: OpenClaw(Moltbot)가 역대 최속 GitHub 성장(188K stars, 60일). Discord + 로컬 실행 + MCP 조합이 /jarvis와 유사 아키텍처.

6. **MCP 생태계 폭발적 성장**: mcpmarket.com 일일 랭킹, punkpeye/awesome-mcp-servers, jaw9c/awesome-remote-mcp-servers 등 전문 큐레이션 채널 다수 등장.

7. **프롬프트 엔지니어링 트렌드**: "태스크 실행"에서 "성과 위임"으로 패러다임 전환. 시스템 프롬프트에 위임 권한 포함이 핵심.
