# 팀 세션 종료 절차 (재발 방지 가이드)

## 문제
팀 리더 세션이 종료될 때 멤버 에이전트들이 자동으로 정리되지 않아
수백 MB씩 메모리를 점유하는 좀비 프로세스가 발생함.

## 올바른 종료 순서

### ✅ 정상 종료 (리더가 살아있을 때)
```
1. SendMessage (type: shutdown_request) → 각 멤버에게 전송
2. 멤버들의 shutdown_response 수신 확인
3. TeamDelete 호출
```

### 🛠️ 강제 정리 (리더가 이미 죽었을 때)
```bash
# 특정 팀 정리
~/.jarvis/bin/kill-team.sh <team-name>

# 전체 잔여 에이전트 정리
~/.jarvis/bin/kill-team.sh --all
```

## 확인 명령
```bash
# 현재 살아있는 팀 에이전트 목록
ps axo pid,lstart,command | grep 'team-name' | grep -v grep

# 특정 팀 확인
ps axo pid,command | grep 'team-name <팀이름>' | grep -v grep
```

## 팀 사용 후 체크리스트
- [ ] 모든 태스크 completed 처리
- [ ] SendMessage shutdown_request → 모든 멤버
- [ ] shutdown_response 수신 확인
- [ ] TeamDelete 호출
- [ ] `ps axo command | grep team-name` 로 잔여 없음 확인

## 참고
- 팀 디렉토리: `~/.claude/teams/<team-name>/`
- 생성된 팀이 많으면 주기적으로 `~/.claude/teams/` 정리 권장
- kill-team.sh 위치: `~/.jarvis/bin/kill-team.sh`
