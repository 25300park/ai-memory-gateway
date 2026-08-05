# 헤드리스 코드 실행 결과 Merge 가이드 (Phase 12-5)

`pending_actions`의 `code_change_proposal`이 승인되어 헤드리스로 실행된 뒤, 그 결과(diff)를
실제로 main에 반영할지 사람이 안전하게 판단하고 merge하는 절차를 정리한다.

## 1. 지금까지의 흐름 요약

```
제안 (proposeAction)
  → 승인 (approveAction, status: pending → approved)
    → 헤드리스 실행 (POST /agent/actions/:id/execute-code, Phase 12-2/12-4)
        - 격리된 git worktree 생성
        - claude 또는 codex를 --dangerously-skip-permissions 계열 플래그로 헤드리스 실행
        - 실행 결과의 diff를 캡처해 pending_actions.diff_result에 저장
        - worktree는 삭제, 브랜치(exec-{id}-{timestamp})는 보존
        - status: approved → executed
```

**여기까지는 전부 자동이다.** main 브랜치는 이 과정에서 전혀 건드려지지 않는다 - 실행은
항상 격리된 worktree/브랜치 안에서만 일어난다.

**이 문서가 다루는 부분은 그다음이다: `executed` 상태의 diff를 사람이 확인하고,
merge할지 폐기할지 판단하는 절차.** 이 판단과 merge 자체는 자동화되어 있지 않다 -
의도적으로 사람이 하는 단계다.

## 2. diff 확인 방법

### 2.1 콘솔에서 먼저 훑어보기

콘솔의 "대기 중인 제안" 패널에서 `executed` 상태인 항목을 열면 `DiffViewer`로 diff를
바로 볼 수 있다. 변경 범위가 작고 명확하면 이 단계만으로 판단이 설 수도 있다.

### 2.2 merge 전, 로컬에서 브랜치를 직접 checkout해서 재확인

콘솔의 diff 뷰만으로는 파일 전체 맥락(주변 코드, import 관계 등)이나 실제 실행 결과까지
확인하기 어렵다. **실제로 merge하기 전에는 로컬에서 그 브랜치를 직접 checkout해서 눈으로
다시 확인하는 걸 권장한다:**

```bash
cd "D:\00. Ai_Memory_System\api"

# 원격에서 만들어진 브랜치라면 먼저 fetch (로컬 실행 결과라면 생략 가능)
git fetch

# exec- 브랜치 목록에서 대상 찾기
git log --all --oneline | grep exec-

# 해당 브랜치로 checkout
git checkout exec-{id}-{timestamp}
```

이 상태에서:
- 변경된 파일을 실제로 열어서 코드를 읽어본다.
- 필요하면 `npm test`, `npm run build` 등을 이 브랜치에서 직접 돌려본다.
- 이상이 없다고 판단되면 3단계로 진행한다.

확인이 끝나면 원래 브랜치로 돌아온다:

```bash
git checkout main
```

## 3. 확인 후 merge 방법 (권장 순서)

```bash
git checkout main
git merge --no-ff exec-{id}-{timestamp} -m "merge: apply approved code change from pending_action #{id}"
git push origin main
```

**`--no-ff`를 권장하는 이유:** fast-forward merge를 하면 헤드리스 실행으로 들어온 변경이
사람이 직접 커밋한 이력과 구분 없이 섞여버린다. `--no-ff`로 별도 merge 커밋을 남기면,
나중에 `git log`를 봤을 때 "이 변경은 pending_action #{id}에서 헤드리스 실행으로 들어온
것"이라는 게 한눈에 구분된다.

## 4. merge 후 정리

```bash
git branch -d exec-{id}-{timestamp}
```

그리고 `pending_actions`의 `status`를 `'merged'`로 수동 업데이트한다 (아직 이걸 위한
API가 없다 - merge 자체가 사람이 git으로 직접 하는 작업이라, 그 결과를 DB에 반영하는 것도
지금은 수동이다. 향후 Phase에서 "merge 완료 보고" API를 추가해 자동화하는 걸 검토할 수
있다):

```sql
UPDATE pending_actions SET status = 'merged' WHERE id = {id};
```

## 5. diff가 마음에 안 들 경우

merge하지 않아도 된다. main은 애초에 이 과정 동안 전혀 영향을 받지 않았으므로, 그냥
브랜치를 남겨두거나 삭제하면 끝이다:

```bash
git branch -D exec-{id}-{timestamp}
```

(참고: 아직 merge 안 된 브랜치를 지우는 것이므로 `-d`가 아니라 대문자 `-D`로 강제
삭제해야 한다 - git이 "merge 안 된 브랜치"라고 경고하며 소문자 `-d`는 거부한다.)

`pending_actions`의 `status`를 `'executed'`로 그대로 둘지, `'rejected'` 등으로 별도
표시할지는 아직 정해진 규칙이 없다 - 필요하면 review_note에 폐기 사유를 남기는 정도로
충분하다.
