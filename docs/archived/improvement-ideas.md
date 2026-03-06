# Claude Discord Bridge 개선 아이디어 (리서치 기반)

> 리서치 일자: 2026-03-02
> 소스: Brave Search 8회 검색, GitHub 프로젝트 분석, 공식 문서 참조

---

## 1. 긴급 (버그 수정 / 안정성)

### 1-1. Discord.js WebSocket Silent Death 방어

**문제**: Discord.js 봇이 WebSocket 연결 끊김 후 에러 핸들러 없이 조용히 죽는 현상. GitHub Issues #1233, #607, #8486, #4096에서 반복적으로 보고됨.

**해결책**:
```javascript
// 1) 반드시 error 이벤트 핸들러 등록 (없으면 프로세스 종료)
client.on('error', (err) => {
  log.error('Discord client error', err);
});

// 2) shardDisconnect / shardReconnecting 이벤트 감시
client.on('shardDisconnect', (event, shardId) => {
  log.warn(`Shard ${shardId} disconnected: ${event.code}`);
  alertDiscord(`Shard ${shardId} disconnected`);
});

// 3) heartbeat ACK 미응답 감지
client.on('shardError', (error, shardId) => {
  log.error(`Shard ${shardId} error`, error);
});

// 4) 주기적 self-ping (30초마다)
setInterval(() => {
  if (!client.ws.shards.first()?.ping || client.ws.shards.first().ping < 0) {
    log.warn('WebSocket ping failed, forcing reconnect');
    client.destroy();
    client.login(token);
  }
}, 30_000);
```

- 구현 난이도: 1/5
- 예상 임팩트: 5/5 (무음 사망 = 봇 완전 다운)
- 참고: https://github.com/discordjs/discord.js/issues/8486, https://github.com/discordjs/discord.js/issues/1233

### 1-2. Unhandled Promise Rejection 방어

**문제**: Node.js에서 uncaught rejection이 프로세스를 죽임 (Node 15+ 기본 동작).

**해결책**:
```javascript
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection:', reason);
  // alertDiscord but don't crash
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  // graceful shutdown + launchd restart
  process.exit(1);
});
```

- 구현 난이도: 1/5
- 예상 임팩트: 4/5
- 참고: https://www.reddit.com/r/node/comments/e7wigd/

### 1-3. claude -p 좀비 프로세스 적극 정리

**문제**: claude -p 서브프로세스가 timeout 후에도 자식 프로세스를 남기는 경우.

**해결책**: 프로세스 그룹 kill (`kill -- -$PGID`) + watchdog에서 5분 이상 된 claude 프로세스 자동 정리.

- 구현 난이도: 2/5
- 예상 임팩트: 3/5
- 참고: ARCHITECTURE.md 기존 watchdog 설계

---

## 2. 고임팩트 개선

### 2-1. Claude Agent SDK (TypeScript) 마이그레이션

**현재**: `claude -p` CLI 서브프로세스 (bash)
**개선**: `@anthropic-ai/claude-agent-sdk` (v0.2.63) TypeScript SDK

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const result = query({
  prompt: "시장 동향 분석해줘",
  options: {
    includePartialMessages: true,   // 스트리밍
    permissionMode: 'bypassPermissions',
    allowedTools: ['Read', 'WebSearch'],
    maxBudget: 0.50,
  }
});

