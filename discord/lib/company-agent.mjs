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
const OWNER_NAME = process.env.OWNER_NAME || 'Owner';
const LOG_DIR  = join(BOT_HOME, 'logs');
const REPORTS  = join(BOT_HOME, 'rag', 'teams', 'reports');
const CTX_BUS  = join(BOT_HOME, 'state', 'context-bus.md');
const VAULT_TEAMS = join(homedir(), 'Jarvis-Vault', '03-teams');
const VAULT_STANDUP = join(homedir(), 'Jarvis-Vault', '02-daily', 'standup');

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

// --event <type> --data <json> argument (이벤트 드리븐 팀 활성화)
const eventArg = (() => {
  const idx = process.argv.indexOf('--event');
  if (idx !== -1) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith('--event='));
  return eq?.split('=')[1] ?? null;
})();
const eventData = (() => {
  const idx = process.argv.indexOf('--data');
  if (idx !== -1) try { return JSON.parse(process.argv[idx + 1]); } catch { return {}; }
  return {};
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
  const label = eventArg ? `event:${eventArg}` : (teamArg ?? '?');
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${label}] ${msg}`;
  console.log(line);
  appendFileSync(
    join(LOG_DIR, 'company-agent.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), level, team: label, msg }) + '\n',
  );
}

async function sendWebhook(channelKey, content) {
  const url = monitoring.webhooks?.[channelKey];
  if (!url || !content) return;
  content = content.replace(/https?:\/\/[^ )>\n]+/g, '');
  // Discord 2000자 제한으로 청킹 — 단어/줄 경계에서 자르기
  const LIMIT = 1990;
  let pos = 0;
  while (pos < content.length) {
    let end = pos + LIMIT;
    if (end < content.length) {
      // 줄바꿈 → 공백 순으로 경계 탐색
      const cutNl = content.lastIndexOf('\n', end);
      const cutSp = content.lastIndexOf(' ', end);
      if (cutNl > pos) end = cutNl + 1;
      else if (cutSp > pos) end = cutSp + 1;
    }
    const chunk = content.slice(pos, end);
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chunk }),
      });
      if (end < content.length) await new Promise((r) => setTimeout(r, 500));
    } catch (e) { log('warn', `webhook(${channelKey}) failed: ${e.message}`); }
    pos = end;
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
        description: `시스템 로그 파일을 직접 읽어 오류, 반복 실패, 성능 이상을 탐지한다. 오늘(${DATE}) 데이터만 분석.`,
        prompt: `오늘(${DATE}) 발생한 이슈만 분석하라. 과거 로그는 무시.

1. ${join(LOG_DIR, 'discord-bot.err.log')} — 마지막 50줄 Read 후 ${DATE} 타임스탬프 포함하는 줄만 분석
2. ${join(LOG_DIR, 'task-runner.jsonl')} — 마지막 200줄 Read 후 "ts":"${DATE} 로 시작하는 줄만 집계. SUCCESS/FAILED 건수.
3. ${join(LOG_DIR, 'bot-watchdog.log')} — 마지막 30줄 Read 후 [${DATE} 포함하는 줄만 분석

각 파일이 없으면 건너뛰어라.
판정 규칙:
- ${DATE} 데이터가 없으면 "해당 로그 오늘 데이터 없음" 보고
- 과거 에러가 있어도 오늘 재발하지 않았으면 보고 금지
- 이상 없으면 "로그 이상 없음" 한 줄만.`,
        tools: ['Read', 'Glob'],
      },
    },
    system: `당신은 자비스 컴퍼니의 감사팀장(Council)입니다.
CEO ${OWNER_NAME}을 위해 전사 현황을 파악하고 일일 경영 점검을 수행합니다.
임원 보고서 스타일: 수치 우선, 간결하게. 테이블 금지. 불릿 리스트 사용.`,
    prompt: `[자비스 컴퍼니 일일 경영 점검 — ${DATE}]

⚠️ 분석 범위: 오늘(${DATE}) 데이터만. 어제 이전 이슈는 이미 처리 완료로 간주하고 보고하지 마라.

**Step 1: 시스템 상태** (mcp__nexus__health 1회)
- LaunchAgent, 디스크, 메모리 요약

**Step 2: 서브에이전트 분석 (반드시 Agent 도구 사용)**
- Agent 도구로 "kpi-analyst" 에이전트를 호출하라. 반환 결과를 4단계 팀별 현황에 반영.
- Agent 도구로 "log-analyst" 에이전트를 호출하라. 반환 결과를 주목 이슈에 반영.

**Step 3: 태스크 성공률 집계**
- 주 소스: ${join(LOG_DIR, 'cron.log')}에서 오늘(${DATE}) SUCCESS/FAILED 줄만 grep하여 개수 집계
- 보조 소스: ${join(LOG_DIR, 'task-runner.jsonl')}에서 오늘 데이터 교차 확인
- 두 소스의 수치가 다르면 cron.log 기준으로 보고하고 차이를 명기
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
- 위 보고서를 ${CTX_BUS}에 저장 (Write 도구 사용)
- 저장 시 보고서 상단에 다음 헤더를 포함하라:
  > 분석 범위: ${DATE} 00:00 ~ 현재 | 이전 이슈 미포함`,
  },

  // ── Infra (인프라팀) ──────────────────────────────────────────────────────
  infra: {
    name: '인프라팀 (Infra)',
    taskId: 'infra-daily',
    discord: 'jarvis-system',
    report: join(REPORTS, `infra-${DATE}.md`),
    maxTurns: 20,
    tools: ['Read', 'Write', 'Bash', ...NEXUS_TOOLS],
    system: `당신은 자비스 컴퍼니의 인프라팀장입니다.
시스템 안정성 담당. 수치 우선, 간결하게 보고합니다.
이상 발견 시 즉각 명확하게 표시합니다.`,
    prompt: `[인프라팀 일일 점검 — ${DATE}]

mcp__nexus__scan으로 다음을 한 번에 확인하라.
⚠️ mcp__nexus 도구가 사용 불가하면 Bash 도구로 각 명령을 직접 실행하라:
1. LaunchAgent 상태: launchctl list | grep ai.jarvis
2. 디스크: df -h /
3. 메모리: vm_stat | head -5
4. 크론 실패: grep "${DATE}" ${join(LOG_DIR, 'task-runner.jsonl')} | grep -c "FAILED" 또는 0
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
    tools: ['Read', 'Write', 'Bash', 'WebSearch', 'Glob', 'Agent'],
    agents: {
      'career-context': {
        description: `성장팀의 최신 커리어 리포트를 읽고, ${OWNER_NAME}이 현재 포트폴리오/블로그에서 강조해야 할 스킬과 경험을 추출한다.`,
        prompt: `${REPORTS}/ 에서 career-*.md 최신 파일을 읽어라.
채용 시장에서 요구하는 스킬/키워드를 추출하고, ${OWNER_NAME}의 블로그/GitHub에서 부각해야 할 포인트를 3개 이내로 정리하라.
출력: 키워드 | 이유 (채용 공고에서 언급 빈도/중요도)`,
        tools: ['Read', 'Glob'],
      },
    },
    system: `당신은 자비스 컴퍼니의 브랜드팀장입니다.
${OWNER_NAME}의 개발자 브랜딩과 기술 블로그/GitHub 전략 담당.
${OWNER_NAME} 강점: Java/Spring Boot, 비동기 처리, 성능 최적화, IoT, AI 자동화(Jarvis).
"블로그를 쓰세요" 같은 막연한 조언 금지. 제목과 개요까지 구체적으로 제시.`,
    prompt: `[브랜드팀 주간 보고 — ${WEEK}]

**Step 1: 사내 데이터 읽기**
- ${REPORTS}/ 에서 career-*.md 최신 파일 Glob → Read (채용 시장에서 요구하는 스킬/포트폴리오 방향)
- 파일이 없으면 스킵

**Step 2: GitHub 활동 분석** (Bash)
cd ${BOT_HOME} && git log --oneline --since="7 days ago" 2>/dev/null | head -15

**Step 3: 블로그 트렌드 조사** (WebSearch 2회)
1. "개발자 기술 블로그 인기 주제 2026 Java Spring" — 어떤 글이 조회수 높은지
2. "백엔드 개발자 포트폴리오 GitHub 2026" — 채용 담당자가 보는 포인트

**Step 4: 보고서 작성**

## 📣 브랜드팀 주간 보고 — ${WEEK}

**이번 주 GitHub 활동**
- 커밋 N건: [주요 변경 1-2줄 요약]

**블로그 포스트 제안** (1개, 바로 쓸 수 있게)
- 제목: "[구체적 제목]"
- 왜 이 주제?: [독자 관심 + ${OWNER_NAME} 전문성 + 성장팀 커리어 방향 교집합 1줄]
- 개요:
  1. [섹션1 — 핵심 내용 한 줄]
  2. [섹션2]
  3. [섹션3]
- 예상 분량: ~N분 읽기

**GitHub 개선 1가지** (이번 주에 바로 할 수 있는 것)
- [구체적 개선 포인트와 방법]`,
  },

  // ── Career (성장팀) ───────────────────────────────────────────────────────
  career: {
    name: '성장팀 (Career)',
    taskId: 'career-weekly',
    discord: 'jarvis-ceo',
    report: join(REPORTS, `career-${WEEK}.md`),
    maxTurns: 25,
    tools: ['Read', 'Write', 'WebSearch', 'Glob', 'Agent'],
    agents: {
      'skill-gap-analyst': {
        description: `채용 공고의 요구 스킬과 ${OWNER_NAME}의 현재 스택(Java/Spring Boot/JPA/MySQL)을 비교하여 부족한 스킬을 분석한다. 분석 결과는 학습팀(academy)에 전달할 학습 우선순위가 된다.`,
        prompt: `${REPORTS}/ 에서 career-*.md 최신 파일을 읽어 채용 공고 요구 스킬을 추출하라.
${OWNER_NAME} 현재 스택: Java, Spring Boot, JPA, MySQL, Docker, 비동기 처리, 성능 최적화.
공고에서 요구하지만 ${OWNER_NAME}이 아직 약한 분야를 3개 이내로 뽑아라.
단, Java/Spring 생태계 내의 스킬만 (Kotlin/Go 제외).
출력 형식: 스킬명 | 요구 빈도(높음/보통) | 학습 난이도(쉬움/보통/어려움)`,
        tools: ['Read', 'Glob'],
      },
    },
    system: `당신은 자비스 컴퍼니의 성장팀장입니다.
${OWNER_NAME}의 커리어 성장을 담당합니다. ${OWNER_NAME} 프로필:
- 경력 6년차 백엔드 개발자 (Java/Spring Boot/JPA)
- 강점: 비동기 처리, 성능 최적화, IoT 시스템
- 현직: 중견기업 백엔드
- 목표: 시니어 개발자 포지션, 연봉 상승
- 기술 스택: Java, Spring Boot, JPA, MySQL — Kotlin/Go 등 ${OWNER_NAME} 스택에 없는 언어는 추천하지 마라

채용 공고 필터링 시 ${OWNER_NAME} 스택(Java/Spring Boot)으로 지원 가능한 공고만 선별.
현실적이고 구체적인 정보만. 공허한 격려와 막연한 조언 금지.
"열심히 하세요" 류의 멘트는 절대 쓰지 마라.`,
    prompt: `[성장팀 주간 커리어 리포트 — ${WEEK}]

**Step 1: 사내 데이터 읽기 (WebSearch 불필요)**
- ${REPORTS}/ 에서 trend-*.md 최신 파일 Glob → Read (기술 시장 동향)
- ${join(BOT_HOME, 'results', 'tqqq-monitor')}/ 에서 최신 .md 파일 Glob → Read (TQQQ 시세)
- 파일이 없으면 스킵하고 진행

**Step 2: 채용 시장 검색** (WebSearch 2회)
1. "wanted.co.kr 백엔드 시니어 채용 2026" — 원티드 기준 실제 채용 공고
2. "Java Spring Boot senior developer salary Korea 2026" — 연봉 수준과 자격 요건

**Step 3: 지난주 리포트 확인** (있으면)
- ${REPORTS}/ 에서 career-*.md 파일 Glob → 있으면 최신 것 Read
- 없으면 "첫 리포트"로 명시하고 그대로 진행 (에러 내지 마라)

**Step 3: 보고서 작성 (아래 형식 그대로)**

## 🚀 성장팀 주간 리포트 — ${WEEK}

**채용 시장 핵심**
- 이번 주 눈에 띄는 공고/트렌드 2-3건 (회사명, 포지션, 연봉대 구체적으로)
- ${OWNER_NAME} 프로필(Java/Spring 6년차)과 매칭되는 공고가 있으면 구체적으로 언급

**TQQQ 이직 신호**: 🟢/🟡/🔴 $XX.XX
- 기술주 흐름이 IT 채용에 미치는 영향 1줄 (채용 확대/축소 신호)

**이번 주 액션** (반드시 3가지, 실행 가능하게)
- (1) [면접/포트폴리오/스킬 중 하나] — 예상 소요시간
- (2) ...
- (3) ...

**지난주 대비 변화** (이전 리포트 있을 때만, 없으면 이 섹션 생략)`,
  },

  // ── Academy (학습팀) ──────────────────────────────────────────────────────
  academy: {
    name: '학습팀 (Academy)',
    taskId: 'academy-support',
    discord: 'jarvis-ceo',
    report: join(REPORTS, `academy-${WEEK}.md`),
    maxTurns: 20,
    tools: ['Read', 'Write', 'WebSearch', 'Glob', 'Agent'],
    agents: {
      'career-priority': {
        description: `성장팀의 최신 커리어 리포트와 스킬 갭 분석을 읽고, 이번 주 학습 미션의 우선순위를 결정한다.`,
        prompt: `${REPORTS}/ 에서 career-*.md 최신 파일을 읽어라.
채용 공고에서 요구하지만 ${OWNER_NAME}이 보강해야 할 스킬을 추출하라.
Java/Spring Boot/JPA/MySQL 생태계 내 스킬만 대상.
출력: 가장 시급한 학습 주제 1개와 그 이유 1줄`,
        tools: ['Read', 'Glob'],
      },
    },
    system: `당신은 자비스 컴퍼니의 학습팀장입니다.
${OWNER_NAME}의 기술 역량 강화를 담당합니다.
${OWNER_NAME} 스택: Java, Spring Boot, JPA, MySQL. 이 스택 내에서 심화 학습만 다룬다.
Kotlin/Go 등 ${OWNER_NAME} 스택에 없는 언어 학습은 추천하지 마라.
학습 방향: Java 심화, Spring Boot 고급, 시스템 설계 면접, 코딩 테스트, 성능 최적화.
매주 "딱 하나"만 깊게 파는 학습 미션을 준다. 범위를 넓게 잡지 마라.
"공부하세요" 류의 막연한 조언 금지. 뭘, 얼마나, 어떻게 할지 구체적으로.`,
    prompt: `[학습팀 주간 보고 — ${WEEK}]

**Step 1: 학습 방향 결정**
- ${REPORTS}/ 에서 career-*.md 최신 파일 Glob → 있으면 Read하여 필요 스킬 추출
- 없으면 기본 로테이션: Java 심화 → Spring Boot 고급 → JPA/DB 최적화 → 시스템 설계 면접 → 코딩 테스트 순환
- ${REPORTS}/ 에서 academy-*.md 최신 파일도 확인 → 지난주와 다른 주제 선택

**Step 2: 학습 자료 검색** (WebSearch 2회)
1. 선택한 주제의 최신 고품질 자료 (공식 문서, 실전 튜토리얼)
2. 면접 관련: "시스템 설계 면접 질문" 또는 "Java 코딩 테스트 기출"

**Step 3: 보고서 작성**

## 📚 학습팀 주간 보고 — ${WEEK}

**이번 주 학습 미션** (택 1, 완주 가능한 분량)
- 📖 주제: [구체적 학습 내용]
- ⏱️ 분량: 하루 30분 × N일 (총 X시간)
- 🎯 완료 기준: [이걸 하면 끝 — 명확하게]

**추천 자료** (1개만, 엄선)
- [제목](URL) — 왜 이걸 추천하는지 1줄

**면접 준비 한 문제**
- Q: [시스템 설계 또는 코딩 문제 1개]
- 힌트: [접근법 1줄]

**다음 주 예고**: [다음 주에 다룰 주제 1줄]`,
  },

  // ── Trend (정보팀) ────────────────────────────────────────────────────────
  trend: {
    name: '정보팀 (Trend)',
    taskId: 'news-briefing',
    discord: 'jarvis',
    report: join(REPORTS, `trend-${DATE}.md`),
    maxTurns: 15,
    tools: ['Read', 'Write', 'WebSearch', 'Glob'],
    system: `당신은 자비스 컴퍼니의 정보팀장입니다.
AI/기술 트렌드와 시장 뉴스 담당.
팩트 우선. 의견/예측은 "분석:" 레이블로 팩트와 분리.`,
    prompt: `[정보팀 일일 브리핑 — ${DATE}]

**Step 1: 시세 데이터 (파일에서 읽기 — WebSearch 불필요)**
- ${join(BOT_HOME, 'results', 'tqqq-monitor')}/ 에서 최신 .md 파일 Glob 후 Read
- TQQQ/SOXL/NVDA/VIX 데이터를 거기서 가져와라

**Step 2: 뉴스 검색** (WebSearch 2회)
1. "AI LLM news today ${DATE}" — 오늘 주요 AI 뉴스
2. "tech startup news ${DATE.slice(0, 7)}" — 기술/스타트업 동향

**Step 3: 보고서 작성**

## 📡 정보팀 일일 브리핑 — ${DATE}
**AI/Tech 주요 뉴스**
- [뉴스1 제목]: 한 줄 요약
- [뉴스2 제목]: 한 줄 요약

**기술 트렌드**
- ${OWNER_NAME} 관심사(백엔드, Java, 비동기) 연관 트렌드 1-2개

**시장 동향** (tqqq-monitor 데이터 기반)
- TQQQ: $XX.XX (X.X%) | NVDA: $XX.XX (X.X%)`,
  },

  // ── Standup (모닝 스탠드업) ───────────────────────────────────────────────
  standup: {
    name: '모닝 스탠드업',
    taskId: 'morning-standup',
    discord: 'jarvis',
    report: null, // 파일 저장 없음
    maxTurns: 20,
    tools: ['Read', 'Bash', 'WebSearch', ...NEXUS_TOOLS],
    system: `당신은 자비스 모닝 브리핑 담당이다.
긍정 편향 금지. "정상", "✅", "문제 없음" 남발하지 마라.
정상인 항목은 나열하지 말고, 이상·경고·주의만 상세히 보고하라.
모든 수치는 직접 확인한 데이터로만 작성하라. 과거 기억이나 추정 금지.
인사말, 이모지 과다, 감정 표현, "출근하세요" 같은 말 금지.
2분 안에 읽을 수 있는 분량으로 작성.`,
    prompt: `[모닝 브리핑 — ${DATE}]

아래 항목을 순서대로 수집하라. 각 항목은 실제 명령/파일로 직접 확인할 것.

**1. 시스템 지표** (Bash로 직접 확인)
- Claude Max rate limit: Read ~/.jarvis/state/rate-tracker.json → 5시간/7일 사용량 %
- 크론 통계: grep으로 오늘자 cron.log에서 SUCCESS/FAILED 건수
- E2E: Read ~/.jarvis/results/e2e-health/ 최신 파일 → 통과/실패 건수
- 메모리: vm_stat | head -5 → 여유 메모리 계산
- 디스크: df -h / → 사용량/여유

**2. 어제 이슈/이벤트** — ${CTX_BUS} 읽기
- 어제 발생한 장애, 경고, 수동 조치 필요 항목만 추출
- 이미 해결된 것은 "해결됨"으로 짧게, 미해결만 상세히

**3. 일정** (Bash로 확인)
- gog calendar list --from today --to today --account \${GOOGLE_ACCOUNT:-your@gmail.com} 2>&1
- gog tasks list "MDE3MjE5NzU0MjA3NTAxOTg4ODc6MDow" 2>&1
- 인증 만료 시 "Google 인증 만료 — 재인증 필요" 한 줄로 경고

**4. 시장** (WebSearch)
- "TQQQ SOXL NVDA stock price today" 검색
- 3종목: 현재가, 전일 대비 %, 특이사항만

**5. 뉴스** (WebSearch)
- "AI tech news ${DATE}" 검색, 핵심 1개만

형식 (이 구조를 정확히 따를 것):
## 모닝 브리핑 — ${DATE}

**시스템**
- Rate limit: 5h X%/7d X% | 크론: 성공 X/실패 X | E2E: X/X pass
- [이상 있으면만] 메모리·디스크·프로세스 경고

**어제 이슈**
- [미해결] 항목명 — 상세
- [해결됨] 항목명

**일정**
- 오늘 일정 목록 또는 "일정 없음"

**시장**
- TQQQ $XX.XX (X.X%) | SOXL $XX.XX (X.X%) | NVDA $XX.XX (X.X%)
- [손절선 접근 등 특이사항만]

**뉴스**
- [제목] — 한 줄 요약`,
  },
};

