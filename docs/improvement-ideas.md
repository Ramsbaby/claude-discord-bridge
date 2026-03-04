# Claude Discord Bridge — Improvement Ideas (Research-Based)

> Research date: 2026-03-02
> Sources: Web search, GitHub project analysis, official documentation

---

## 1. Urgent (Bug Fixes / Stability)

### 1-1. Discord.js WebSocket Silent Death Prevention

**Problem**: Discord.js bot silently dies after a WebSocket disconnection when no error handler is registered. Repeatedly reported in GitHub Issues #1233, #607, #8486, #4096.

**Solution**:
```javascript
// 1) Always register an error event handler (without one, the process terminates)
client.on('error', (err) => {
  log.error('Discord client error', err);
});

// 2) Monitor shardDisconnect / shardReconnecting events
client.on('shardDisconnect', (event, shardId) => {
  log.warn(`Shard ${shardId} disconnected: ${event.code}`);
  alertDiscord(`Shard ${shardId} disconnected`);
});

// 3) Detect heartbeat ACK failures
client.on('shardError', (error, shardId) => {
  log.error(`Shard ${shardId} error`, error);
});

// 4) Periodic self-ping (every 30 seconds)
setInterval(() => {
  if (!client.ws.shards.first()?.ping || client.ws.shards.first().ping < 0) {
    log.warn('WebSocket ping failed, forcing reconnect');
    client.destroy();
    client.login(token);
  }
}, 30_000);
```

- Implementation difficulty: 1/5
- Expected impact: 5/5 (silent death = complete bot downtime)
- References: https://github.com/discordjs/discord.js/issues/8486, https://github.com/discordjs/discord.js/issues/1233

### 1-2. Unhandled Promise Rejection Prevention

**Problem**: Uncaught rejections kill the Node.js process (default behavior since Node 15+).

**Solution**:
```javascript
process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection:', reason);
  // alertDiscord but don't crash
});

process.on('uncaughtException', (error) => {
  log.error('Uncaught Exception:', error);
  // graceful shutdown + process manager restart
  process.exit(1);
});
```

- Implementation difficulty: 1/5
- Expected impact: 4/5
- References: https://www.reddit.com/r/node/comments/e7wigd/

### 1-3. claude -p Zombie Process Cleanup

**Problem**: claude -p subprocesses may leave orphan child processes after timeout.

**Solution**: Process group kill (`kill -- -$PGID`) + watchdog auto-cleanup of claude processes older than 5 minutes.

- Implementation difficulty: 2/5
- Expected impact: 3/5
- References: ARCHITECTURE.md existing watchdog design

---

## 2. High-Impact Improvements

### 2-1. Claude Agent SDK (TypeScript) Migration

**Current**: `claude -p` CLI subprocess (bash)
**Improved**: `@anthropic-ai/claude-agent-sdk` (v0.2.63) TypeScript SDK

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const result = query({
  prompt: "Analyze market trends",
  options: {
    includePartialMessages: true,   // streaming
    permissionMode: 'bypassPermissions',
    allowedTools: ['Read', 'WebSearch'],
    maxBudget: 0.50,
  }
});

