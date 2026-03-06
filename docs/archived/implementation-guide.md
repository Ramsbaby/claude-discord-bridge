# Obsidian 자율 진화 시스템 — 구현 기술 가이드

**대상**: Phase 1-4 구현자용 상세 기술 명세

---

## Phase 1: 기초 정비 (1주)

### F1-1: SSoT 정의 확정

**작업**:

1. **정보 타입별 저장 위치 매핑 문서화**
   - 파일: `~/.jarvis/docs/sot-registry.md`
   - 내용: 각 정보 타입 → 저장 경로 × RAG 포함 여부
   - 예시:
     ```markdown
     | 정보 타입 | 저장 위치 | RAG | 업데이트 빈도 | 버전 관리 |
     |----------|---------|-----|------------|---------|
     | 크론 결과 | ~/.jarvis/results/{task}/ | ✅ | 실시간 | ❌ |
     | 에이전트 학습 | ~/.jarvis/rag/auto-insights/ | ✅ | 자동 | ✅ |
     | ... | | | | |
     ```

2. **파일명 규칙 통일**
   현재 혼용 (예: 2026-03-01 vs 2026-03-01_200001 vs daily-summary)
   → 통일:
     ```
     {YYYY-MM-DD}_{HHMMSS}_{type}.md
     예: 2026-03-03_200001_daily-summary.md

     내용 별 접두사:
     - result: {task}-result-{date}_{time}.md
     - insight: {task}-insight-{date}.md
     - status: {type}-status-{date}.md
     - report: {team}-report-{date}.md
     ```

3. **중복 정보 제거**
   - [ ] OpenClaw `~/openclaw/memory/teams/` vs `.jarvis/rag/teams/` → 어느것 삭제?
   - [ ] `~/claude/projects/.../memory/` vs `.jarvis/rag/memory.md` → 병합?
   - [ ] `~/jarvis-ai/architecture.md` vs `~/.jarvis/docs/` 개선아이디어 → 통합?

   **추천**:
   ```bash
   SSoT = ~/.jarvis/rag/ (모든 운영 정보)
   보조 = ~/Vault/jarvis-ai/ (Obsidian 표시용, rag의 사본+구조화)
   삭제 = OpenClaw 관련 (완전 이전됨)
   ```

---

### F1-2: Vault 구조 생성

**작업**:

```bash
#!/bin/bash
set -euo pipefail

VAULT_HOME=~/Vault/jarvis-ai

# 8개 계층 생성
mkdir -p "$VAULT_HOME"/{01-system,02-daily,03-insights,04-decisions,05-teams,06-knowledge,07-roadmap,08-inbox}

# 하위 폴더
mkdir -p "$VAULT_HOME"/01-system/{architecture,operations,security}
mkdir -p "$VAULT_HOME"/02-daily/{daily-summary,team-standup,health-check,market}
mkdir -p "$VAULT_HOME"/03-insights/{auto-insights,pattern-detection,optimization-opportunities}
mkdir -p "$VAULT_HOME"/04-decisions/{architecture-decisions,business-decisions,rejected-ideas}
mkdir -p "$VAULT_HOME"/05-teams/{council,academy,brand,infra}
mkdir -p "$VAULT_HOME"/06-knowledge/{tech-stack,patterns,learnings}
mkdir -p "$VAULT_HOME"/07-roadmap
mkdir -p "$VAULT_HOME"/08-inbox/{capture-templates,processing-queue,templates}

# Git 초기화
cd "$VAULT_HOME"
git init
git config user.name "Jarvis"
git config user.email "jarvis@auto"

# 기본 README
cat > "$VAULT_HOME"/README.md << 'EOF'
# Jarvis Vault

Jarvis AI 시스템의 중앙 지식 저장소.

- 01-system: 아키텍처, 운영, 보안
- 02-daily: 일일 운영 결과
- 03-insights: 에이전트 자동 학습
- 04-decisions: 의사결정 로그
- 05-teams: 팀별 정보
- 06-knowledge: 장기 지식
- 07-roadmap: 로드맵
- 08-inbox: 임시 처리 대기

자동 업데이트: rag-watch.mjs (파일 감시자)
RAG 동기화: rag-index.mjs (매시간)
EOF

git add .
git commit -m "Initial Vault structure"
echo "✅ Vault created at $VAULT_HOME"
```

**기존 파일 마이그레이션**:

```bash
# 1. 기존 아키텍처 문서
mv ~/jarvis-ai/architecture.md ~/Vault/jarvis-ai/01-system/architecture/system-design.md

# 2. 기존 docs/
cp ~/.jarvis/docs/improvement-ideas.md ~/Vault/jarvis-ai/01-system/operations/
cp ~/.jarvis/docs/self-evaluation.md ~/Vault/jarvis-ai/04-decisions/

# 3. 기존 결과들 (최근 30일만)
find ~/.jarvis/results -mtime -30 -type f | while read f; do
  dir=$(basename $(dirname "$f"))
  mkdir -p ~/Vault/jarvis-ai/02-daily/results/$dir
  cp "$f" ~/Vault/jarvis-ai/02-daily/results/$dir/
done

# 4. RAG 기본 정보
cp ~/.jarvis/rag/memory.md ~/Vault/jarvis-ai/03-insights/
cp ~/.jarvis/rag/decisions.md ~/Vault/jarvis-ai/04-decisions/
```

---

### F1-3: Obsidian 설정

**수동 단계** (Obsidian UI):

1. **Vault 열기**:
   - Obsidian 실행 → "Open folder as vault" → ~/Vault/jarvis-ai/ 선택

2. **Community Plugins 설치**:
   - Settings → Community plugins → Browse

   필수:
   ```
   - obsidian-git (자동 커밋)
     설정: Auto commit interval 30min, Auto pull on startup

   - templater (템플릿)
     설정: Template folder location = 08-inbox/templates

   - obsidian-dataview (동적 인덱스)
     사용: daily/ 폴더의 자동 요약

   - obsidian-calendar (날짜 네비게이션)

   - obsidian-outlines (문서 구조)
   ```

3. **폴더 구조 설정**:
   - Settings → Files & Links
     - Confirm delete: ON
     - Auto create folders: ON
     - New note location: ON (08-inbox/processing-queue/)

4. **Daily Notes 설정**:
   - Community plugins → Daily notes
     - Date format: YYYY-MM-DD
     - Template location: 08-inbox/templates/daily-note-template.md

5. **Graph 설정** (Settings → Graph):
   ```
   Display:
   - Show attachment: ON
   - Show orphans: ON
   - Color groups: ON (태그별)

   Groups:
   - #insight (파란색)
   - #decision (빨간색)
   - #status (초록색)
   - #learning (노란색)
   ```

6. **검색 설정** (Settings → Core plugins → Search):
   ```
   Regex support: ON
   Show line numbers: ON
   ```

**스크립트화** (향후):

```javascript
// obsidian-api 활용 (플러그인 개발)
// 현재는 수동이 나음 (Obsidian 구성이 자주 바뀌지 않음)
```

---

## Phase 2: 자동화 파이프라인 (2주)

### F2-1: RAG 실시간 인덱싱 (rag-watch.mjs)

**파일**: `~/.jarvis/lib/rag-watch.mjs`

```javascript
/**
 * RAG Watch - File System Watcher
 *
 * 감시 대상:
 * - ~/.jarvis/rag/
 * - ~/.jarvis/results/
 * - ~/.jarvis/context/
 * - ~/Vault/jarvis-ai/
 *
 * 이벤트: add, change, unlink
 * 배치: 100ms 디바운스 (빠른 파일 수정 병합)
 */

import chokidar from 'chokidar';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';
import { RAGEngine } from './rag-engine.mjs';
import { writeFile, readFile } from 'node:fs/promises';

const RAG = new RAGEngine();
const LOG_FILE = join(process.env.BOT_HOME || join(homedir(), '.jarvis'), 'logs', 'rag-watch.log');

// 감시 경로 목록
const WATCH_PATHS = [
  join(homedir(), '.jarvis', 'rag'),
  join(homedir(), '.jarvis', 'results'),
  join(homedir(), '.jarvis', 'context'),
  join(homedir(), 'Vault', 'jarvis-ai'),  // NEW: Obsidian Vault
];

// 무시할 파일 패턴
const IGNORE_PATTERNS = [
  '**/*.tmp',
  '**/.git',
  '**/node_modules',
  '**/.obsidian',
  '**/._*',  // macOS temp files
];

const pendingUpdates = new Set();
let debounceTimer = null;

async function log(level, message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${level}: ${message}\n`;
  console.log(logEntry);
  try {
    await appendFile(LOG_FILE, logEntry);
  } catch (e) {
    console.error('Log write failed:', e);
  }
}