// ---------------------------------------------------------------------------
// Event → Team routing (이벤트가 팀을 직접 깨움)
// ---------------------------------------------------------------------------

const EVENT_ROUTES = {
  // TQQQ 급등/급락 → 성장팀(채용 타이밍 재평가)
  // trend는 정기 크론(07:50 매일)으로 충분, 중복 실행 방지
  'tqqq-critical': {
    teams: ['career'],
    promptPrefix: (data) =>
      `🚨 **긴급 이벤트**: TQQQ ${data.level === 'critical' ? '손절선 하회' : '급락 경고'} — 현재가 $${data.price} (${data.change || ''})\n이 이벤트에 맞춰 보고서를 작성하라. 평소 보고와 다르게 이 상황에 대한 즉각 분석이 핵심이다.\n\n`,
  },
  // 디스크 위험 → 인프라팀(긴급 점검)
  'disk-critical': {
    teams: ['infra'],
    promptPrefix: (data) =>
      `🚨 **긴급 이벤트**: 디스크 사용률 ${data.usage}% — 임계치 초과\n정기 점검이 아닌 디스크 공간 확보에 집중하라. 삭제 가능한 파일 목록과 예상 확보량을 보고하라.\n\n`,
  },
  // Claude 과부하 → 인프라팀(프로세스 정리)
  'claude-overload': {
    teams: ['infra'],
    promptPrefix: (data) =>
      `⚠️ **이벤트**: Claude 동시 실행 ${data.count}개 감지\n현재 실행 중인 claude 프로세스를 점검하고 비정상 프로세스가 있는지 확인하라.\n\n`,
  },
  // GitHub 새 커밋 → 브랜드팀(블로그/포트폴리오 업데이트 검토)
  'new-commits': {
    teams: ['brand'],
    promptPrefix: (data) =>
      `📦 **이벤트**: 이번 주 GitHub 커밋 ${data.count}건 감지\n새로운 커밋 내용을 기반으로 블로그 포스트 제안을 업데이트하라.\n\n`,
  },
  // 시스템 장애 → 인프라팀(긴급 복구)
  'system-failure': {
    teams: ['infra'],
    promptPrefix: (data) =>
      `🔴 **긴급 이벤트**: ${data.service || '서비스'} 장애 감지 — ${data.message || ''}\n원인 파악과 복구 방안을 즉시 보고하라.\n\n`,
  },
};

