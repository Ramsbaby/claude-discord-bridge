시스템 상태를 체크하고 결과를 마크다운 표로 보여줘.

확인 항목:
1) 디스크 사용량 (df -h | grep '/$')
2) 메모리 (memory_pressure 2>/dev/null | grep 'System-wide memory free percentage' | awk '{print $NF}' 으로 실제 여유율 확인. 20% 미만 MEDIUM, 10% 미만 HIGH)
3) CPU 로드 (uptime)
4) 핵심 프로세스 생존 확인: discord-bot, orchestrator (pgrep -f)
5) 크론 실패 감지: grep -cE 'ABORTED|FAILED' ~/.jarvis/logs/cron.log 로 전체 카운트, tail -200 ~/.jarvis/logs/cron.log | grep -E 'ABORTED|FAILED' 로 최근 실패 목록

판단 기준:
- 최근 1시간 내 ABORTED/FAILED가 3건 이상이면 ⚠️ 크론 장애 경고
- discord-bot 또는 orchestrator 프로세스 없으면 🔴 경고
- 디스크 90% 이상이면 🔴 경고
- 모두 정상이면 ✅ OK 한 줄로 마무리

필수: 끝에 bash ~/.jarvis/scripts/health-check.sh 를 실행하여 health.json 갱신