for await (const msg of result) {
  if (msg.type === 'stream_event') {
    // 실시간 Discord 전송
    await updateDiscordMessage(msg.event.delta.text);
  } else if (msg.type === 'result') {
    console.log('Cost:', msg.total_cost_usd);
  }
}
```

**장점**:
- 서브프로세스 hang/좀비 문제 해소
- 네이티브 스트리밍 (stream-json 파싱 불필요)
- 타입 안전 + 에러 핸들링
- Discord 봇(Node.js)과 단일 런타임 통합
- MCP 서버를 코드에서 직접 등록 가능 (`createSdkMcpServer`)
- `total_cost_usd` 필드로 비용 추적 내장

**주의**: `claude -p`는 npm 설치 deprecation 예고. SDK 이전이 장기적으로 필수.

- 구현 난이도: 3/5 (ask-claude.sh + retry-wrapper.sh + semaphore.sh -> ask-claude.ts)
- 예상 임팩트: 5/5
- 참고: https://platform.claude.com/docs/en/agent-sdk/typescript, https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk

### 2-2. Discord Slash Commands + 버튼 + 모달

**현재**: 일반 메시지 기반 상호작용
**개선**: 정식 Discord Application Commands

```
/ask <질문>           - Claude에게 질문 (autocomplete로 최근 질문 제안)
/task list            - 크론 태스크 목록 + 상태
/task run <id>        - 수동 태스크 실행
/status               - 시스템 상태 대시보드 (Embed)
/search <쿼리>        - RAG 검색 (이미 구현됨, slash로 전환)
/remember <내용>      - 장기 기억 저장
/forget <키워드>      - 기억 삭제
/cost                 - 일일/월간 API 비용 요약
/alert <on|off>       - ntfy 알림 토글
```

**버튼 활용**:
- 긴 응답에 "더 보기" 버튼
- 태스크 결과에 "재실행" / "스킵" 버튼
- 모닝 브리핑에 "상세 분석" 버튼

**Autocomplete**:
- `/ask` 입력 시 최근 질문/태스크 이름 자동완성
- `/task run` 입력 시 tasks.json의 태스크 ID 자동완성

- 구현 난이도: 3/5
- 예상 임팩트: 4/5 (UX 대폭 개선, 타이핑 감소)
- 참고: https://discordjs.guide/slash-commands/autocomplete, https://discordjs.guide/legacy/interactions/modals

### 2-3. 응답 스트리밍 UX 개선

**현재**: claude -p 완료 후 한 번에 전송
**개선**: 실시간 스트리밍 + progressive update

```
1. 사용자 메시지 수신
2. typing indicator 시작
3. "생각 중..." 임베드 메시지 전송
4. stream-json 라인별 파싱 → 500자마다 메시지 업데이트 (edit)
5. 완료 시 최종 메시지로 교체 + 리액션 추가
```

**Discord API 제한**: 메시지 edit rate limit = 5/5초. 500자 또는 3초마다 업데이트.

- 구현 난이도: 2/5
- 예상 임팩트: 4/5 (체감 응답 속도 대폭 향상)
- 참고: https://github.com/ebibibi/claude-code-discord-bridge (stream-json 패턴)

### 2-4. LanceDB 하이브리드 검색 + 크로스 인코더 리랭킹

**현재**: Vector + FTS + RRF (기본)
**개선**: 크로스 인코더 리랭커 추가 (2단계 검색)

```
Stage 1: 기존 하이브리드 검색 → top 20 후보
Stage 2: 크로스 인코더 (cross-encoder/ms-marco-MiniLM-L-6-v2) → top 5 최종
```

**LanceDB 내장 리랭커 활용**:
```python
# LanceDB는 LinearCombinationReranker, CrossEncoderReranker 등 내장
reranker = CrossEncoderReranker()
results = tbl.search("query", query_type="hybrid").reranker(reranker).limit(5)
```

**효과**: top-5 precision 10-15% 향상 (50-100ms 추가 지연)

- 구현 난이도: 2/5 (LanceDB 내장 기능)
- 예상 임팩트: 3/5
- 참고: https://blog.lancedb.com/hybrid-search-and-reranking-report/, https://ragaboutit.com/beyond-basic-rag-building-query-aware-hybrid-retrieval-systems-that-scale/

### 2-5. Metadata 필터링 검색

**현재**: 전체 코퍼스 대상 검색
**개선**: 태그/카테고리/날짜 필터

```javascript
// LanceDB SQL-like 필터
table.search("시장 동향 분석", { queryType: "hybrid" })
  .where("tags LIKE '%stock%' AND modified_at > '2026-02-01'")
  .limit(5)
```

**활용**: 크론 태스크별 ragQueries에 필터 조건 추가. 예: morning-standup은 최근 7일만.

- 구현 난이도: 2/5
- 예상 임팩트: 3/5
- 참고: https://langwatch.ai/docs/cookbooks/vector-vs-hybrid-search

---

## 3. 차별화 기능

### 3-1. Multi-Session 병렬 처리 (Claude Agent Farm 패턴)

**현재**: mkdir 세마포어로 최대 2개 동시 실행
**개선**: 태스크 큐 + 워커 풀 (3-4개)

```
┌─────────────────────────────────┐
│  Priority Queue (file-based)    │
│  P0: critical (morning-standup) │
│  P1: daily (stock-monitor)     │
│  P2: optional (log-cleanup)    │
└─────────┬───────────────────────┘
          │
   ┌──────┴──────┐
   │  Dispatcher │  (rate-tracker 확인 후 디스패치)
   └──┬───┬───┬──┘
      │   │   │
   ┌──▼┐ ┌▼──┐ ┌▼──┐
   │W1 │ │W2 │ │W3 │  (각각 claude -p 또는 SDK query)
   └───┘ └───┘ └───┘