// 이벤트 로그 기록 (event-bus.jsonl)
function logEvent(eventType, data, teams) {
  const busFile = join(BOT_HOME, 'state', 'event-bus.jsonl');
  appendFileSync(busFile, JSON.stringify({
    ts: new Date().toISOString(), event: eventType, data, teams,
  }) + '\n');
}

// 이벤트 → 팀 실행 (순차)
async function dispatchEvent(eventType) {
  const route = EVENT_ROUTES[eventType];
  if (!route) {
    console.error(`Unknown event: "${eventType}". Available: ${Object.keys(EVENT_ROUTES).join(', ')}`);
    process.exit(1);
  }

  log('info', `Event "${eventType}" → teams: [${route.teams.join(', ')}]`);
  logEvent(eventType, eventData, route.teams);

  const results = [];
  for (const teamName of route.teams) {
    log('info', `Event dispatch: ${eventType} → ${teamName}`);
    const r = await runTeam(teamName, route.promptPrefix(eventData));
    results.push({ team: teamName, ...r });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function runTeam(name, eventPromptPrefix = '') {
  const team = TEAMS[name];
  if (!team) {
    console.error(`Unknown team: "${name}". Available: ${Object.keys(TEAMS).join(', ')}`);
    process.exit(1);
  }

  log('info', `Starting ${team.name}`);
  const t0 = Date.now();

  const opts = {
    cwd: BOT_HOME,
    pathToClaudeCodeExecutable: process.env.CLAUDE_BINARY || join(homedir(), '.local/bin/claude'),
    allowedTools: team.tools,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    mcpServers: MCP,
    maxTurns: team.maxTurns,
    model: 'claude-sonnet-4-6',
    systemPrompt: `${team.system}
[공통 원칙] 긍정 편향 금지. "정상", "✅ 문제없음" 남발하지 마라. 이상 있는 것만 상세히, 정상은 한 줄 이하로.
모든 수치는 직접 확인한 데이터 기반. 과거 기억이나 추정으로 보고 금지. URL/링크 포함 금지.`,
  };
  if (team.agents) opts.agents = team.agents;

  // 이벤트 트리거 시 프롬프트 앞에 이벤트 컨텍스트 주입
  const prompt = eventPromptPrefix ? eventPromptPrefix + team.prompt : team.prompt;

  let result = '';
  let isError = false;

  try {
    for await (const msg of query({ prompt, options: opts })) {
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

  // Vault에도 병렬 저장 (Obsidian 연동)
  if (result && !isError) {
    try {
      if (name === 'standup') {
        mkdirSync(VAULT_STANDUP, { recursive: true });
        const vaultPath = join(VAULT_STANDUP, `${DATE}.md`);
        writeFileSync(vaultPath, result, 'utf-8');
        log('info', `Vault standup saved: ${vaultPath}`);
      } else if (team.report) {
        const vaultTeamDir = join(VAULT_TEAMS, name);
        mkdirSync(vaultTeamDir, { recursive: true });
        const filename = team.report.split('/').pop();
        const vaultPath = join(vaultTeamDir, filename);
        writeFileSync(vaultPath, result, 'utf-8');
        log('info', `Vault report saved: ${vaultPath}`);
      }
    } catch (e) { log('warn', `Vault save failed: ${e.message}`); }
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

if (eventArg) {
  // 이벤트 드리븐 모드: --event <type> --data '{"key":"val"}'
  dispatchEvent(eventArg).then((results) => {
    const failed = results.some((r) => r.isError);
    process.exit(failed ? 1 : 0);
  }).catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
} else if (teamArg) {
  runTeam(teamArg).then(({ isError }) => {
    process.exit(isError ? 1 : 0);
  }).catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
} else {
  console.error(`Usage: node company-agent.mjs --team <name>`);
  console.error(`       node company-agent.mjs --event <type> [--data '{"key":"val"}']`);
  console.error(`Teams: ${Object.keys(TEAMS).join(' | ')}`);
  console.error(`Events: ${Object.keys(EVENT_ROUTES).join(' | ')}`);
  process.exit(1);
}