async function processPendingUpdates() {
  if (pendingUpdates.size === 0) return;

  const files = Array.from(pendingUpdates);
  pendingUpdates.clear();

  await log('INFO', `Processing ${files.length} file(s)`);

  for (const filePath of files) {
    try {
      // .md 파일만 처리
      if (extname(filePath) !== '.md') continue;

      // 파일 타입 판단
      const isDelete = !fs.existsSync(filePath);

      if (isDelete) {
        // 삭제: LanceDB에서 제거
        await RAG.removeByPath(filePath);
        await log('INFO', `Deleted: ${filePath}`);
      } else {
        // 추가/변경: 인덱싱
        const content = await readFile(filePath, 'utf-8');
        const success = await RAG.indexFile(filePath, content);

        if (success) {
          await log('INFO', `Indexed: ${filePath}`);
        } else {
          await log('WARN', `Failed to index: ${filePath}`);
        }
      }
    } catch (error) {
      await log('ERROR', `Processing ${filePath}: ${error.message}`);
    }
  }

  // index-state.json 업데이트
  try {
    const state = await RAG.getIndexState();
    const stateFile = join(process.env.BOT_HOME || join(homedir(), '.jarvis'), 'rag', 'index-state.json');
    await writeFile(stateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    await log('ERROR', `Failed to update index state: ${e.message}`);
  }
}

async function scheduleUpdate(filePath) {
  // 1초(1000ms) 디바운스: 빠른 수정 병합
  pendingUpdates.add(filePath);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(processPendingUpdates, 1000);
}

async function main() {
  await log('INFO', '🚀 RAG Watch Started');

  await RAG.init();

  const watcher = chokidar.watch(WATCH_PATHS, {
    ignored: IGNORE_PATTERNS,
    awaitWriteFinish: {
      stabilityThreshold: 200,  // 파일 쓰기 완료 대기 (200ms)
      pollInterval: 100,
    },
    persistent: true,
    usePolling: false,
  });

  watcher
    .on('add', filePath => {
      log('DEBUG', `add: ${filePath}`);
      scheduleUpdate(filePath);
    })
    .on('change', filePath => {
      log('DEBUG', `change: ${filePath}`);
      scheduleUpdate(filePath);
    })
    .on('unlink', filePath => {
      log('DEBUG', `unlink: ${filePath}`);
      scheduleUpdate(filePath);
    })
    .on('error', error => {
      log('ERROR', `Watcher error: ${error.message}`);
    });

  await log('INFO', `Watching ${WATCH_PATHS.length} paths`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await log('INFO', 'SIGTERM received, shutting down');
    await watcher.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await log('INFO', 'SIGINT received, shutting down');
    await watcher.close();
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

**LaunchAgent 등록**:

```xml
<!-- ~/.config/launchd/ai.jarvis.rag-watch.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>ai.jarvis.rag-watch</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/env</string>
        <string>node</string>
        <string>/Users/ramsbaby/.jarvis/lib/rag-watch.mjs</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/ramsbaby/.jarvis</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>BOT_HOME</key>
        <string>/Users/ramsbaby/.jarvis</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/ramsbaby/.jarvis/logs/rag-watch.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/ramsbaby/.jarvis/logs/rag-watch-error.log</string>
</dict>
</plist>
```

**설치**:

```bash
# LaunchAgent 등록
launchctl load ~/.config/launchd/ai.jarvis.rag-watch.plist

# 확인
launchctl list | grep rag-watch

# 테스트
echo "Test insight" > ~/.jarvis/rag/auto-insights/test.md
# 1초 내에 rag-watch.log에 "Indexed" 메시지 확인
tail -f ~/.jarvis/logs/rag-watch.log
```

---

### F2-2: 자동 컨텍스트 주입 (ask-claude.sh 개선)

**현재** (`ask-claude.sh`):
```bash
# 수동: context 파일 직접 로드
CONTEXT=$(cat ~/.jarvis/context/$TASK.md)
```

**개선**:

```bash
#!/bin/bash
set -euo pipefail

TASK=$1
BOT_HOME=${BOT_HOME:-~/.jarvis}

# 1️⃣ 명시적 컨텍스트 (항상)
EXPLICIT_CONTEXT=""
if [[ -f "$BOT_HOME/context/$TASK.md" ]]; then
  EXPLICIT_CONTEXT=$(cat "$BOT_HOME/context/$TASK.md")
fi

# 2️⃣ RAG 자동 검색 [NEW]
AUTO_CONTEXT=$(query_rag "$TASK" --max-context 2000)
# query_rag 함수: LanceDB에서 $TASK 관련 문서 검색
# 반환: 마크다운 포맷 (## Auto-Context from RAG)

# 3️⃣ 동적 정보 주입 [NEW]
DYNAMIC_INFO=$(get_dynamic_info)
# 함수: rate-tracker, 최근 에러, 팀 상태 수집

# 4️⃣ 사용자 프로필
USER_PROFILE=""
if [[ -f "$BOT_HOME/context/owner/owner-profile.md" ]]; then
  USER_PROFILE=$(cat "$BOT_HOME/context/owner/owner-profile.md")
fi

# 5️⃣ 최종 프롬프트 조합
FINAL_PROMPT="
# System
You are Jarvis, a personal AI assistant...

## Task: $TASK

## User Profile
$USER_PROFILE

## Explicit Context
$EXPLICIT_CONTEXT

## Auto-Context from RAG
$AUTO_CONTEXT

## Current State
$DYNAMIC_INFO

## Instruction
Please proceed with the task above.
"

# claude -p에 전달
echo "$FINAL_PROMPT" | claude -p --output-format stream-json

# 6️⃣ 학습 기록 [NEW]
if [[ -n "${RECORD_INSIGHT:-}" ]]; then
  record_insight "$TASK" "$RESPONSE"
fi
```

**RAG 쿼리 함수** (`~/.jarvis/lib/rag-query.mjs`):

```javascript
/**
 * RAG Query - LanceDB 검색
 *
 * 사용: ask-claude.sh에서 호출
 * 반환: 마크다운 포맷
 */

export async function queryRAG(query, options = {}) {
  const { maxResults = 5, maxChars = 2000 } = options;

  const results = await table.search(query)
    .limit(maxResults)
    .execute();

  let markdown = '## Auto-Context from RAG\n\n';
  let charCount = 0;

  for (const result of results) {
    if (charCount > maxChars) break;

    const section = `### ${result.source} (relevance: ${(result.similarity * 100).toFixed(0)}%)
${result.text}

`;
    markdown += section;
    charCount += section.length;
  }

  return markdown;
}

// CLI 호출
if (import.meta.url === `file://${process.argv[1]}`) {
  const query = process.argv[2];
  const results = await queryRAG(query);
  console.log(results);
}
```

**테스트**:

```bash
# 테스트 쿼리
node ~/.jarvis/lib/rag-query.mjs "TQQQ market trends"

# ask-claude.sh에 통합 후 확인
ask-claude.sh tqqq-monitor
# 프롬프트에 "Auto-Context from RAG" 섹션 있는지 확인
```

---

### F2-3: 에이전트 자동 학습 기록

**구현**: ask-claude.sh에 `--record-insight` 플래그 추가

```bash
# 사용 예
ask-claude.sh tqqq-monitor --record-insight

# 출력:
# ✅ Insight recorded: ~/.jarvis/rag/auto-insights/tqqq-monitor-2026-03-03-patterns.md
```

**생성 규칙** (`record_insight` 함수):

```javascript
function recordInsight(task, response) {
  // 응답에서 패턴 추출 (정규표현식)
  const patterns = response.match(/\b(pattern|found|tendency|noticed)\b/gi);
  const optimizations = response.match(/\b(improve|optimize|faster|better)\b/gi);

  const date = new Date().toISOString().split('T')[0];

  let insights = '';

  if (patterns) {
    insights += `
## 📊 Patterns Detected

${response.slice(...)}

---
`;
  }

  if (optimizations) {
    insights += `
## ⚡ Optimization Opportunities

${response.slice(...)}

---
`;
  }

  // 저장
  const filePath = join(
    process.env.BOT_HOME,
    'rag/auto-insights',
    `${task}-${date}-insights.md`
  );

  fs.writeFileSync(filePath, insights);
  return filePath;
}
```

---

## Phase 3: 정보 흐름 통합 (1주)

### F3-1: 크론 결과 → Vault 자동 저장

**구현** (`route-result.sh` 개선):

```bash
# 현재
route-result.sh tqqq-monitor "results.md" "webhook-url"

# 개선: Vault 자동 저장 추가
route-result.sh tqqq-monitor "results.md" "webhook-url" --vault
```

**코드**:

```bash
function save_to_vault() {
  local task=$1
  local result_file=$2

  local vault_dir="$BOT_HOME/rag/auto-insights"  # 또는 02-daily/results/
  mkdir -p "$vault_dir"

  local filename=$(basename "$result_file" .md)
  local timestamp=$(date +%Y-%m-%d_%H%M%S)

  cp "$result_file" "$vault_dir/${task}-${timestamp}.md"

  # Git 커밋 (obsidian-git도 감지)
  cd "$vault_dir"
  git add .
  git commit -m "Auto-save: $task at $timestamp" || true
}
```

---

### F3-2: Discord ↔ Vault 양방향

**Discord → Vault**: 메시지 저장

```javascript
// discord-bot.js 확장
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // 매시간 daily-summary.md에 메시지 기록
  const today = new Date().toISOString().split('T')[0];
  const summaryFile = join(
    BOT_HOME, 'rag/daily', `${today}.md`
  );

  const entry = `
## ${message.createdAt.toLocaleTimeString()}
**${message.author.username}**: ${message.content}
---
`;

  appendFileSync(summaryFile, entry);
});
```

**Vault → Discord**: 변경 알림

```bash
# rag-watch.mjs에서 파일 변경 감지 시
if (filePath.includes('/04-decisions/')) {
  // decisions에 변경 → Discord에 알림
  curl -X POST webhook \
    -H "Content-Type: application/json" \
    -d '{"content":"📝 Decision updated: ..."}' \
    $WEBHOOK_URL
}
```

---

### F3-3: Galaxy 동기화 (Syncthing)

**설치** (Mac):

```bash
brew install syncthing
brew services start syncthing

