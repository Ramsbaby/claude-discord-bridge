# Obsidian 진단 최종 요약

**진단 일시**: 2026-03-03
**상태**: ✅ 완료
**출력**: 2개 상세 문서 + 1개 요약

---

## 발견 사항 (3줄 요약)

| 항목 | 상태 | 이유 |
|------|------|------|
| **Obsidian Vault 현황** | ⚠️ 설치됨, 미운영 | workspace.json 최후 수정 2일 전, 일일 문서 없음 |
| **RAG 연동** | ⚠️ 부분 운영 | 크론 결과 ✅ 저장 + 인덱싱, 하지만 Vault 데이터 미포함 |
| **자율 진화 준비** | ❌ 불가능 | 에이전트 학습 미기록 → 다음 실행 때 재활용 불가 |

---

## 문제 분류

### A. 구조적 문제 (SSoT 위반)

**문제**: 정보 타입별 저장 위치 불명확

- 장기 지식: `~/jarvis-ai/` + `~/.jarvis/docs/` + `~/.claude/memory/` (3곳)
- 팀 정보: `~/.jarvis/rag/teams/` + `~/openclaw/memory/teams/` (2곳)
- 사용자 프로필: `~/.jarvis/context/owner/` (현재)

**영향**: 업데이트 시 "어느것을 수정할까?" 혼란

**해결**: SSoT 문서화 + 중복 제거

---

### B. 기능 문제 (정보 소실)

**문제**: 에이전트 학습이 자동 저장되지 않음

- 크론이 발견한 패턴 → memory.md 수동 입력만 가능
- RAG에 자동 학습 데이터 없음
- 다음 실행 때 "지난번엔 어땠지?" 참조 불가능

**영향**: 자율 진화 불가능 (기억이 남지 않음)

**해결**: auto-insights/ 디렉토리 + 자동 기록 기능

---

### C. 운영 문제 (연결 끊김)

**문제 1**: Vault → RAG 단방향

- 파일 수정 → LanceDB 반영 (✅ 매시간)
- 하지만 역방향 없음 → 이전 검색 결과 반영 안 됨

**문제 2**: 실시간 반영 안 됨

- 매시간 배치만 동작 (rag-index.mjs)
- 파일 감시자 없음 → 10분 동안 변경사항 미적용

**문제 3**: 대화 기록 미저장

- Discord 대화는 Discord 자체에만 저장
- RAG에 포함 안 됨 → 과거 대화 검색 불가

**영향**: "이번 달 어떤 패턴 있었는데..." 검색 불가능

**해결**: rag-watch.mjs (파일 감시자) + 대화 자동 저장

---

## 새 아키텍처 (4가지 핵심)

### 1. Vault 8계층 구조

```
~/Vault/jarvis-ai/
├── 01-system/        (아키텍처, 운영, 보안)
├── 02-daily/         (일일 결과)
├── 03-insights/      (에이전트 자동 학습) ← NEW
├── 04-decisions/     (의사결정 로그)
├── 05-teams/         (팀별 정보)
├── 06-knowledge/     (장기 지식)
├── 07-roadmap/       (로드맵)
└── 08-inbox/         (임시 처리)
```

**특징**: 정보 타입별 명확한 위치 → SSoT 가능

---

### 2. 자동화 파이프라인

```
크론 실행
  ↓
결과 저장 (results/)
  ↓
rag-watch.mjs 감지 (실시간)
  ↓
LanceDB 인덱싱 (1초 이내)
  ↓
ask-claude.sh --auto-context (다음 실행)
  ↓
RAG 검색 결과 자동 주입
  ↓
에이전트 응답
  ↓
auto-insights/ 자동 저장 ← NEW
  ↓
LanceDB 포함 (루프 완성)
```

**이점**: 정보가 자동으로 다음 실행에 활용됨

---

### 3. 정보 타입별 저장 명시

| 타입 | 위치 | 자동화 |
|------|------|--------|
| 크론 결과 | `~/.jarvis/results/` | ✅ |
| 에이전트 학습 | `~/.jarvis/rag/auto-insights/` | ✅ NEW |
| 사용자 정보 | `~/.jarvis/context/owner/` | ⚠️ |
| 시스템 정책 | `~/.jarvis/config/` | ✅ |
| 의사결정 | `~/.jarvis/rag/decisions.md` | ✅ |
| 대화 기록 | `~/.jarvis/context/discord-history/` | ✅ NEW |
| 팀 보고서 | `~/.jarvis/rag/teams/` | ✅ |
| 장기 지식 | `~/Vault/jarvis-ai/06-knowledge/` | ✅ |

---

### 4. Galaxy 동기화

```
Mac (~/Vault/jarvis-ai/)
       ↕ Syncthing
Galaxy (~/Vault/jarvis-ai/)
       ↕ Obsidian Android + chokidar
→ 모든 기기에서 최신 상태 유지
```

---

## 구현 로드맵