for await (const msg of result) {
  if (msg.type === 'stream_event') {
    // Real-time Discord delivery
    await updateDiscordMessage(msg.event.delta.text);
  } else if (msg.type === 'result') {
    console.log('Cost:', msg.total_cost_usd);
  }
}
```

**Advantages**:
- Eliminates subprocess hang/zombie issues
- Native streaming (no stream-json parsing needed)
- Type safety + error handling
- Single runtime integration with Discord bot (Node.js)
- Register MCP servers directly from code (`createSdkMcpServer`)
- Built-in cost tracking via `total_cost_usd` field

**Note**: `claude -p` npm installation has a deprecation notice. SDK migration is essential long-term.

- Implementation difficulty: 3/5 (ask-claude.sh + retry-wrapper.sh + semaphore.sh -> ask-claude.ts)
- Expected impact: 5/5
- References: https://platform.claude.com/docs/en/agent-sdk/typescript, https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk

### 2-2. Discord Slash Commands + Buttons + Modals

**Current**: Plain message-based interaction
**Improved**: Official Discord Application Commands

```
/ask <question>       - Ask Claude a question (autocomplete suggests recent queries)
/task list            - List cron tasks + status
/task run <id>        - Manually trigger a task
/status               - System status dashboard (Embed)
/search <query>       - RAG search (already implemented, convert to slash command)
/remember <content>   - Save to long-term memory
/forget <keyword>     - Delete from memory
/cost                 - Daily/monthly API cost summary
/alert <on|off>       - Toggle push notifications
```

**Button usage**:
- "Show more" button on long responses
- "Re-run" / "Skip" buttons on task results
- "Detailed analysis" button on morning briefings

**Autocomplete**:
- `/ask` input suggests recent questions/task names
- `/task run` input suggests task IDs from tasks.json

- Implementation difficulty: 3/5
- Expected impact: 4/5 (major UX improvement, less typing)
- References: https://discordjs.guide/slash-commands/autocomplete, https://discordjs.guide/legacy/interactions/modals

### 2-3. Response Streaming UX Improvement

**Current**: Wait for claude -p to finish, then send all at once
**Improved**: Real-time streaming + progressive updates

```
1. Receive user message
2. Start typing indicator
3. Send "Thinking..." embed message
4. Parse stream-json line by line -> update message every 500 chars (edit)
5. On completion, replace with final message + add reaction
```

**Discord API limitation**: Message edit rate limit = 5/5s. Update every 500 chars or every 3 seconds.

- Implementation difficulty: 2/5
- Expected impact: 4/5 (perceived response time drastically improved)
- References: https://github.com/ebibibi/claude-code-discord-bridge (stream-json pattern)

### 2-4. LanceDB Hybrid Search + Cross-Encoder Reranking

**Current**: Vector + FTS + RRF (basic)
**Improved**: Add cross-encoder reranker (2-stage retrieval)

```
Stage 1: Existing hybrid search -> top 20 candidates
Stage 2: Cross-encoder (cross-encoder/ms-marco-MiniLM-L-6-v2) -> top 5 final
```

**LanceDB built-in rerankers**:
```python
# LanceDB includes LinearCombinationReranker, CrossEncoderReranker, etc.
reranker = CrossEncoderReranker()
results = tbl.search("query", query_type="hybrid").reranker(reranker).limit(5)
```

**Effect**: 10-15% improvement in top-5 precision (50-100ms additional latency)

- Implementation difficulty: 2/5 (LanceDB built-in feature)
- Expected impact: 3/5
- References: https://blog.lancedb.com/hybrid-search-and-reranking-report/, https://ragaboutit.com/beyond-basic-rag-building-query-aware-hybrid-retrieval-systems-that-scale/

### 2-5. Metadata Filtered Search

**Current**: Search across entire corpus
**Improved**: Tag/category/date filters

```javascript
// LanceDB SQL-like filter
table.search("market trend analysis", { queryType: "hybrid" })
  .where("tags LIKE '%stock%' AND modified_at > '2026-02-01'")
  .limit(5)
```

**Usage**: Add filter conditions to ragQueries in each cron task. Example: morning-standup searches only the last 7 days.

- Implementation difficulty: 2/5
- Expected impact: 3/5
- References: https://langwatch.ai/docs/cookbooks/vector-vs-hybrid-search

---

## 3. Differentiating Features

### 3-1. Multi-Session Parallel Processing (Agent Farm Pattern)

**Current**: mkdir semaphore limits to max 2 concurrent executions
**Improved**: Task queue + worker pool (3-4 workers)

```
┌─────────────────────────────────┐
│  Priority Queue (file-based)    │
│  P0: critical (morning-standup) │
│  P1: daily (stock-monitor)     │
│  P2: optional (log-cleanup)    │
└─────────┬───────────────────────┘
          │
   ┌──────┴──────┐
   │  Dispatcher │  (checks rate-tracker before dispatch)
   └──┬───┬───┬──┘
      │   │   │
   ┌──▼┐ ┌▼──┐ ┌▼──┐
   │W1 │ │W2 │ │W3 │  (each runs claude -p or SDK query)
   └───┘ └───┘ └───┘
```

On a server with 16GB RAM: 3 workers safe (~400MB each).

- Implementation difficulty: 4/5
- Expected impact: 4/5 (3x throughput during cron peak times)
- References: https://github.com/wshobson/agents (112-agent orchestration)

### 3-2. Adaptive Context Engineering

**Current**: Fixed 6000-char history + fixed system prompt
**Improved**: Dynamic context allocation based on task complexity

```
Simple tasks (alerts, monitoring):
  -> System prompt 500 chars + history 0 = ~1K tokens

Medium tasks (analysis, reports):
  -> System prompt 2000 chars + RAG 3000 chars + history 3000 chars = ~5K tokens

Complex tasks (executive reports, strategy analysis):
  -> System prompt 3000 chars + RAG 5000 chars + history 6000 chars = ~10K tokens
