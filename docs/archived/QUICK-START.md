# Obsidian 자율 진화 시스템 — 빠른 시작 가이드

**대상**: 구현자 (개발자) 및 운영자
**작성**: 2026-03-03
**상태**: 구현 준비 대기

---

## 📌 3분 요약

| 항목 | 현재 | 목표 |
|------|------|------|
| **Obsidian Vault** | 설치됨, 미운영 | 운영 중 |
| **RAG 반영 시간** | 1시간 | 1초 |
| **에이전트 학습** | 수동 입력 | 자동 저장 |
| **정보 검색** | 부분 | 전체 |
| **Galaxy 접근** | 불가 | 가능 |

---

## 🚀 3주 로드맵 (병렬 구현 기준)

```
Week 1
├─ Phase 1: Vault 구조 + Obsidian 설정 (1명, 1주)
├─ Phase 2a: rag-watch.mjs 개발 (1명, 1주)
└─ 병렬: 기존 파일 마이그레이션 (자동화)

Week 2
├─ Phase 2b: ask-claude.sh 개선 (1명, 3일)
├─ Phase 2c: record_insight 함수 (1명, 3일)
└─ Phase 3a: 크론→Vault 연결 (1명, 3일)

Week 3
├─ Phase 3b: Galaxy 동기화 (Syncthing) (1명, 2일)
├─ Phase 4: 검증 & 테스트 (1명, 3일)
└─ 배포 & 문서화 (1명, 2일)

완료: 자율 진화 시스템 운영 시작 ✅
```

---

## 📋 구현 체크리스트

### Phase 1: 기초 (1주)

**관리 항목**:
```bash
[ ] Vault 폴더 생성 (~/Vault/jarvis-ai/)
[ ] 기존 파일 마이그레이션
[ ] Obsidian 설치 및 설정
[ ] git 초기화 (~/Vault/jarvis-ai/)
[ ] SSoT 문서화 (sot-registry.md)
```

**명령어**:
```bash
# Vault 생성 (스크립트 실행)
bash ~/.jarvis/scripts/setup-vault.sh

# 기존 파일 마이그레이션
cp ~/jarvis-ai/architecture.md ~/Vault/jarvis-ai/01-system/architecture/

# Obsidian 열기 (수동)
# Settings → Community plugins → obsidian-git, templater 설치
```

---

### Phase 2a: rag-watch.mjs 개발 (2명, 1주)

**담당**: Backend 개발자

**필수 구현**:
1. `~/.jarvis/lib/rag-watch.mjs` (400줄)
   - chokidar 기반 파일 감시
   - 1초 디바운스
   - LanceDB 인덱싱

2. LaunchAgent 등록
   ```xml
   ~/.config/launchd/ai.jarvis.rag-watch.plist
   ```

3. 테스트
   ```bash
   # 파일 변경 → 1초 내 로그 확인
   echo "Test" > ~/.jarvis/rag/auto-insights/test.md
   tail -f ~/.jarvis/logs/rag-watch.log
   ```

**코드 위치**: `/Users/ramsbaby/.jarvis/docs/implementation-guide.md` (F2-1 섹션)

---

### Phase 2b: ask-claude.sh 개선 (1명, 3일)

**담당**: CLI 개발자

**수정 항목**:
1. `--auto-context` 플래그 추가
2. RAG 쿼리 함수 통합
3. 동적 정보 주입 (state/, logs/)

**함수 구현**:
```bash
# 추가할 함수들
query_rag()      # LanceDB 검색
get_dynamic_info() # API 사용률, 팀 상태
inject_context() # 프롬프트 조합
```

**테스트**:
```bash
ask-claude.sh tqqq-monitor --auto-context
# 프롬프트에 "Auto-Context from RAG" 섹션 있는지 확인
```

---

### Phase 2c: record_insight 함수 (1명, 3일)

**담당**: CLI 개발자

**필수 구현**:
1. `ask-claude.sh --record-insight` 플래그
2. 응답에서 패턴/최적화 추출
3. auto-insights/ 자동 저장

**파일 구조**:
```
~/.jarvis/rag/auto-insights/
├── 2026-03-03-tqqq-patterns.md
├── 2026-03-03-tqqq-optimizations.md
└── 2026-03-03-cross-team-insights.md
```

**테스트**:
```bash
ask-claude.sh tqqq-monitor --record-insight
ls -la ~/.jarvis/rag/auto-insights/
# 최신 파일 확인
```

---

### Phase 3a: 크론→Vault 연결 (1명, 3일)

**담당**: Ops 엔지니어

**수정**: `route-result.sh`

```bash
# 추가 플래그
route-result.sh tqqq-monitor "results.md" "webhook" --vault

# 구현
save_to_vault()  # results/ → Vault/02-daily/ 복사
git_commit()     # 자동 커밋 (obsidian-git 연동)
```

---

### Phase 3b: Galaxy 동기화 (1명, 2일)

**담당**: Ops 엔지니어

**설치**:
```bash
# Mac
brew install syncthing
brew services start syncthing

# Galaxy (수동)
# Syncthing 앱 설치 → 폴더 추가 허용
```

