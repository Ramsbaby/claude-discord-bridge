/**
 * Jarvis Company Agent Runner
 * @anthropic-ai/claude-agent-sdk 기반 자비스 컴퍼니 팀장 에이전트
 *
 * Usage: node company-agent.mjs --team <name>
 * Teams: council | infra | record | brand | career | academy | trend | standup
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  readFileSync, writeFileSync, mkdirSync,
  existsSync, appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// Allow running from within Claude Code (nested session guard bypass)
delete process.env.CLAUDECODE;

const BOT_HOME = process.env.BOT_HOME || join(homedir(), '.jarvis');
const LOG_DIR  = join(BOT_HOME, 'logs');
const REPORTS  = join(BOT_HOME, 'rag', 'teams', 'reports');
const CTX_BUS  = join(BOT_HOME, 'state', 'context-bus.md');

mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(REPORTS, { recursive: true });
mkdirSync(join(BOT_HOME, 'state'), { recursive: true });

// --team argument
const teamArg = (() => {
  const idx = process.argv.indexOf('--team');
  if (idx !== -1) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith('--team='));
  return eq?.split('=')[1] ?? null;
})();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return {}; }
}

const monitoring = loadJSON(join(BOT_HOME, 'config', 'monitoring.json'));
const mcpCfg     = loadJSON(join(BOT_HOME, 'config', 'discord-mcp.json'));
const MCP        = mcpCfg.mcpServers ?? {};

const NOW  = new Date();
const KST  = new Date(NOW.getTime() + 9 * 3600_000);
const DATE = KST.toISOString().slice(0, 10);
const WEEK = (() => {
  const d = new Date(KST);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear();
  const w = Math.ceil((((d - new Date(Date.UTC(y, 0, 1))) / 86400_000) + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
})();

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function log(level, msg) {
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${teamArg ?? '?'}] ${msg}`;
  console.log(line);
  appendFileSync(
    join(LOG_DIR, 'company-agent.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), level, team: teamArg, msg }) + '\n',
  );
}

async function sendWebhook(channelKey, content) {
  const url = monitoring.webhooks?.[channelKey];
  if (!url || !content) return;
  // Discord 2000자 제한으로 청킹
  for (let i = 0; i < content.length; i += 1990) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.slice(i, i + 1990) }),
      });
      if (i + 1990 < content.length) await new Promise((r) => setTimeout(r, 500));
    } catch (e) { log('warn', `webhook(${channelKey}) failed: ${e.message}`); }
  }
}

function readContextBus() {
  try { return readFileSync(CTX_BUS, 'utf-8'); } catch { return ''; }
}

function updateContextBus(report) {
  const header = `# 자비스 컴퍼니 Context Bus\n_업데이트: ${KST.toISOString().slice(0, 16)} KST_\n\n`;
  writeFileSync(CTX_BUS, header + report, 'utf-8');
}

// task-runner.jsonl 호환 로깅 (measure-kpi.sh가 읽음)
function logTaskResult(taskId, status, ms) {
  appendFileSync(
    join(LOG_DIR, 'task-runner.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), taskId, status, durationMs: ms }) + '\n',
  );
}

// ---------------------------------------------------------------------------
// Shared tool sets
// ---------------------------------------------------------------------------

const NEXUS_TOOLS = [
  'mcp__nexus__exec', 'mcp__nexus__scan', 'mcp__nexus__cache_exec',
  'mcp__nexus__log_tail', 'mcp__nexus__health', 'mcp__nexus__file_peek',
];

// ---------------------------------------------------------------------------
// Team Definitions
// ---------------------------------------------------------------------------

const TEAMS = {

  // ── Council (감사팀) — 오케스트레이터 ────────────────────────────────────
  council: {
    name: '감사팀 (Council)',
    taskId: 'council-insight',
    discord: 'jarvis-ceo',
    report: join(REPORTS, `council-${DATE}.md`),
    maxTurns: 40,
    tools: ['Read', 'Write', 'Glob', 'Agent', ...NEXUS_TOOLS],
    // 하위 분석 에이전트 (진짜 Agent Teams)
    agents: {
      'kpi-analyst': {
        description: `팀 보고서를 읽고 KPI 수치와 트렌드를 계산한다. 오늘(${DATE}) 생성된 모든 팀 보고서를 분석하여 각 팀의 상태(🟢/🟡/🔴), 주요 이슈, 권고 액션을 추출한다.`,
        prompt: `${REPORTS}/ 디렉토리에서 ${DATE}로 시작하는 모든 .md 파일을 읽어라.
각 팀별로 다음을 추출하여 요약하라:
- 팀 이름
- 전체 상태 (🟢/🟡/🔴)
- 발견된 이슈 (없으면 "이상 없음")
- 권고 액션 (없으면 생략)

마지막에 전체 합산: 🟢 N팀 / 🟡 N팀 / 🔴 N팀`,
        tools: ['Read', 'Glob'],
      },
      'log-analyst': {
        description: `시스템 로그 파일을 직접 읽어 오류, 반복 실패, 성능 이상을 탐지한다.`,
        prompt: `다음 로그 파일을 Read 도구로 직접 읽고 분석하라:

1. ${join(LOG_DIR, 'discord-bot.err.log')} — bot 오류 로그 (최근 50줄)
2. ${join(LOG_DIR, 'task-runner.jsonl')} — 오늘(${DATE}) FAILED 항목 집계
3. ${join(LOG_DIR, 'bot-watchdog.log')} — 재시작 기록 (최근 20줄)

각 파일이 없으면 건너뛰어라.
반복 오류, 연속 실패, ERROR/CRITICAL 패턴을 찾아 간결하게 보고하라.
이상 없으면 "로그 이상 없음" 한 줄만.`,
        tools: ['Read', 'Glob'],
      },
    },
    system: `당신은 자비스 컴퍼니의 감사팀장(Council)입니다.
CEO 정우님을 위해 전사 현황을 파악하고 일일 경영 점검을 수행합니다.
임원 보고서 스타일: 수치 우선, 간결하게. 테이블 금지. 불릿 리스트 사용.`,
    prompt: `[자비스 컴퍼니 일일 경영 점검 — ${DATE}]

**Step 1: 시스템 상태** (mcp__nexus__health 1회)
- LaunchAgent, 디스크, 메모리 요약

**Step 2: 서브에이전트 분석 (반드시 Agent 도구 사용)**
- Agent 도구로 "kpi-analyst" 에이전트를 호출하라. 반환 결과를 4단계 팀별 현황에 반영.
- Agent 도구로 "log-analyst" 에이전트를 호출하라. 반환 결과를 주목 이슈에 반영.

**Step 3: 태스크 성공률 집계**
- ${join(LOG_DIR, 'task-runner.jsonl')}에서 오늘 SUCCESS/FAILED 개수 집계
- 전체 성공률 계산

**Step 4: 임원 보고서 작성 (아래 형식 그대로)**

## 자비스 컴퍼니 일일 점검 — ${DATE}
**전체 상태**: 🟢/🟡/🔴 (이유 1줄)

**팀별 현황**
- ⚙️ 인프라팀: [상태] [핵심 수치]
- 🗄️ 기록팀: [상태]
- 📡 정보팀: [상태]
- 🚀 성장팀: [상태]
- 📚 학습팀: [상태]
- 📣 브랜드팀: [상태]

**태스크 성공률**: N% (성공 N / 실패 N)

**주목 이슈** (있을 때만)
- ...

**오너 액션 포인트** (필요할 때만)
- ...

**Step 5: context-bus 업데이트**
- 위 보고서를 ${CTX_BUS}에 저장 (Write 도구 사용)`,
  },

  // ── Infra (인프라팀) ──────────────────────────────────────────────────────
  infra: {
    name: '인프라팀 (Infra)',
    taskId: 'infra-daily',
    discord: 'jarvis-system',
    report: join(REPORTS, `infra-${DATE}.md`),
    maxTurns: 20,
    tools: ['Write', ...NEXUS_TOOLS],
    system: `당신은 자비스 컴퍼니의 인프라팀장입니다.
시스템 안정성 담당. 수치 우선, 간결하게 보고합니다.
이상 발견 시 즉각 명확하게 표시합니다.`,
    prompt: `[인프라팀 일일 점검 — ${DATE}]

mcp__nexus__scan으로 다음을 한 번에 확인하라:
1. LaunchAgent 상태: launchctl list | grep ai.jarvis
2. 디스크: df -h /
3. 메모리: vm_stat | head -5
4. 크론 실패: grep -c "FAILED" ${join(LOG_DIR, 'task-runner.jsonl')} 또는 0
5. Bot 오류: Discord bot 로그 최근 오류

보고서 형식:
## ⚙️ 인프라팀 일일 점검 — ${DATE}
**전체 상태**: 🟢/🟡/🔴

- LaunchAgent discord-bot: 실행 중/중단 (PID: N)
- LaunchAgent watchdog: 실행 중/중단 (PID: N)
- 디스크: XGB / YGB (Z%)
- 메모리: 여유 N%
- 크론 실패: N건
- Bot 오류: N건

(이슈 있을 경우 **⚠️ 이슈** 섹션 추가)`,
  },

  // ── Record (기록팀) ───────────────────────────────────────────────────────
  record: {
    name: '기록팀 (Record)',
    taskId: 'record-daily',
    discord: null, // 내부 전용
    report: join(REPORTS, `record-${DATE}.md`),
    maxTurns: 20,
    tools: ['Read', 'Write', 'Glob', 'mcp__nexus__file_peek', 'mcp__nexus__exec'],
    system: `당신은 자비스 컴퍼니의 기록팀장입니다.
일일 마감 및 히스토리 기록 담당. 빠짐없이 정확하게.`,
    prompt: `[기록팀 일일 마감 — ${DATE}]

1. **오늘 보고서 목록**
   ${REPORTS}/ 에서 ${DATE}로 시작하는 파일 목록 확인 (Glob)

2. **완료 태스크 집계**
   ${join(LOG_DIR, 'task-runner.jsonl')}에서 오늘 SUCCESS 태스크 목록

3. **주요 내용 요약**
   각 팀 보고서 핵심 1-2줄씩 읽기

4. **memory.md 업데이트**
   ${join(BOT_HOME, 'rag', 'memory.md')}에 다음 항목 추가:
   \`\`\`
   ## ${DATE}
   - 완료: [태스크 목록]
   - 이슈: [있으면 기록]
   \`\`\`

5. **일일 마감 보고서 저장**
   ${join(REPORTS, `record-${DATE}.md`)}에 저장`,
  },

  // ── Brand (브랜드팀) ──────────────────────────────────────────────────────
  brand: {
    name: '브랜드팀 (Brand)',
    taskId: 'brand-weekly',
    discord: 'jarvis-blog',
    report: join(REPORTS, `brand-${WEEK}.md`),
    maxTurns: 20,
    tools: ['Write', 'WebSearch', 'mcp__nexus__exec'],
    system: `당신은 자비스 컴퍼니의 브랜드팀장입니다.
오픈소스 성장, GitHub, 기술 블로그 담당.
구체적인 액션 아이템 2-3개를 항상 제시합니다.`,
    prompt: `[브랜드팀 주간 보고 — ${WEEK}]

1. **GitHub 활동** (mcp__nexus__exec)
   cd ${BOT_HOME} && git log --oneline --since="7 days ago" 2>/dev/null | head -10

2. **오픈소스 현황** (WebSearch)
   - "jarvis discord claude bot open source" 검색
   - 관련 언급, 포크, 스타 동향

3. **다음 주 액션 아이템** (구체적 2-3개)
   - 정우님 경험(IoT, 비동기, 성능 최적화, Spring Boot) 기반 블로그 주제
   - GitHub 개선 포인트 (README, 문서화 등)

## 📣 브랜드팀 주간 보고 — ${WEEK}
**GitHub**: 커밋 N건, 주요 변경
**오픈소스**: 현황 요약
**다음 주 액션**:
- ...`,
  },

  // ── Career (성장팀) ───────────────────────────────────────────────────────
  career: {
    name: '성장팀 (Career)',
    taskId: 'career-weekly',
    discord: 'jarvis-ceo',
    report: join(REPORTS, `career-${WEEK}.md`),
    maxTurns: 25,
    tools: ['Read', 'Write', 'WebSearch', 'Glob'],
    system: `당신은 자비스 컴퍼니의 성장팀장입니다.
정우님의 이직 준비와 커리어 성장을 담당합니다.
현실적이고 구체적인 정보만. 공허한 격려 금지.`,
    prompt: `[성장팀 주간 커리어 리포트 — ${WEEK}]

1. **이직 시장 현황** (WebSearch 2회)
   - "백엔드 개발자 채용 시장 2026" 또는 "Java Spring Boot 시니어 채용"
   - "한국 IT 연봉 2026 백엔드"

2. **TQQQ 연계 분석** (DNA-C001, WebSearch)
   - TQQQ 현재가 + 주간 변동률
   - 이직 타이밍 신호: 🟢 긍정 / 🟡 중립 / 🔴 부정 + 근거 1줄

3. **지난주 진행률 확인**
   - ${REPORTS}/career-*.md 최신 파일 읽기 (Glob 후 최신 것 Read)

4. **이번 주 액션 아이템** (3가지, 오늘 날짜 기준 실행 가능한 것)

## 🚀 성장팀 주간 리포트 — ${WEEK}
**시장**: [이직 시장 2-3줄]
**TQQQ 이직 신호**: 🟢/🟡/🔴 $XX.XX — [이유]
**이번 주 액션**:
- (1) ...
- (2) ...
- (3) ...`,
  },

  // ── Academy (학습팀) ──────────────────────────────────────────────────────
  academy: {
    name: '학습팀 (Academy)',
    taskId: 'academy-support',
    discord: 'jarvis-ceo',
    report: join(REPORTS, `academy-${DATE}.md`),
    maxTurns: 20,
    tools: ['Read', 'Write', 'WebSearch', 'Glob'],
    system: `당신은 자비스 컴퍼니의 학습팀장입니다.
정우님의 커리어 목표와 학습 계획 담당.
달성 가능한 목표를 제시합니다. 막연한 조언 금지.`,
    prompt: `[학습팀 주간 보고 — ${DATE}]

1. **성장팀 리포트 참조**
   ${REPORTS}/career-*.md 최신 파일 읽기 → 이직 준비 관련 학습 포인트 파악

2. **다음 주 학습 목표** (3가지, 시간 배분 포함)
   - 기술 심화 (Spring Boot/Java/gRPC/AWS 중 우선순위)
   - 면접 준비 (알고리즘 or 시스템 설계)
   - 영어 (비즈니스/기술 영어)

3. **추천 학습 자료** (WebSearch — 최신 고품질 1개)
   - 공식 문서, 실전 튜토리얼, 유튜브 강의 등

## 📚 학습팀 주간 보고 — ${DATE}
**이번 주 학습 목표**:
- (기술) ...
- (면접) ...
- (영어) ...
**추천 자료**: [제목](URL) — 1줄 소개`,
  },

  // ── Trend (정보팀) ────────────────────────────────────────────────────────
  trend: {
    name: '정보팀 (Trend)',
    taskId: 'news-briefing',
    discord: 'jarvis',
    report: join(REPORTS, `trend-${DATE}.md`),
    maxTurns: 15,
    tools: ['Write', 'WebSearch'],
    system: `당신은 자비스 컴퍼니의 정보팀장입니다.
AI/기술 트렌드와 시장 뉴스 담당.
팩트 우선. 의견/예측은 "분석:" 레이블로 팩트와 분리.`,
    prompt: `[정보팀 일일 브리핑 — ${DATE}]

WebSearch로 확인하라 (총 3회):
1. "AI LLM news today" — 오늘 주요 AI 뉴스
2. "tech startup news ${DATE.slice(0, 7)}" — 기술/스타트업 동향
3. "TQQQ NVDA stock today" — 기술주 오늘 현황

## 📡 정보팀 일일 브리핑 — ${DATE}
**AI/Tech 주요 뉴스**
- [뉴스1 제목]: 한 줄 요약
- [뉴스2 제목]: 한 줄 요약

**기술 트렌드**
- 정우님 관심사(백엔드, Java, 비동기) 연관 트렌드 1-2개

**시장 동향**
- TQQQ: $XX.XX (X.X%) | NVDA: $XX.XX (X.X%)`,
  },

  // ── Standup (모닝 스탠드업) ───────────────────────────────────────────────
  standup: {
    name: '모닝 스탠드업',
    taskId: 'morning-standup',
    discord: 'jarvis',
    report: null, // 파일 저장 없음
    maxTurns: 15,
    tools: ['Read', 'WebSearch', ...NEXUS_TOOLS],
    system: `당신은 자비스의 모닝 스탠드업 담당입니다.
정우님의 하루를 잘 시작하도록 간결하고 실용적인 브리핑을 제공합니다.
3-5분 안에 읽을 수 있는 분량. 불필요한 인사말 금지.`,
    prompt: `[모닝 스탠드업 — ${DATE}]

다음을 빠르게 수집하라:
1. **어제 팀 현황** — ${CTX_BUS} 읽기 (context-bus, 핵심만)
2. **시스템 상태** — mcp__nexus__health() 1회
3. **오늘 뉴스** — WebSearch: "AI tech news ${DATE}" (1개만)
4. **TQQQ** — WebSearch: "TQQQ stock price now" (현재가만)

형식:
## ☀️ 굿모닝, 정우님 — ${DATE}
**자비스 컴퍼니** 어제: [한 줄 요약]
**시스템**: 🟢 정상 / ⚠️ [이슈명]
**뉴스**: [제목] — [한 줄]
**TQQQ**: $XX.XX (X.X%)`,
  },
};

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function runTeam(name) {
  const team = TEAMS[name];
  if (!team) {
    console.error(`Unknown team: "${name}". Available: ${Object.keys(TEAMS).join(', ')}`);
    process.exit(1);
  }

  log('info', `Starting ${team.name}`);
  const t0 = Date.now();

  const opts = {
    cwd: BOT_HOME,
    pathToClaudeCodeExecutable: process.env.CLAUDE_BINARY || '/Users/ramsbaby/.local/bin/claude',
    allowedTools: team.tools,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    mcpServers: MCP,
    maxTurns: team.maxTurns,
    model: 'claude-sonnet-4-6',
    systemPrompt: team.system,
  };
  if (team.agents) opts.agents = team.agents;

  let result = '';
  let isError = false;

  try {
    for await (const msg of query({ prompt: team.prompt, options: opts })) {
      if ('result' in msg) result = msg.result ?? '';
    }
  } catch (err) {
    log('error', `SDK error: ${err.message}`);
    result = `[오류] ${team.name} 실행 실패: ${err.message}`;
    isError = true;
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  log('info', `Completed in ${elapsed}s — ${result.length} chars`);

  // task-runner.jsonl 호환 로그 (measure-kpi.sh 기존 호환)
  logTaskResult(team.taskId, isError ? 'FAILED' : 'SUCCESS', Date.now() - t0);

  // 보고서 파일 저장
  if (result && team.report) {
    try {
      writeFileSync(team.report, result, 'utf-8');
      log('info', `Report saved: ${team.report}`);
    } catch (e) { log('warn', `Report save failed: ${e.message}`); }
  }

  // Discord 웹훅 전송
  if (result && team.discord) {
    await sendWebhook(team.discord, result);
    log('info', `Sent to #${team.discord}`);
  }

  // Council → context-bus 업데이트
  if (name === 'council' && result && !isError) {
    updateContextBus(result);
    log('info', 'context-bus updated');
  }

  return { result, isError, elapsed };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

if (!teamArg) {
  console.error(`Usage: node company-agent.mjs --team <name>`);
  console.error(`Available: ${Object.keys(TEAMS).join(' | ')}`);
  process.exit(1);
}

runTeam(teamArg).then(({ isError }) => {
  process.exit(isError ? 1 : 0);
}).catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