```

Add a `contextBudget` field to tasks.json:
```json
{ "contextBudget": "simple" | "medium" | "complex" }
```

- Implementation difficulty: 2/5
- Expected impact: 3/5 (token savings + faster responses)
- References: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

### 3-3. Session Handoff Automation (Context Rot Prevention)

**Current**: Hard cut to new session after 20 turns
**Improved**: Gradual context compression + handoff

```
Turn 1-15: Normal conversation
Turn 15: Auto-generate summary -> save to handoff.md
Turn 20: Start new session, inject handoff.md into system prompt
-> Seamless conversation experience for the user
```

**Context Rot Detection**:
- Response quality indicators: sudden drop in response length, repetitive patterns, increased "I'm not sure" frequency
- Auto-rotate trigger at 60-65% context utilization

- Implementation difficulty: 3/5
- Expected impact: 4/5 (maintains quality in long conversations)
- References: https://www.getmaxim.ai/articles/context-window-management-strategies-for-long-context-ai-agents-and-chatbots/

### 3-4. Discord Dashboard Embed (Rich Presence)

**Current**: Text-based status reports
**Improved**: Discord Embed-based real-time dashboard

```javascript
const embed = new EmbedBuilder()
  .setTitle(`${process.env.BOT_NAME || 'Bot'} System Status`)
  .setColor(allHealthy ? 0x00ff00 : 0xff0000)
  .addFields(
    { name: 'Discord Bot', value: 'Online (45ms)', inline: true },
    { name: 'Cron Tasks', value: '18/19 OK', inline: true },
    { name: 'Rate Limit', value: '23% (207/900)', inline: true },
    { name: 'Memory', value: '1.2GB / 16GB', inline: true },
    { name: 'Last Cron', value: 'news-briefing (2m ago)', inline: true },
    { name: 'RAG Index', value: '847 chunks', inline: true },
  )
  .setTimestamp();
```

Auto-updates every 5 minutes (via message edit).

- Implementation difficulty: 2/5
- Expected impact: 3/5 (quick system overview from mobile device)
- References: https://github.com/thcapp/claude-discord-bridge (Session Dashboard)

### 3-5. Multi-Machine Agent Hub (Remote Control)

**Current**: Running on a single server
**Improvement**: Multi-machine agent using Discord as a hub

```
Laptop ----┐
           ├── Discord (hub) ── AI Bot ── claude -p (Server)
Phone -----┘

Phone: /task run morning-standup
-> Discord -> Server executes -> Results sent via Discord + push notification
```

The architecture is already Discord-centric, so additional implementation is minimal.

- Implementation difficulty: 1/5 (mostly already implemented)
- Expected impact: 3/5
- References: https://www.reddit.com/r/ClaudeAI/comments/1rght73/ (multi-machine agent hub)

### 3-6. Custom MCP Tools (Agent SDK Integration)

**Current**: MCP disabled for claude -p (token savings)
**Improved**: Provide only lightweight custom tools via Agent SDK's `createSdkMcpServer`

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

// Use in cron tasks
const result = query({
  prompt: "Analyze market trends",
  options: { mcpServers: { 'bot-tools': mcpServer } }
});
```

**Advantage**: No need to load 8+ MCP servers — only the tools you need (minimal token overhead).

- Implementation difficulty: 3/5
- Expected impact: 4/5 (Claude can directly query data sources)
- References: https://docs.claude.com/en/api/agent-sdk/typescript

---

## 4. Long-term Roadmap

### 4-1. Lightweight GraphRAG (Obsidian Wikilink-Based)

**Timeline**: Phase 2 (already planned in ARCHITECTURE.md)

```
Parse Obsidian [[wikilinks]] -> build document relationship graph
Include 1-hop neighbor documents of search results as candidates
-> Searching "market analysis" auto-expands to [[investment-strategy]], [[portfolio]]
```

- Implementation difficulty: 3/5
- Expected impact: 4/5
- References: https://github.com/Vasallo94/ObsidianRAG

### 4-2. RAG Golden Set Auto-Evaluation

**Timeline**: Phase 2

```
golden_set.json:
[
  { "query": "What is the stop-loss threshold?", "expected_doc": "company-dna.md", "expected_answer_contains": "DNA-C001" },
  { "query": "Morning standup time", "expected_doc": "tasks.json", "expected_answer_contains": "08:00" }
]

Run weekly -> compute precision@5 -> Discord alert if below threshold
```

- Implementation difficulty: 2/5
- Expected impact: 3/5 (prevents RAG silent rot)
- References: ARCHITECTURE.md sections 7-8

### 4-3. Voice Input (Whisper + Discord Voice Channel)

**Timeline**: Phase 3

```
Join Discord Voice Channel
-> Receive audio stream via @discordjs/voice
-> STT via Whisper API (or local whisper.cpp)
-> Process via claude -p
-> TTS response (Piper or ElevenLabs) -> voice reply
```