```

Mac Mini M2 16GB 기준 3개 워커 안전 (워커당 ~400MB).

- 구현 난이도: 4/5
- 예상 임팩트: 4/5 (크론 피크 시간 처리량 3배)
- 참고: https://github.com/wshobson/agents (112 에이전트 오케스트레이션)

### 3-2. Adaptive Context Engineering

**현재**: 고정 6000자 히스토리 + 고정 시스템 프롬프트
**개선**: 태스크 복잡도에 따른 동적 컨텍스트 조절

```
Simple 태스크 (알림, 모니터링):
  → 시스템 프롬프트 500자 + 히스토리 0 = ~1K 토큰

Medium 태스크 (분석, 리포트):
  → 시스템 프롬프트 2000자 + RAG 3000자 + 히스토리 3000자 = ~5K 토큰

Complex 태스크 (CEO 리포트, 전략 분석):
  → 시스템 프롬프트 3000자 + RAG 5000자 + 히스토리 6000자 = ~10K 토큰
```

tasks.json에 `contextBudget` 필드 추가:
```json
{ "contextBudget": "simple" | "medium" | "complex" }
```

- 구현 난이도: 2/5
- 예상 임팩트: 3/5 (토큰 절약 + 응답 속도 향상)
- 참고: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

### 3-3. Session Handoff 자동화 (Context Rot 방지)

**현재**: 20턴 초과 시 새 세션 (하드 컷)
**개선**: 점진적 컨텍스트 압축 + 인수인계

```
Turn 1-15: 정상 대화
Turn 15: 자동 요약 생성 → handoff.md 저장
Turn 20: 새 세션 시작, handoff.md를 시스템 프롬프트에 주입
→ 사용자에게는 끊김 없는 대화 경험
```

**Context Rot 감지** (vincentvandeth.nl):
- 응답 품질 지표: 응답 길이 급감, 반복 패턴, "I'm not sure" 빈도
- 60-65% 컨텍스트 사용 시 자동 rotate 트리거

- 구현 난이도: 3/5
- 예상 임팩트: 4/5 (긴 대화 품질 유지)
- 참고: https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/

### 3-4. Discord 대시보드 Embed (Rich Presence)

**현재**: 텍스트 기반 상태 리포트
**개선**: Discord Embed 기반 실시간 대시보드

```javascript
const embed = new EmbedBuilder()
  .setTitle(`${process.env.BOT_NAME || 'Bot'} System Status`)
  .setColor(allHealthy ? 0x00ff00 : 0xff0000)
  .addFields(
    { name: 'Discord Bot', value: '🟢 Online (45ms)', inline: true },
    { name: 'Cron Tasks', value: '18/19 OK', inline: true },
    { name: 'Rate Limit', value: '23% (207/900)', inline: true },
    { name: 'Memory', value: '1.2GB / 16GB', inline: true },
    { name: 'Last Cron', value: 'news-briefing (2m ago)', inline: true },
    { name: 'RAG Index', value: '847 chunks', inline: true },
  )
  .setTimestamp();
```

5분마다 자동 업데이트 (메시지 edit).

- 구현 난이도: 2/5
- 예상 임팩트: 3/5 (Galaxy에서 한눈에 시스템 파악)
- 참고: https://github.com/thcapp/claude-discord-bridge (Session Dashboard)

### 3-5. Multi-Machine Agent Hub (원격 제어)

**현재**: Mac Mini에서만 실행
**개선**: Discord를 허브로 사용한 다중 머신 에이전트

```
MacBook --┐
          ├── Discord (허브) ── AI Bot ── claude -p (Mac Mini)
Galaxy ---┘

