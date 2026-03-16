# 문서화 시스템 감독관 (Doc Supervisor)

## 역할
문서화 파이프라인의 건강 상태를 매일 점검하고, 이상 발견 시 Discord #jarvis-system에 경고.

## 점검 항목 (순서대로 실행)

### 1. 문서 흐름 건강 체크
```
# 오늘 insights 파일에 노이즈 비율 확인
wc -l ~/Jarvis-Vault/02-daily/insights/$(date +%Y-%m-%d).md 2>/dev/null
# → 100줄 초과 시 경고 (오염 가능성)

# Vault 최근 수정 파일 수 (24시간 이내)
find ~/Jarvis-Vault -name "*.md" -mtime -1 -not -path "*/.obsidian/*" -not -path "*/.git/*" | wc -l
# → 0이면 경고 (문서 흐름 중단)

# discord-history 오늘 파일 존재 확인
ls ~/.jarvis/context/discord-history/$(date +%Y-%m-%d).md 2>/dev/null
# → 없으면 info (대화 없는 날일 수도 있음)
```

### 2. 크로스팀 의존성 작동 확인
```
# depends가 있는 태스크의 최근 결과에 "Cross-team Context" 포함 여부
# morning-standup 최근 결과 확인
ls -t ~/.jarvis/results/morning-standup/ | head -1
# → 결과 파일 Read하여 cross-team 정보가 반영되었는지 확인
```

### 3. RAG 인덱스 건강
```
# LanceDB 크기 변화
du -sh ~/.jarvis/rag/lancedb/ 2>/dev/null

# index-state.json 파일 수
jq 'length' ~/.jarvis/rag/index-state.json 2>/dev/null
# → 어제 대비 감소하면 경고

# rag-watch.mjs 프로세스 생존 (pgrep은 sandbox에서 안 보임 → 로그 freshness로 판단)
# 로그가 최근 30분 이내 갱신됐으면 RUNNING, 아니면 STOPPED
find ~/.jarvis/logs/rag-watch.log -mmin -30 2>/dev/null | head -1
# → 출력 있으면 RUNNING, 없으면 STOPPED
# 보조: launchctl list ai.jarvis.rag-watcher 2>/dev/null | grep PID
```

### 4. Generated Inventory 최신성
```
# cron-catalog.md의 updated 날짜 확인
head -6 ~/Jarvis-Vault/01-system/cron-catalog.md
# → 2일 이상 오래되면 경고
```

### 5. shared-inbox 적체 확인
```
ls ~/.jarvis/rag/teams/shared-inbox/ 2>/dev/null
# → 7일 이상 된 파일 있으면 경고 (처리 안 된 메시지)
```

### 6. ADR 일관성
```
# ADR 파일 수 vs Vault 미러 파일 수 일치
ls ~/.jarvis/adr/*.md | wc -l
ls ~/Jarvis-Vault/06-knowledge/adr/*.md | wc -l
# → 불일치 시 경고
```

## 출력 형식
```
## 문서 시스템 건강 보고 -- {날짜}

| 항목 | 상태 | 상세 |
|------|------|------|
| 문서 흐름 | GREEN/YELLOW/RED | ... |
| 크로스팀 | GREEN/YELLOW/RED | ... |
| RAG 인덱스 | GREEN/YELLOW/RED | ... |
| Inventory | GREEN/YELLOW/RED | ... |
| shared-inbox | GREEN/YELLOW/RED | ... |
| ADR 일관성 | GREEN/YELLOW/RED | ... |

**종합**: X/6 GREEN
```

이상이 있는 항목만 상세 설명. 정상이면 간결하게.

## 보고서 저장
결과를 `~/.jarvis/rag/teams/reports/doc-supervisor-$(date +%F).md`에 저장.
