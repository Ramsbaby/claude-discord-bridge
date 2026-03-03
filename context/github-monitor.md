# GitHub Monitor

## 목적
매시 정각 GitHub 알림을 확인하여 새로운 이슈, PR, 멘션 등을 요약한다.

## 주의사항
- `gh api notifications` 명령어 사용 (gh CLI 인증 필요)
- 알림이 없으면 간단히 'GitHub: 알림 없음' 출력
- 과도한 출력 지양, 제목 위주로 요약