Galaxy에서 /task run morning-standup
→ Discord → Mac Mini에서 실행 → 결과를 Discord + ntfy로 전송
```

이미 아키텍처가 Discord 중심이므로 추가 구현 최소.

- 구현 난이도: 1/5 (이미 대부분 구현됨)
- 예상 임팩트: 3/5
- 참고: https://www.reddit.com/r/ClaudeAI/comments/1rght73/ (multi-machine agent hub)

### 3-6. Custom MCP Tools (Agent SDK 통합)

**현재**: claude -p에 MCP 비활성화 (토큰 절약)
**개선**: Agent SDK의 `createSdkMcpServer`로 경량 커스텀 도구만 제공

```typescript
import { tool, createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const searchRAG = tool(
  'search_knowledge',
  'Search RAG knowledge base',
  { query: z.string(), topK: z.number().default(5) },
  async ({ query, topK }) => {
    const results = await ragEngine.search(query, topK);
    return { content: [{ type: 'text', text: JSON.stringify(results) }] };
  }
);

const getStockPrice = tool(
  'get_stock_price',
  'Get current stock price',
  { symbol: z.string() },
  async ({ symbol }) => {
    const price = await fetchYahooFinance(symbol);
    return { content: [{ type: 'text', text: `${symbol}: $${price}` }] };
  }
);

const mcpServer = createSdkMcpServer({
  name: 'bot-tools',
  tools: [searchRAG, getStockPrice]
});

// 크론 태스크에서 사용
const result = query({
  prompt: "시장 동향 분석해줘",
  options: { mcpServers: { 'bot-tools': mcpServer } }
});
```

**장점**: MCP 서버 8개 로딩 없이 필요한 도구만 (토큰 오버헤드 최소).

- 구현 난이도: 3/5
- 예상 임팩트: 4/5 (Claude가 직접 데이터 조회 가능)
- 참고: https://docs.claude.com/en/api/agent-sdk/typescript

---

## 4. 장기 로드맵

### 4-1. 경량 GraphRAG (Obsidian Wikilink 기반)

**타임라인**: Phase 2 (이미 ARCHITECTURE.md에 계획됨)

```
Obsidian [[wikilink]] 파싱 → 문서 관계 그래프
검색 결과 문서의 1-hop 이웃 문서도 후보에 포함
→ "시장 분석" 검색 시 [[투자전략]], [[포트폴리오]] 자동 확장
```

- 구현 난이도: 3/5
- 예상 임팩트: 4/5
- 참고: https://github.com/Vasallo94/ObsidianRAG

### 4-2. RAG 골든 셋 자동 평가

**타임라인**: Phase 2

```
golden_set.json:
[
  { "query": "손절선 기준은?", "expected_doc": "company-dna.md", "expected_answer_contains": "DNA-C001" },
  { "query": "모닝 스탠드업 시간", "expected_doc": "tasks.json", "expected_answer_contains": "08:00" }
]

주 1회 자동 실행 → precision@5 계산 → 임계값 이하 시 Discord 알림
```

- 구현 난이도: 2/5
- 예상 임팩트: 3/5 (RAG silent rot 방지)
- 참고: ARCHITECTURE.md 7-8절

### 4-3. Voice Input (Whisper + Discord Voice Channel)

**타임라인**: Phase 3

```
Discord Voice Channel 접속
→ @discordjs/voice로 오디오 스트림 수신
→ Whisper API (또는 로컬 whisper.cpp) STT
→ claude -p로 처리
→ TTS (Piper 또는 ElevenLabs) → 음성 응답
```

기존 음성 파이프라인 재활용 가능.

- 구현 난이도: 5/5
- 예상 임팩트: 3/5 (편의성은 높지만 사용 빈도 낮을 수 있음)
- 참고: 음성 어시스턴트 모듈

### 4-4. ask-claude.sh -> TypeScript 완전 통합

**타임라인**: Day 5+ (ARCHITECTURE.md 로드맵)

```
Before: discord-bot.js → spawn('bash', ['ask-claude.sh', ...])
After:  discord-bot.ts → import { query } from '@anthropic-ai/claude-agent-sdk'

통합 파일:
  ask-claude.ts (query wrapper + retry + semaphore + error classification)
  discord-bot.ts (Discord.js + slash commands + streaming)
  cron-runner.ts (tasks.json 로더 + 스케줄러)
  rag-engine.mts (LanceDB hybrid search)
```

**효과**: bash 의존성 제거, 단일 런타임, 타입 안전, 디버깅 용이.

- 구현 난이도: 4/5
- 예상 임팩트: 4/5
- 참고: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk

### 4-5. Proactive Notifications (능동형 알림)

**타임라인**: Phase 2-3

```
현재: 크론이 정해진 시간에 실행 → 결과 전송 (수동)
개선: 이벤트 기반 능동 알림

트리거 예시:
- 주요 종목 5% 이상 변동 → 즉시 Discord 알림 (15분 크론 대신)
- GitHub repo에 새 이슈 → 자동 분류 + Discord 알림
- 크론 실패율 50% 초과 → 긴급 Discord 알림 + ntfy
- 일정 30분 전 → Google Calendar 리마인더
```

`chokidar` 또는 WebSocket 기반 이벤트 감시 → 조건 충족 시 ask-claude.ts 호출.

- 구현 난이도: 3/5
- 예상 임팩트: 4/5
- 참고: https://fleeceai.app/blog/automate-discord-with-ai-agents-2026

### 4-6. Observability 대시보드 (웹 UI)

**타임라인**: Phase 3

```
현재: tmux 대시보드 (SSH 접속 필요)
개선: 간단한 Express + SSE 웹 대시보드

표시 항목:
- 크론 실행 히스토리 (성공/실패/비용)
- rate-tracker.json 실시간 그래프
- RAG 검색 로그 (query → results → latency)
- Discord 봇 uptime
- 시스템 리소스 (Glances API 연동)
```

이미 Glances 웹 대시보드(61208)가 있으므로 봇 전용 메트릭만 추가.

- 구현 난이도: 4/5
- 예상 임팩트: 2/5 (있으면 좋지만 Discord + tmux로 충분)
- 참고: ClaudeClaw 웹 대시보드 패턴

---

## 우선순위 매트릭스

| 순위 | 아이디어 | 난이도 | 임팩트 | ROI |
|------|----------|--------|--------|-----|
| 1 | 1-1. WebSocket Silent Death 방어 | 1 | 5 | **최고** |
| 2 | 1-2. Unhandled Rejection 방어 | 1 | 4 | **최고** |
| 3 | 2-3. 스트리밍 UX 개선 | 2 | 4 | 높음 |
| 4 | 2-2. Slash Commands + 버튼 | 3 | 4 | 높음 |
| 5 | 2-1. Agent SDK 마이그레이션 | 3 | 5 | 높음 |
| 6 | 3-3. Session Handoff 자동화 | 3 | 4 | 높음 |
| 7 | 3-4. Discord Embed 대시보드 | 2 | 3 | 중간 |
| 8 | 2-4. 크로스 인코더 리랭킹 | 2 | 3 | 중간 |
| 9 | 2-5. 메타데이터 필터링 | 2 | 3 | 중간 |
| 10 | 3-6. Custom MCP Tools | 3 | 4 | 중간 |
| 11 | 3-1. Multi-Session 병렬 처리 | 4 | 4 | 중간 |
| 12 | 3-2. Adaptive Context | 2 | 3 | 중간 |
| 13 | 4-1. GraphRAG | 3 | 4 | 장기 |
| 14 | 4-5. Proactive Notifications | 3 | 4 | 장기 |
| 15 | 4-4. TypeScript 완전 통합 | 4 | 4 | 장기 |
| 16 | 4-2. 골든 셋 자동 평가 | 2 | 3 | 장기 |
| 17 | 4-3. Voice Input | 5 | 3 | 장기 |
| 18 | 4-6. 웹 대시보드 | 4 | 2 | 낮음 |

## 즉시 실행 권장 (이번 세션)

1. **WebSocket Silent Death 방어** (1-1) - 10분 소요, 안정성 극대화
2. **Unhandled Rejection 방어** (1-2) - 5분 소요, 크래시 방지
3. **스트리밍 UX** (2-3) - 30분 소요, 체감 성능 향상

## 다음 스프린트 권장

4. **Slash Commands** (2-2) - 2시간 소요, UX 혁신
5. **Agent SDK 마이그레이션** (2-1) - 4시간 소요, 아키텍처 개선
6. **Session Handoff** (3-3) - 2시간 소요, 긴 대화 품질

---

*Generated by researcher agent, 2026-03-02*