**설정** (Web UI: http://localhost:8384):
1. Device 추가 (Galaxy)
2. Folder 공유 (~/Vault/jarvis-ai/)
3. Auto start 활성화

**테스트**:
```bash
# Mac에서 파일 작성
echo "Test from Mac" > ~/Vault/jarvis-ai/08-inbox/test.md

# Galaxy에서 확인 (30초 내)
# + Galaxy에서 파일 작성
# Mac에서 수신 확인
```

---

### Phase 4: 검증 (1명, 3일)

**담당**: QA 엔지니어

**체크리스트**:

```bash
[ ] RAG 검색 품질
    node ~/.jarvis/lib/rag-query.mjs "tqqq trends"
    # 결과 10개 이상, 관련도 높음 확인

[ ] 파일 감시자 안정성
    # 대량 파일 생성/변경
    for i in {1..100}; do
      echo "Test $i" > ~/.jarvis/rag/auto-insights/test-$i.md
    done
    # 1분 내 모두 인덱싱되는지 확인

[ ] 자동 컨텍스트 주입
    ask-claude.sh tqqq-monitor
    # 프롬프트에 auto-context 포함 확인

[ ] 학습 기록
    ask-claude.sh tqqq-monitor --record-insight
    # auto-insights/ 파일 생성 확인

[ ] Galaxy 동기화
    # Mac에서 파일 작성 → Galaxy에서 30초 내 확인
    # Galaxy에서 파일 수정 → Mac에서 30초 내 반영

[ ] 성능
    # RAG 쿼리 응답: < 1초
    # 파일 감시자 지연: < 1초
    # 크론 실행 시간: + 5초 이내
```

**문서화**:
```bash
[ ] README.md 갱신 (Vault 구조)
[ ] ROADMAP.md 업데이트 (완료 항목 표시)
[ ] runbook.md 작성 (운영 가이드)
```

---

## 🔧 기술 참고

### 핵심 파일

| 파일 | 변경 | 신규 |
|------|------|------|
| ask-claude.sh | ✏️ --auto-context 추가 | |
| route-result.sh | ✏️ --vault 플래그 추가 | |
| discord-bot.js | ✏️ 메시지 저장 | |
| | | 🆕 rag-watch.mjs (400줄) |
| | | 🆕 rag-query.mjs (100줄) |
| | | 🆕 record-insight.mjs (150줄) |

### 의존성 (신규)

```bash
# Node.js 패키지
npm install chokidar        # 파일 감시
npm install @lancedb/lancedb # 이미 있음
npm install openai          # 이미 있음

# 시스템 도구
brew install syncthing      # Galaxy 동기화
# (Obsidian 플러그인은 수동 설치)
```

### 로그 파일

```
~/.jarvis/logs/rag-watch.log          ← 파일 감시자
~/.jarvis/logs/rag-index.log          ← 인덱싱 (기존)
~/.jarvis/logs/ask-claude-*.log       ← 크론 실행 (기존)
```

---

## 🐛 예상 이슈 & 대응

| 이슈 | 원인 | 해결 |
|------|------|------|
| rag-watch.mjs 실행 안 됨 | LaunchAgent 미등록 | `launchctl load ...` |
| RAG 검색 결과 없음 | Vault 파일 미인덱싱 | `rag-watch.log` 확인 |
| Galaxy 동기화 느림 | WiFi 불안정 | Syncthing 로그 확인 |
| 크론 타임아웃 | 자동 컨텍스트 과다 | RAG max-context 감소 |
| Obsidian 충돌 | 동시 수정 | obsidian-git 설정 (타임스탬프 우선) |

---

## 📊 비용 & 성능

### 추가 비용
- **$0**: Claude Max 이미 지불 중
- **$0**: Syncthing (오픈소스)
- **$0**: chokidar, obsidian-git (오픈소스)

### 성능 영향
- RAG 인덱싱: 기존 1시간 → 1초 (60배 빨라짐)
- 크론 실행 시간: + 5초 (컨텍스트 주입)
- 디스크 사용: + ~100MB (3개월 데이터, 압축 가능)

### 신뢰성
- rag-watch.mjs: 파일 감시만 (99.9% uptime 예상)
- LanceDB: 이미 안정적 운영 중
- Syncthing: 수천 개 프로젝트 사용 (안정)

---

## 💬 FAQ (개발자용)

**Q: ask-claude.sh에 `--auto-context` 추가하면 호환성 깨질까?**
A: 아니요, 플래그 선택사항. 기존 사용 방식 유지 가능.

**Q: rag-watch.mjs가 메모리 많이 먹을까?**
A: 아니요, chokidar는 가벼움. 감시 패턴 최소화됨.

**Q: LanceDB에 저장된 벡터 재계산?**
A: 초기에만. 이후 증분 인덱싱.

**Q: 충돌 시 어느 버전 유지?**
A: Syncthing의 타임스탐프 방식 (최신 우선).

**Q: Obsidian 수동 업데이트 필요한가?**
A: 한 번만 (초기 설정). 이후 자동 동기화.

---

## 📞 연락처

- **Vault 구조 & Obsidian**: [담당자]
- **rag-watch.mjs 개발**: [담당자]
- **ask-claude.sh 개선**: [담당자]
- **Galaxy 동기화**: [담당자]
- **QA & 검증**: [담당자]

---

## 다음 스텝

1. ✅ 진단 완료 (2026-03-03)
2. ⏳ 의사결정 (Vault 위치, 동기화 방법, 시작 시기)
3. ⏳ Phase 1 시작 (승인 후)
4. ⏳ 3주 구현 (병렬)
5. ⏳ 배포 & 문서화

---

**의견**: 이 가이드로 충분한가? 부족한 부분 있으면 알려주세요.