| 단계 | 기간 | 작업 | 우선순위 |
|------|------|------|---------|
| Phase 1 | 1주 | SSoT 정의 + Vault 구조 + Obsidian 설정 | 🔴 최고 |
| Phase 2 | 2주 | rag-watch.mjs + 자동 컨텍스트 + 학습 기록 | 🟠 높음 |
| Phase 3 | 1주 | 크론→Vault + Discord↔Vault + Galaxy 동기화 | 🟡 중간 |
| Phase 4 | 1주 | 검증 + 최적화 | 🟢 낮음 |

**총 5주 (병렬 가능 시 3주)**

---

## 기대 효과

### 구현 전 (현재)

```
크론 1 실행 → 저장 → 크론 2 실행 (이전 결과 미활용)
"지난번 TQQQ는?" → Discord 기록 검색 (RAG 못함)
에이전트 발견사항 → 수동 입력 필요
```

**문제**: 정보가 일회성, 자율 진화 불가능

---

### 구현 후 (목표)

```
크론 1 실행 → 저장 → RAG 1초 반영 → 크론 2 실행 (자동 컨텍스트)
"TQQQ 지난달 패턴?" → LanceDB 검색 → 답변
에이전트 발견사항 → 자동 저장 → 다음 크론에 활용
```

**이점**:
1. ✅ 정보 자동 재활용 (자율 진화)
2. ✅ 모든 대화 검색 가능 (지식 누적)
3. ✅ Galaxy에서도 접근 (운영 편의성)
4. ✅ 의사결정 추적 가능 (거버넌스)

---

## 다음 스텝

### 즉시 (이번 주)

1. **진단 검토 및 피드백**
   - SSoT 정의 맞는지 확인
   - Vault 위치 결정 (~/Vault vs 다른 곳)
   - Galaxy 동기화 방법 결정 (Syncthing vs 다른 것)

2. **Phase 1 시작 결정**
   - 우선순위 확인
   - 리소스 배분 (누가 구현?)
   - 데드라인 설정

### 이번 달

- Phase 1-2 완료 → 자동화 파이프라인 동작 시작
- Phase 3-4 → 최적화

### 장기 (분기별)

- **Level 1**: 기본 자동 저장 & 검색 (이번 계획)
- **Level 2**: 정보 품질 평가 & 가중치 조정 (2분기)
- **Level 3**: AI 기반 근본원인 분석 & 자동 수정 (3분기)

---

## 참고 문서

1. **obsidian-diagnosis-report.md** (28KB)
   - A. 현황 진단
   - B. 정보 흐름 맵핑
   - C. 문제점 상세 분석
   - D. 새 아키텍처 설계
   - E. Vault 폴더 구조 (트리)
   - F. 구현 로드맵

2. **implementation-guide.md** (20KB)
   - Phase 1-4 기술 상세 명세
   - rag-watch.mjs 구현 코드
   - ask-claude.sh 개선안
   - LaunchAgent 설정
   - 테스트 방법

3. **DIAGNOSIS-SUMMARY.md** (이 파일)
   - 3줄 요약 + 로드맵 + 체크리스트

---

## FAQ

**Q: Vault를 ~/Vault로 하면 혼란 아닌가?**
A: 명확함.
- 기존 ~/jarvis-ai/ = 설계 문서만
- 새 ~/Vault/jarvis-ai/ = 운영 Vault (SSoT)
- 심링크로 연결 가능

**Q: LanceDB 벡터 재계산 필요?**
A: 초기에만.
- 구현 후 → 월 1회 전체 리인덱싱 (배치)
- 일일은 증분만 (빠름)

**Q: Discord 대화를 모두 저장하면 용량?**
A: 관리 가능.
- 평문 마크다운 → 월 ~5MB
- 90일 회전 → ~15MB
- 압축 가능 → ~5MB

**Q: Syncthing 동기화 속도?**
A: 빠름.
- LAN: 1-5초
- 인터넷: 10-30초
- 충돌 해결 자동 (타임스탬프)

**Q: Obsidian 플러그인 안정성?**
A: 높음.
- obsidian-git: 2000+ ⭐
- templater: 1500+ ⭐
- dataview: 1200+ ⭐

---

## 체크리스트

### 진단 완료 확인

- [x] 현황 파악 (10개 항목 직접 확인)
- [x] 정보 흐름 맵핑 (6단계 × 9 타입)
- [x] 문제점 분류 (4개 카테고리)
- [x] 새 아키텍처 설계 (8계층 + 4가지 핵심)
- [x] 구현 로드맵 (4 Phase × 구체적 작업)
- [x] 기술 가이드 (rag-watch.mjs, ask-claude.sh, LaunchAgent)

### 의사결정 대기

- [ ] Vault 위치 승인
- [ ] Galaxy 동기화 방법 승인
- [ ] Phase 1 시작 시기 결정
- [ ] 담당자 배분

---

**진단 완료.**