Can reuse existing voice pipeline components.

- Implementation difficulty: 5/5
- Expected impact: 3/5 (high convenience but potentially low usage frequency)

### 4-4. ask-claude.sh -> Full TypeScript Integration

**Timeline**: Day 5+ (ARCHITECTURE.md roadmap)

```
Before: discord-bot.js -> spawn('bash', ['ask-claude.sh', ...])
After:  discord-bot.ts -> import { query } from '@anthropic-ai/claude-agent-sdk'

Unified files:
  ask-claude.ts (query wrapper + retry + semaphore + error classification)
  discord-bot.ts (Discord.js + slash commands + streaming)
  cron-runner.ts (tasks.json loader + scheduler)
  rag-engine.mts (LanceDB hybrid search)
```

**Effect**: Eliminates bash dependency, single runtime, type safety, easier debugging.

- Implementation difficulty: 4/5
- Expected impact: 4/5
- References: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk

### 4-5. Proactive Notifications (Event-Driven Alerts)

**Timeline**: Phase 2-3

```
Current: Cron runs at fixed times -> sends results (passive)
Improved: Event-driven proactive alerts

Trigger examples:
- Stock moves 5%+ -> immediate Discord alert (instead of 15-min cron)
- New GitHub issue on repo -> auto-classify + Discord alert
- Cron failure rate exceeds 50% -> urgent Discord alert + push notification
- Calendar event in 30 min -> reminder notification
```

Use `chokidar` or WebSocket-based event monitoring -> call ask-claude when conditions are met.

- Implementation difficulty: 3/5
- Expected impact: 4/5
- References: https://fleeceai.app/blog/automate-discord-with-ai-agents-2026

### 4-6. Observability Dashboard (Web UI)

**Timeline**: Phase 3

```
Current: Terminal dashboard (requires SSH access)
Improved: Simple Express + SSE web dashboard

Display items:
- Cron execution history (success/failure/cost)
- rate-tracker.json real-time graph
- RAG search log (query -> results -> latency)
- Discord bot uptime
- System resources (integrate with monitoring API)
```

Bot-specific metrics only — complement existing system monitoring tools.

- Implementation difficulty: 4/5
- Expected impact: 2/5 (nice to have, but Discord + terminal is sufficient)

---

## Priority Matrix

| Rank | Idea | Difficulty | Impact | ROI |
|------|------|------------|--------|-----|
| 1 | 1-1. WebSocket Silent Death Prevention | 1 | 5 | **Highest** |
| 2 | 1-2. Unhandled Rejection Prevention | 1 | 4 | **Highest** |
| 3 | 2-3. Streaming UX Improvement | 2 | 4 | High |
| 4 | 2-2. Slash Commands + Buttons | 3 | 4 | High |
| 5 | 2-1. Agent SDK Migration | 3 | 5 | High |
| 6 | 3-3. Session Handoff Automation | 3 | 4 | High |
| 7 | 3-4. Discord Embed Dashboard | 2 | 3 | Medium |
| 8 | 2-4. Cross-Encoder Reranking | 2 | 3 | Medium |
| 9 | 2-5. Metadata Filtering | 2 | 3 | Medium |
| 10 | 3-6. Custom MCP Tools | 3 | 4 | Medium |
| 11 | 3-1. Multi-Session Parallel Processing | 4 | 4 | Medium |
| 12 | 3-2. Adaptive Context | 2 | 3 | Medium |
| 13 | 4-1. GraphRAG | 3 | 4 | Long-term |
| 14 | 4-5. Proactive Notifications | 3 | 4 | Long-term |
| 15 | 4-4. Full TypeScript Integration | 4 | 4 | Long-term |
| 16 | 4-2. Golden Set Auto-Evaluation | 2 | 3 | Long-term |
| 17 | 4-3. Voice Input | 5 | 3 | Long-term |
| 18 | 4-6. Web Dashboard | 4 | 2 | Low |

## Recommended for Immediate Action (This Session)

1. **WebSocket Silent Death Prevention** (1-1) — 10 min, maximizes stability
2. **Unhandled Rejection Prevention** (1-2) — 5 min, prevents crashes
3. **Streaming UX** (2-3) — 30 min, improves perceived performance

## Recommended for Next Sprint

4. **Slash Commands** (2-2) — 2 hours, UX overhaul
5. **Agent SDK Migration** (2-1) — 4 hours, architectural improvement
6. **Session Handoff** (3-3) — 2 hours, long conversation quality

---

*Generated by researcher agent, 2026-03-02*
