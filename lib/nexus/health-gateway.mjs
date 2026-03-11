/**
 * nexus/health-gateway.mjs — 시스템 상태 게이트웨이
 * 도구: health
 */

import { join } from 'node:path';
import { BOT_HOME, LOGS_DIR, mkResult, logTelemetry, runCmd, smartCompress } from './shared.mjs';

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
export const TOOLS = [
  {
    name: 'health',
    description:
      '시스템 전체 상태를 단일 호출로 요약. ' +
      'LaunchAgent 상태, 디스크, 메모리, 프로세스, 크론 최근 실행 포함. ' +
      '에러 하이라이트 + 프로세스 요약 포함.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function handle(name, args, start) {
  if (name !== 'health') return null;

  try {
  const checks = [
    `echo "=== LaunchAgents ==="`,
    `launchctl list ai.jarvis.discord-bot 2>/dev/null | grep -E 'PID|Exit' || echo "discord-bot: NOT LOADED"`,
    `launchctl list ai.jarvis.watchdog 2>/dev/null | grep -E 'PID|Exit' || echo "watchdog: NOT LOADED"`,
    `launchctl list ai.jarvis.rag-watcher 2>/dev/null | grep -E 'PID|Exit' || echo "rag-watcher: NOT LOADED"`,
    `launchctl list ai.jarvis.orchestrator 2>/dev/null | grep -E 'PID|Exit' || echo "orchestrator: NOT LOADED"`,
    `launchctl list ai.openclaw.glances 2>/dev/null | grep -E 'PID|Exit' || echo "glances: NOT LOADED"`,
    `echo "=== 리소스 ==="`,
    `df -h / | tail -1 | awk '{print "Disk: "$5" used ("$3"/"$2")"}'`,
    `vm_stat | awk '/Pages free/{free=$3} /Pages active/{act=$3} END{printf "Mem free: %.1fGB\\n", (free+0)*4096/1073741824}'`,
    `echo "=== 프로세스 ==="`,
    `ps aux | awk 'NR>1{split($11,a,"/"); name=a[length(a)]; cnt[name]++} END{n=asorti(cnt,sorted); for(i=1;i<=n&&i<=10;i++) printf "%s x%d\\n",sorted[i],cnt[sorted[i]]}' 2>/dev/null || echo "(ps 실패)"`,
    `echo ""`,
    `echo "Bot 프로세스:"`,
    `pgrep -fl "discord-bot.js" | head -3 || echo "  discord-bot.js: 실행중 아님"`,
    `pgrep -fl "claude.*-p" | head -3 || echo "  claude -p: 실행중 아님"`,
    `echo "=== 크론 최근 ==="`,
    `tail -5 "${join(LOGS_DIR, 'cron.log')}" 2>/dev/null || echo "(크론 로그 없음)"`,
    `echo "=== 상태 ==="`,
    `cat "${join(BOT_HOME, 'state', 'health.json')}" 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
for k,v in d.items():
    if k=='checks': continue
    print(f'{k}: {v}')
if 'checks' in d:
    fails=[c for c in d['checks'] if c.get('status')!='ok']
    if fails:
        print('\\n[!] 실패 체크:')
        for f in fails[:5]:
            print(f'  - {f.get(\"name\",\"??\")}: {f.get(\"status\",\"??\")}: {f.get(\"message\",\"\")}')
    else:
        print(f'체크 {len(d[\"checks\"])}개 모두 OK')
" 2>/dev/null || echo "(health.json 없음)"`,
    `echo "=== 네트워크/API ==="`,
    `curl -s --max-time 3 -o /dev/null -w "OpenAI API: %{http_code}" https://api.openai.com/v1/models 2>/dev/null || echo "OpenAI API: 연결 실패"`,
    `echo "=== 스토리지 ==="`,
    `df -i / | tail -1 | awk '{printf "inode: %s/%s (%s used)\\n",$3,$2,$5}'`,
    `du -sh "${LOGS_DIR}" 2>/dev/null | awk '{print "로그 디렉토리: "$1}'`,
  ];

  const { output } = await runCmd(checks.join(' ; '), 15000);
  const compressed = smartCompress(output, 60);
  logTelemetry('health', Date.now() - start, { checks_run: checks.length });
  return mkResult(compressed, { checks_run: checks.length });
  } catch (err) {
    logTelemetry('health', Date.now() - start, { error: err.message });
    return mkError(`헬스체크 실패: ${err.message}`, { checks_run: 0 });
  }
}