# 접속: http://localhost:8384
```

**설정** (Syncthing UI):

1. Settings → General
   - Device name: "Mac-Jarvis"

2. Add Folder
   - Folder Path: ~/Vault/jarvis-ai/
   - Folder ID: jarvis-vault
   - Type: Send & Receive

3. Add Device
   - Device Name: Galaxy
   - Device ID: [Galaxy의 Syncthing ID]

4. Share Folder
   - Select folder: jarvis-vault
   - Add device: Galaxy

**Galaxy 설정** (Syncthing Android):

```
1. Syncthing 앱 설치
2. 장치 추가: Mac-Jarvis 스캔
3. 폴더 추가 허용
4. 자동 시작 활성화 (Settings → Run conditions)
```

---

## Phase 4: 검증 & 최적화 (1주)

### F4-1: RAG 검색 품질

**테스트 쿼리**:

```bash
#!/bin/bash

# 1. 태스크명 검색
node ~/.jarvis/lib/rag-query.mjs "tqqq-monitor" | wc -l
# 기대: > 100 줄 (관련 결과 많음)

# 2. 정책 검색
node ~/.jarvis/lib/rag-query.mjs "company rules" | wc -l

# 3. 팀 정보 검색
node ~/.jarvis/lib/rag-query.mjs "council team status" | wc -l

