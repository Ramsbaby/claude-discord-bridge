# Obsidian Auto-Sync 설정 가이드

> 현재 상태: 수동 sync만 가능 (자동 sync 미구현)
> 목표: `~/claude-discord-bridge/rag/` ↔ Obsidian Vault 자동 동기화

## 현재 Vault 구조

```
~/vault/ai-bot/    # 장기 기억 (RAG 인덱싱됨)
~/vault/ai-bot-docs/ # 봇 설계 문서
```

## obsidian-git 플러그인 설치 (권장)

1. Obsidian → Settings → Community plugins → Browse
2. "obsidian-git" 검색 → Install → Enable
3. 설정:
   - Auto pull interval: 10분
   - Auto commit & push: 활성화
   - Commit message: `vault backup: {{date}}`

## 대안: iCloud Drive 활용

Obsidian Vault를 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/` 으로 이동하면:
- Mac ↔ iPhone ↔ iPad 자동 sync
- Galaxy와는 연동 불가 (iCloud 미지원)

## Galaxy 동기화가 필요한 경우

- **Syncthing** (오픈소스): Mac ↔ Galaxy 파일 동기화
  ```bash
  brew install syncthing
  ```
- Obsidian Android 앱 + Syncthing으로 완전 크로스플랫폼 가능

## RAG 연동 현황

- `~/claude-discord-bridge/rag/` → rag-index.mjs가 매시간 자동 인덱싱 ✅
- Obsidian에서 수정 → 다음 정시에 RAG 자동 반영 ✅
- 실시간 반영 필요 시: `BOT_EXTRA_MEMORY` 환경변수로 외부 경로 추가 가능

## 외부 메모리 디렉토리 연동 (선택사항)

별도 메모리 저장소(예: Obsidian Vault)를 RAG에 포함하려면 `.env`에 추가:

```env
BOT_EXTRA_MEMORY=/path/to/your/memory/directory
```

`bin/rag-index.mjs`가 해당 경로의 `.md` 파일을 자동 인덱싱합니다.