# 4. 학습 검색
node ~/.jarvis/lib/rag-query.mjs "patterns discovered" | wc -l
```

**성능 최적화**:

```
- Embedding 모델 변경 (text-embedding-3-small → 필요시 larger)
- BM25 가중치 조정 (FTS 점수)
- 청킹 크기 조정 (현재 2000자)
```

---

## 전체 체크리스트

```bash
# Phase 1: 기초 정비
- [ ] SSoT 문서화 (sot-registry.md)
- [ ] Vault 폴더 구조 생성 (bash 스크립트)
- [ ] 기존 파일 마이그레이션
- [ ] Obsidian 설정 (수동)

# Phase 2: 자동화
- [ ] rag-watch.mjs 구현 + LaunchAgent 등록
- [ ] ask-claude.sh 개선 (--auto-context 플래그)
- [ ] record_insight 함수 추가

# Phase 3: 통합
- [ ] route-result.sh 개선 (--vault 플래그)
- [ ] Discord 메시지 저장 (daily-summary)
- [ ] Syncthing 설치 & 동기화 테스트

# Phase 4: 검증
- [ ] RAG 검색 품질 테스트
- [ ] 파일 감시자 안정성 (대량 파일 변경)
- [ ] Galaxy 동기화 확인
- [ ] 문서화 완료
```

