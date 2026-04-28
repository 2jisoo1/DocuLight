# 계획: 관리자 페이지 3대 이슈 수정 (모달화 / PW 검증 / 잠금 해제)

- **run-id**: 2026-04-28-admin-fixes
- **mode**: NORMAL (snoworca-planner v2.2.1)
- **소스 분석**:
  - `docs/analysis/2026-04-28.admin-password-modal.md`
  - `docs/analysis/2026-04-28.password-length-validation-bug.md`
  - `docs/analysis/2026-04-28.account-unlock-not-working.md`

---

## 1. 개요

DocLight 관리자 페이지에서 보고된 3가지 결함을 수정한다.

| REQ-ID | 요구사항 | 사용자 지시 |
|---|---|---|
| REQ-MODAL-001 | 관리자 페이지의 ID/PW 변경 UI를 별도 모달로 분리 (옵션 A: 독립 PW 변경 모달) | 사용자가 명시적으로 "옵션 A 권장" 선택 |
| REQ-PWVAL-001 | 패스워드 8자 이상 입력 시에도 "8자 이상" 에러가 발생하는 버그 수정 | **TDD 강제** |
| REQ-UNLOCK-001 | 어드민의 "잠금 해제" 버튼이 실제로 UI에 반영되지 않는 문제 수정 (분석문서 모든 수정 제안 수용) | — |

**핵심 정책**: 사용자 명령에 의해 **세 작업 모두 TDD 강제**. 모든 TASK는 RED → GREEN → REFACTOR 순서로 진행하며, 실패하는 테스트가 먼저 작성·확인된 후에만 production 코드를 작성한다.

**feasibility 요약**: 전 항목 Low. 외부 의존성·스키마 변경 없음. 기존 모달/userStore/AdminAPI 자산 재사용.

---

## 2. 선행 조건 및 전제

- Node 18+ (Node 내장 `node:test` 모듈 사용을 위해)
- `npm install` 완료 상태
- `data/users.json` 백업 (잠금 해제 테스트 중 실서비스 데이터 손상 방지)
- 개발 서버 정지 후 작업 (어드민 페이지 핫스왑 동작 확인을 위해 `npm run dev` 사용)
- 기존 어드민 superuser 계정 1개 이상 존재

---

## 3. 프로젝트 온보딩 컨텍스트 (주니어 필수)

### 이 프로젝트는 무엇인가
DocLight는 Express + EJS 기반 마크다운 문서 뷰어/매니저다. 어드민 페이지(`/admin`)는 사용자·그룹·트리·인증 설정을 관리한다. 프론트는 vanilla JS 모듈 패턴(클래스/객체 리터럴), 백엔드는 컨트롤러-라우트-스토어 3계층이다. 데이터는 JSON 파일(`data/users.json` 등)에 영속화된다.

### 주요 디렉토리 맵
| 경로 | 역할 |
|---|---|
| `src/views/admin.ejs` | 어드민 페이지 HTML (모달 컨테이너 정의) |
| `src/views/partials/` | EJS partial들 |
| `public/js/admin.js` | 어드민 페이지 프론트엔드 로직 (`ManagementModule` 객체에 모든 탭 메서드 집중) |
| `public/css/admin.css` | 어드민 스타일 (`.modal`, `.modal-content`, `.mgmt-*` 클래스) |
| `src/controllers/admin/admin-user-controller.js` | 사용자 CRUD/리셋/잠금해제 백엔드 |
| `src/stores/user-store.js` | users.json 영속화, 로그인 실패 카운터, `resetFailedLogin()` |
| `test/` | bare Node 스크립트 테스트. 본 계획에서는 **`node:test` 기반 신규 테스트 추가** |

### 핵심 규칙 / 절대 금지
- **루트 `CLAUDE.md` 4대 원칙 준수**: ① 가정 금지·모호하면 질문 ② 단순성 우선 ③ 외과적 변경 (요청 외 코드 수정 금지) ④ 검증 가능한 성공 기준
- **EJS 파일 수정 시 escape 일관성** — 기존 `<%= %>`/`<%- %>` 사용 패턴 따라가기
- **users.json 직접 편집 금지** — 항상 userStore API 경유
- **테스트 없이 production 코드 작성 금지** (이 계획에 한해 TDD 강제)

### 빌드·테스트 명령어 치트시트
```bash
npm install                  # 의존성 설치
npm run dev                  # nodemon 개발 서버 (http://localhost:3000)
node --test test/admin-*.test.js   # node:test 기반 신규 테스트 실행
node test/phase0-1-dependencies.test.js   # 기존 bare 테스트 실행 예시
```

### 참고 문서 링크
- 루트 `CLAUDE.md`
- `docs/analysis/2026-04-28.*.md` (3개 분석 문서)
- 기존 모달 패턴: `src/views/admin.ejs:99-189` (Rename/Delete/Create/Unsaved/Conflict 모달)

### 도움 요청 경로
막힐 시 분석 문서(`docs/analysis/2026-04-28.*.md`) 먼저 재확인 → 기존 모달 5종(`#rename-modal`, `#delete-modal` 등)의 open/close 패턴을 grep하여 따라하기.

---

## 4. AI 에이전트 실행 가드

### 4.1 scope_freeze + change_log

```yaml
scope_freeze: false
change_log: []
```

(최종 출력 직전 `true`로 승격)

### 4.2 pre_commit_gate

```yaml
pre_commit_gate:
  - {shell: "bash", cmd: "node --test test/admin-password-validation.test.js", expected_exit: 0, stdout_regex: "pass [1-9]"}
  - {shell: "pwsh", cmd: "node --test test/admin-password-validation.test.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --test test/admin-unlock-user.test.js", expected_exit: 0, stdout_regex: "pass [1-9]"}
  - {shell: "pwsh", cmd: "node --test test/admin-unlock-user.test.js", expected_exit: 0}
  - {shell: "bash", cmd: "node -e \"require('./src/views/admin.ejs')\" 2>&1 || node -e \"const ejs=require('ejs'),fs=require('fs');ejs.compile(fs.readFileSync('src/views/admin.ejs','utf8'));console.log('EJS_OK')\"", expected_exit: 0, stdout_regex: "EJS_OK"}
  - {shell: "pwsh", cmd: "node -e \"const ejs=require('ejs'),fs=require('fs');ejs.compile(fs.readFileSync('src/views/admin.ejs','utf8'));console.log('EJS_OK')\"", expected_exit: 0}
  - {shell: "bash", cmd: "node -c public/js/admin.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node -c public/js/admin.js", expected_exit: 0}
```

### 4.3 forbidden_patterns

```yaml
forbidden_patterns:
  - "적절히|필요 시|알아서|상황에 맞게|기존 방식대로|어떻게든"
  - {pattern: "probably|should work|I think|maybe", flags: "i"}
  - "TODO(?!:)"
  - "prompt\\([^)]*\\)\\s*;?\\s*if"
```

(마지막 패턴은 본 수정 후 `prompt()` 결과를 trim 없이 즉시 검증하는 코드의 재유입 방지용)

---

## 5. Phase 1 — 패스워드 길이 검증 버그 (TDD 강제)

### 목표
`prompt()` 및 input value의 trim 누락으로 인한 길이 검증 불일치 제거. **반드시 TDD**: 먼저 실패하는 테스트를 작성하고, 테스트가 RED 상태임을 확인한 뒤 구현.

### 선행 조건
- Phase 0 (없음, 본 Phase가 시작점)

### TASK 목록

---

#### TASK-P1-001 — [RED] 패스워드 trim 검증 실패 테스트 작성

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P1-001 |
| 관련 REQ-ID | REQ-PWVAL-001 |
| 파일 경로 | `test/admin-password-validation.test.js` (신규) |
| 메서드/함수 시그니처 | N/A — 테스트 파일 (`node:test` describe/it 구조) |
| 참고 패턴 | 기존 `test/phase0-1-dependencies.test.js`의 console.log 스타일이 아닌, **신규 패턴**으로 `node:test` 사용 (Node 18+ 내장) |
| source_anchors | `["N/A — 신규"]` |
| 구현 가이드 | 1) `const test = require('node:test'); const assert = require('node:assert');` 임포트 2) `test('validatePasswordLength: trim 후 8자 이상 통과', ...)` — `validatePasswordLength('  12345678  ')`가 true를 반환해야 함 (현재는 false 또는 미존재 → 실패) 3) `test('validatePasswordLength: trim 후 7자 거부', ...)` — `'  abcdefg  '` (trim 후 7자) → false 4) `test('validatePasswordLength: null/undefined 거부', ...)` 5) **테스트 대상 함수 `validatePasswordLength`는 아직 미존재** — `require('../src/utils/password-validator')` 시점에 모듈 미존재로 실패해야 정상 (RED) |
| Rationale | 단일 검증 헬퍼를 backend/frontend 양쪽에서 공유하기 위해 `src/utils/password-validator.js`로 추출. 그래야 frontend `prompt().trim()` 누락 시에도 backend가 trim 후 검증하여 이중 안전망. 테스트는 헬퍼 자체 단위 테스트만으로 1차 게이트. |
| 함정 / 주의사항 | `node:test`는 Node 18+ 필수. 본 프로젝트 package.json에 engines 명시 없음 → README/CLAUDE.md에 메모하지 말고 본 계획 메타에만 기록. |
| 테스트 작성 지침 | 최소 시나리오 ① trim 후 8자 정확 → pass ② trim 후 7자 → reject ③ null → reject ④ 공백만 100자 → reject (trim 후 0자) ⑤ 9자 비공백 → pass |
| 검증 명령어 | `node --test test/admin-password-validation.test.js` → **실패해야 정상 (RED)** |
| acceptance_tests | `[{"shell":"bash","cmd":"node --test test/admin-password-validation.test.js","expected_exit":1,"stderr_regex":"Cannot find module|MODULE_NOT_FOUND"},{"shell":"pwsh","cmd":"node --test test/admin-password-validation.test.js","expected_exit":1}]` |
| DoD | 테스트 파일 존재, `node --test` 실행 시 모듈 미존재로 5/5 fail (RED 확인) |
| rollback | `{"strategy":"file-delete","command":"rm test/admin-password-validation.test.js"}` |
| 예상 소요 | 30분 |

---

#### TASK-P1-002 — [GREEN] `password-validator` 헬퍼 구현

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P1-002 |
| 관련 REQ-ID | REQ-PWVAL-001 |
| 파일 경로 | `src/utils/password-validator.js` (신규) |
| 메서드/함수 시그니처 | `function validatePasswordLength(pw, minLength = 8): boolean` / `module.exports = { validatePasswordLength, MIN_PASSWORD_LENGTH: 8 }` |
| 참고 패턴 | `src/utils/activity-logger.js` 등 기존 utils의 `module.exports = { ... }` 패턴 따라가기 |
| source_anchors | `["src/utils/activity-logger.js:1-30"]` (모듈 export 스타일 참조) |
| 구현 가이드 | 1) `if (typeof pw !== 'string') return false;` 2) `const trimmed = pw.trim();` 3) `return trimmed.length >= minLength;` (단순 명료) |
| Rationale | trim 후 길이 검증을 단일 함수로 제공하여 frontend·backend 양쪽이 동일 의미론을 공유. 이중 검증으로 frontend 우회 시도 차단. |
| 함정 / 주의사항 | `pw.trim()` 호출 전 typeof 체크 필수 — null/undefined에서 TypeError 방지. ASCII 공백 외 유니코드 공백(`\u3000` 등)도 trim 대상이 됨에 유의 (의도된 동작). |
| 테스트 작성 지침 | TASK-P1-001의 테스트가 모두 GREEN으로 전환되어야 함 |
| 검증 명령어 | `node --test test/admin-password-validation.test.js` → 5/5 pass |
| acceptance_tests | `[{"shell":"bash","cmd":"node --test test/admin-password-validation.test.js","expected_exit":0,"stdout_regex":"# pass [5-9]\|# pass 1[0-9]"},{"shell":"pwsh","cmd":"node --test test/admin-password-validation.test.js","expected_exit":0}]` |
| DoD | 5개 테스트 케이스 전부 pass, exit 0 |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 20분 |

---

#### TASK-P1-003 — [GREEN] backend 컨트롤러에 헬퍼 적용

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P1-003 |
| 관련 REQ-ID | REQ-PWVAL-001 |
| 파일 경로 | `src/controllers/admin/admin-user-controller.js` (수정) |
| 메서드/함수 시그니처 | 기존 `createUser(req,res)`, `resetPassword(req,res)` 시그니처 불변 — 내부 검증만 헬퍼로 교체 |
| 참고 패턴 | 동일 파일 line 32, 160의 기존 `password.length < 8` 검증을 `!validatePasswordLength(password)`로 치환 |
| source_anchors | `["src/controllers/admin/admin-user-controller.js:32", "src/controllers/admin/admin-user-controller.js:160-164"]` |
| 구현 가이드 | 1) 파일 상단에 `const { validatePasswordLength } = require('../../utils/password-validator');` 추가 2) line 32: `if (!password \|\| password.length < 8)` → `if (!validatePasswordLength(password))` 3) line 160: 동일 치환 (변수명 `newPassword`) 4) 에러 메시지·코드 그대로 유지 |
| Rationale | 검증 로직 단일화. 이후 정책 변경(예: 12자) 시 한 곳만 수정. |
| 함정 / 주의사항 | `password`가 undefined일 때 `validatePasswordLength`가 typeof 체크로 false 반환하므로 기존 `!password` 체크는 **제거**해도 동등. 단, 명시성을 위해 그대로 둬도 무방 — 본 계획에서는 가독성 위해 `!validatePasswordLength(password)` 단독으로 단순화. |
| 테스트 작성 지침 | 추가 테스트 파일 불필요. TASK-P1-001의 단위 테스트가 헬퍼를 검증하므로 컨트롤러는 통합 테스트 대신 manual verification으로 cover. (요구사항 외 테스트 인프라 추가 금지 — CLAUDE.md §단순성) |
| 검증 명령어 | `node --test test/admin-password-validation.test.js && node -c src/controllers/admin/admin-user-controller.js` |
| acceptance_tests | `[{"shell":"bash","cmd":"node --test test/admin-password-validation.test.js","expected_exit":0},{"shell":"bash","cmd":"node -c src/controllers/admin/admin-user-controller.js","expected_exit":0},{"shell":"pwsh","cmd":"node -c src/controllers/admin/admin-user-controller.js","expected_exit":0}]` |
| DoD | 컨트롤러 syntax check pass, password-validator 테스트 5/5 pass, grep으로 `password.length < 8` 잔존 0건 |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 15분 |

---

#### TASK-P1-004 — [GREEN] frontend admin.js 3개소 trim 적용

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P1-004 |
| 관련 REQ-ID | REQ-PWVAL-001 |
| 파일 경로 | `public/js/admin.js` (수정) |
| 메서드/함수 시그니처 | N/A — inline handler 내 변수 추출만 변경 |
| 참고 패턴 | 동일 파일 `email = ...value.trim()` (1861줄) 스타일 따라가기 |
| source_anchors | `["public/js/admin.js:1734", "public/js/admin.js:1862", "public/js/admin.js:1872-1873"]` |
| 구현 가이드 | 1) line 1734: `const nw = document.getElementById('pw-new').value;` → `.value.trim();` (`pw-current`/`pw-confirm`도 동일하게 trim) 2) line 1862: `const password = document.getElementById('user-password').value;` → `.value.trim();` 3) line 1872-1873: `const pw = prompt('새 패스워드를 입력하세요 (최소 8자):')?.trim();` 4) 길이 비교 `< 8`은 그대로 (이미 trim된 값 비교) |
| Rationale | backend 헬퍼가 trim하지만, frontend도 trim하여 사용자에게 즉시 정확한 피드백 제공 (서버 왕복 절감). 또한 frontend가 보낸 길이와 backend가 본 길이가 일치해야 UX 일관성 확보. |
| 함정 / 주의사항 | `prompt()`은 취소 시 null 반환 → `?.trim()` (옵셔널 체이닝)으로 null safe. `pw-current`까지 trim하면 기존 비밀번호에 의도된 공백이 있던 사용자(가능성 0%지만)는 영향 — DocLight 정책상 비밀번호 공백 비허용 가정 하에 trim 일관 적용. |
| 테스트 작성 지침 | manual: 1) 어드민 → 사용자 추가 → 비밀번호 ` 12345678 ` (공백 포함) 입력 → 정상 생성 2) ` 1234567 ` (trim 후 7자) → 에러 3) 패스워드 리셋 prompt에 ` 12345678 ` 입력 → 통과 |
| 검증 명령어 | `node -c public/js/admin.js` (syntax) + 브라우저 manual test |
| acceptance_tests | `[{"shell":"bash","cmd":"node -c public/js/admin.js","expected_exit":0},{"shell":"pwsh","cmd":"node -c public/js/admin.js","expected_exit":0},{"shell":"bash","cmd":"grep -nE \"prompt\\\\([^)]+\\\\)\\\\s*;?\\\\s*if\" public/js/admin.js","expected_exit":1}]` (마지막은 trim 누락 패턴 잔존 0건 확인) |
| DoD | syntax OK, grep 결과 trim 누락 패턴 0건, 브라우저 manual 시나리오 3개 pass |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 25분 |

---

### Phase 1 완료 조건 (DoD)
- TASK-P1-001~004 전부 완료
- `test/admin-password-validation.test.js` 5/5 pass
- grep으로 `password.length < 8` 잔존 0건 (`src/controllers/admin/admin-user-controller.js`)
- 브라우저 manual: 공백 포함 8자 비밀번호 추가/리셋/변경 모두 통과

---

## 6. Phase 2 — 계정 잠금 해제 미작동 (TDD 강제)

### 목표
어드민이 "잠금 해제" 클릭 시 백엔드는 정상이나 UI 갱신이 누락되는 문제 수정. 분석문서(`docs/analysis/2026-04-28.account-unlock-not-working.md`)의 모든 수정 제안을 수용한다. **TDD 강제**: backend `resetFailedLogin` 동작을 단위 테스트로 보장한 뒤 frontend 수정.

### 선행 조건
- Phase 1 완료 (검증 헬퍼 패턴 확립)

### TASK 목록

---

#### TASK-P2-001 — [RED] `userStore.resetFailedLogin` 단위 테스트 작성

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P2-001 |
| 관련 REQ-ID | REQ-UNLOCK-001 |
| 파일 경로 | `test/admin-unlock-user.test.js` (신규) |
| 메서드/함수 시그니처 | N/A — `node:test` 테스트 |
| 참고 패턴 | TASK-P1-001과 동일한 `node:test` 스타일 |
| source_anchors | `["src/stores/user-store.js:111-112", "src/stores/user-store.js:253-265"]` (검증 대상 필드/메서드 위치) |
| 구현 가이드 | 1) `tmp` 디렉토리에 임시 users.json 만드는 fixture 작성 (또는 userStore 인스턴스를 메모리만으로 초기화 — userStore 생성자 시그니처 사전 확인 필수) 2) test①: 사용자 lockedUntil=미래시각, failedLoginCount=5인 상태에서 `resetFailedLogin(id)` 호출 → 두 필드 각각 null/0이 되는지 확인 3) test②: 호출 후 `findById(id)` 결과가 영속화 reload 후에도 일치 (write 검증) 4) test③: 존재하지 않는 id → 에러 또는 no-op 명세 확정 후 테스트 |
| Rationale | UI 버그 수정 전에 backend가 정말 정상인지 단위 테스트로 못박는다 (분석문서는 정상이라고 하지만 검증 의무). frontend만 수정하고 backend도 망가져 있으면 다시 되돌아옴. |
| 함정 / 주의사항 | `userStore`는 파일 I/O 사이드 이펙트 — 테스트마다 임시 디렉토리 사용 필수. 실제 `data/users.json` 건드리면 슈퍼유저 계정 손상. `process.env`로 storage path 주입 가능 여부 사전 확인. 불가하면 임시 cwd로 chdir. |
| 테스트 작성 지침 | 최소 ① 잠긴 사용자 unlock → 두 필드 리셋 ② 영속화 검증 (재로드) ③ 미존재 id 처리 — 3 케이스 |
| 검증 명령어 | `node --test test/admin-unlock-user.test.js` → **실패해야 정상 (RED)** — 적어도 fixture 부재로 fail |
| acceptance_tests | `[{"shell":"bash","cmd":"node --test test/admin-unlock-user.test.js","expected_exit":1},{"shell":"pwsh","cmd":"node --test test/admin-unlock-user.test.js","expected_exit":1}]` |
| DoD | 테스트 파일 존재, 적어도 1개 케이스 fail (RED 확인) |
| rollback | `{"strategy":"file-delete","command":"rm test/admin-unlock-user.test.js"}` |
| 예상 소요 | 45분 |

---

#### TASK-P2-002 — [GREEN] backend 검증 (필요 시 fixture 헬퍼만)

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P2-002 |
| 관련 REQ-ID | REQ-UNLOCK-001 |
| 파일 경로 | `src/stores/user-store.js` (검증만, 필요 시 storage path injection 점검) / `test/_fixtures/temp-user-store.js` (선택) |
| 메서드/함수 시그니처 | 기존 `userStore.resetFailedLogin(id)` 시그니처 불변 |
| 참고 패턴 | `src/stores/user-store.js:260-265` 기존 구현 |
| source_anchors | `["src/stores/user-store.js:260-265"]` |
| 구현 가이드 | 1) 분석문서가 backend 정상이라 했으므로 코드 변경 불요 가능성 높음 — 단, TASK-P2-001 테스트가 GREEN 되도록 fixture 헬퍼만 추가 2) userStore가 `setStoragePath` 같은 메서드를 노출 안 하면 신규 export 추가 (최소 변경) 3) 테스트가 GREEN으로 전환됨을 확인 |
| Rationale | 분석문서 결론: backend는 이미 동작. 본 TASK는 그 결론을 테스트로 박제. |
| 함정 / 주의사항 | userStore에 storage path 주입 메커니즘 신규 추가 시 production 코드 영향 검토 — 환경 변수 또는 생성자 옵션으로 backward-compat 유지. 기존 인스턴스 export 방식이면 factory 함수 export 추가만으로 해결 가능. |
| 테스트 작성 지침 | TASK-P2-001 테스트 3/3 pass |
| 검증 명령어 | `node --test test/admin-unlock-user.test.js` |
| acceptance_tests | `[{"shell":"bash","cmd":"node --test test/admin-unlock-user.test.js","expected_exit":0,"stdout_regex":"# pass [3-9]"},{"shell":"pwsh","cmd":"node --test test/admin-unlock-user.test.js","expected_exit":0}]` |
| DoD | 3/3 pass, userStore production API 시그니처 호환 |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 30분 |

---

#### TASK-P2-003 — [GREEN] frontend `unlockUser`/`resetPassword` 핸들러에 목록 갱신 추가

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P2-003 |
| 관련 REQ-ID | REQ-UNLOCK-001 |
| 파일 경로 | `public/js/admin.js` (수정) |
| 메서드/함수 시그니처 | 기존 inline handler 시그니처 불변, 본문에 한 줄 추가 |
| 참고 패턴 | 동일 파일 `updateUser` 핸들러 (line 1858)의 `setTimeout(() => this.loadTab('users'), 700);` 정확히 동일 패턴 |
| source_anchors | `["public/js/admin.js:1858", "public/js/admin.js:1876-1877", "public/js/admin.js:1882-1883"]` |
| 구현 가이드 | 1) line 1882 (unlock 성공 분기): `if (r.success) { msg.textContent = '잠금이 해제되었습니다.'; msg.className = 'mgmt-msg success'; setTimeout(() => this.loadTab('users'), 700); }` 2) line 1876 (resetPassword 성공 분기): 동일하게 setTimeout 추가 — 분석문서가 두 핸들러 모두 누락이라 명시 |
| Rationale | `updateUser`는 이미 700ms 후 목록 재로드하여 lockedUntil 등 상태 변경이 UI에 반영됨. unlock/reset도 동일 효과 필요. 700ms 딜레이는 success 메시지 가독 시간. |
| 함정 / 주의사항 | `loadTab('users')`가 모달을 닫지 않을 수 있으므로 — 닫는 동작이 별도라면 추가 검토. 분석문서에는 `updateUser`도 동일하게 닫지 않으므로 일관성 유지를 위해 추가 닫기는 본 계획에서 **out of scope**. |
| 테스트 작성 지침 | manual: 1) 사용자를 의도적으로 잠금 (5회 로그인 실패) 2) 어드민 모달에서 잠금 해제 클릭 3) 700ms 후 목록 새로고침되어 상태 컬럼이 "정상"으로 변경되는지 확인 4) 패스워드 리셋도 동일 검증 |
| 검증 명령어 | `node -c public/js/admin.js` + 브라우저 manual |
| acceptance_tests | `[{"shell":"bash","cmd":"node -c public/js/admin.js","expected_exit":0},{"shell":"pwsh","cmd":"node -c public/js/admin.js","expected_exit":0},{"shell":"bash","cmd":"grep -c \"setTimeout(() => this.loadTab('users'), 700)\" public/js/admin.js","expected_exit":0,"stdout_regex":"^[3-9]$"}]` (3개 이상 — updateUser + unlockUser + resetPassword) |
| DoD | grep 카운트 ≥3, syntax OK, manual 시나리오 양쪽 pass |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 15분 |

---

### Phase 2 완료 조건 (DoD)
- TASK-P2-001~003 전부 완료
- `test/admin-unlock-user.test.js` 3/3 pass
- 브라우저 manual: 잠긴 사용자 → 어드민 잠금해제 → UI에 상태 반영 확인
- 패스워드 리셋도 동일하게 UI 반영

---

## 7. Phase 3 — 관리자 ID/PW 변경 모달화 (옵션 A, TDD 강제)

### 목표
패스워드 변경 UI를 프로필 탭 인라인에서 떼어내 **독립 모달 (`#password-change-modal`)** 로 이전. 분석문서 권장 옵션 A. **TDD 강제**: 새 검증 함수(폼 입력 검증)를 단위 테스트한 뒤 UI 통합.

### 선행 조건
- Phase 1 완료 (`password-validator` 헬퍼 사용)
- Phase 2 완료 (선행 변경 안정화)

### TASK 목록

---

#### TASK-P3-001 — [RED] 모달 폼 검증 함수 테스트 작성

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P3-001 |
| 관련 REQ-ID | REQ-MODAL-001 |
| 파일 경로 | `test/admin-password-change-form.test.js` (신규) |
| 메서드/함수 시그니처 | N/A — `node:test` |
| 참고 패턴 | TASK-P1-001과 동일한 `node:test` 스타일 |
| source_anchors | `["test/admin-password-validation.test.js:1-30"]` (Phase 1에서 작성된 패턴 참조) |
| 구현 가이드 | 1) `validatePasswordChangeForm({current, next, confirm})` 함수가 `{ok: boolean, error?: string}` 반환한다고 가정 2) test 시나리오: ① 정상 → `{ok: true}` ② current 빈값 → `{ok:false, error:/모든 필드/}` ③ next 8자 미만 (trim 후) → `{ok:false, error:/최소 8자/}` ④ next ≠ confirm → `{ok:false, error:/일치하지 않/}` ⑤ next에 공백 padding → trim 후 검증 |
| Rationale | 모달 폼 검증을 순수 함수로 추출하여 단위 테스트 가능. DOM 의존 제거. |
| 함정 / 주의사항 | 본 함수는 `password-validator.validatePasswordLength`를 내부 호출하여 일관성 유지. 모듈 위치는 `src/utils/password-change-form.js`로 신규 생성. |
| 테스트 작성 지침 | 5 케이스 (정상/필드누락/짧음/불일치/공백) |
| 검증 명령어 | `node --test test/admin-password-change-form.test.js` → fail (RED) |
| acceptance_tests | `[{"shell":"bash","cmd":"node --test test/admin-password-change-form.test.js","expected_exit":1},{"shell":"pwsh","cmd":"node --test test/admin-password-change-form.test.js","expected_exit":1}]` |
| DoD | 모듈 미존재로 RED 확인 |
| rollback | `{"strategy":"file-delete","command":"rm test/admin-password-change-form.test.js"}` |
| 예상 소요 | 30분 |

---

#### TASK-P3-002 — [GREEN] `password-change-form` 검증 모듈 구현

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P3-002 |
| 관련 REQ-ID | REQ-MODAL-001 |
| 파일 경로 | `src/utils/password-change-form.js` (신규) |
| 메서드/함수 시그니처 | `function validatePasswordChangeForm({current, next, confirm}): {ok: boolean, error?: string}` |
| 참고 패턴 | TASK-P1-002에서 만든 `password-validator.js` 모듈 export 패턴 |
| source_anchors | `["src/utils/password-validator.js:1-15"]` (Phase 1에서 신규 작성) |
| 구현 가이드 | 1) `const { validatePasswordLength } = require('./password-validator');` 2) 빈 필드 체크 → '모든 필드를 입력하세요.' 3) `validatePasswordLength(next)` false → '패스워드는 최소 8자입니다.' 4) `next.trim() !== confirm.trim()` → '새 패스워드가 일치하지 않습니다.' 5) 정상 → `{ok: true}` |
| Rationale | frontend·backend 양쪽이 동일 검증 로직 공유. 향후 정책 변경 일원화. |
| 함정 / 주의사항 | 본 모듈은 frontend(브라우저)에서도 require될 수 없음 — frontend는 동일 로직을 inline으로 작성하되 **이 모듈을 정확한 spec으로 간주하여 미러링**. 또는 빌드 도구 도입은 out of scope. |
| 테스트 작성 지침 | TASK-P3-001 5/5 pass |
| 검증 명령어 | `node --test test/admin-password-change-form.test.js` |
| acceptance_tests | `[{"shell":"bash","cmd":"node --test test/admin-password-change-form.test.js","expected_exit":0,"stdout_regex":"# pass [5-9]"},{"shell":"pwsh","cmd":"node --test test/admin-password-change-form.test.js","expected_exit":0}]` |
| DoD | 5/5 pass |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 20분 |

---

#### TASK-P3-003 — [GREEN] `admin.ejs`에 `#password-change-modal` 모달 컨테이너 추가

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P3-003 |
| 관련 REQ-ID | REQ-MODAL-001 |
| 파일 경로 | `src/views/admin.ejs` (수정) |
| 메서드/함수 시그니처 | N/A — HTML/EJS |
| 참고 패턴 | `src/views/admin.ejs:99-118` `#rename-modal` 구조를 그대로 copy하여 인풋 3개로 변경 |
| source_anchors | `["src/views/admin.ejs:99-118", "src/views/admin.ejs:135-152"]` |
| 구현 가이드 | 1) 기존 모달들 다음 줄(예: line 189 직후)에 새 `<div id="password-change-modal" class="modal">` 블록 추가 2) 내부에 `<div class="modal-content">` 하위로 제목 "패스워드 변경", 인풋 3개(`pw-modal-current`, `pw-modal-new`, `pw-modal-confirm`, type=password, autocomplete 적절히), 메시지 div(`pw-modal-msg`), 액션 버튼(`pw-modal-save`, `pw-modal-cancel`) 3) ID는 기존 `pw-current` 등과 충돌 회피 위해 `pw-modal-*` 네임스페이스 |
| Rationale | 기존 모달과 동일 마크업·CSS 클래스 사용하여 신규 CSS 0줄. EJS escape 패턴 일관성 유지. |
| 함정 / 주의사항 | EJS 컴파일 깨지지 않도록 `<%= %>` 등 동적 영역은 본 모달에 추가하지 않음 (정적 HTML만). escape 의무 검토 불필요. |
| 테스트 작성 지침 | EJS 컴파일 통과로 자동 검증 |
| 검증 명령어 | `node -e "const ejs=require('ejs'),fs=require('fs');ejs.compile(fs.readFileSync('src/views/admin.ejs','utf8'));console.log('EJS_OK')"` |
| acceptance_tests | `[{"shell":"bash","cmd":"node -e \"const ejs=require('ejs'),fs=require('fs');ejs.compile(fs.readFileSync('src/views/admin.ejs','utf8'));console.log('EJS_OK')\"","expected_exit":0,"stdout_regex":"EJS_OK"},{"shell":"pwsh","cmd":"node -e \"const ejs=require('ejs'),fs=require('fs');ejs.compile(fs.readFileSync('src/views/admin.ejs','utf8'));console.log('EJS_OK')\"","expected_exit":0},{"shell":"bash","cmd":"grep -c \"id=\\\"password-change-modal\\\"\" src/views/admin.ejs","expected_exit":0,"stdout_regex":"^1$"}]` |
| DoD | EJS 컴파일 OK, grep 1건, 브라우저 DevTools에서 모달 요소 존재 확인 |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 25분 |

---

#### TASK-P3-004 — [GREEN] `admin.js` 프로필 탭에서 인라인 폼 → 버튼 + 모달 핸들러로 교체

| 필드 | 값 |
|---|---|
| TASK-ID | TASK-P3-004 |
| 관련 REQ-ID | REQ-MODAL-001 |
| 파일 경로 | `public/js/admin.js` (수정) |
| 메서드/함수 시그니처 | `loadProfile(el)` 시그니처 불변, 내부 마크업/이벤트 재구성 |
| 참고 패턴 | 동일 파일 내 다른 모달 open 패턴 — `rename-modal`, `delete-modal` open/close 핸들러 grep하여 일관 적용 |
| source_anchors | `["public/js/admin.js:1694-1792", "public/js/admin.js:1730-1742"]` |
| 구현 가이드 | 1) `loadProfile`의 `<div class="mgmt-section"><h3>패스워드 변경</h3>...` 블록(line 1708-1717)을 `<button class="btn" id="pw-change-btn">패스워드 변경</button>` 단일 버튼으로 교체 2) 기존 line 1730-1742 핸들러 제거, 대신 `pw-change-btn` 클릭 시 `document.getElementById('password-change-modal').classList.add('show')` (또는 기존 모달 open 패턴) 3) 모달 내 `pw-modal-save` 클릭 핸들러: 입력 3개를 `.value.trim()` (Phase 1 정책)으로 읽고 TASK-P3-002 검증 로직을 frontend에 미러링하여 검증 → 통과 시 `AdminAPI.changePassword(cur,nw,cf)` 호출 → 성공 시 모달 닫기 + 입력 초기화 + 성공 메시지 4) `pw-modal-cancel` 클릭 시 모달 닫기 + 입력 초기화 |
| Rationale | 비밀번호 입력이 페이지 진입 직후 화면에 노출되지 않도록 명시적 액션으로 격리. 기존 모달 자산 재사용으로 CSS 0줄 추가. |
| 함정 / 주의사항 | 모달 open/close 메커니즘은 기존 `ModalModule` 또는 `.show` class 토글 — 작업 시작 전 grep `classList.add('show')` 또는 `ModalModule.open` 호출 패턴 확인 후 일관 적용. 모달 ESC 닫기/배경 클릭 닫기는 기존 모달과 동일하게 동작해야 함 (CSS·전역 핸들러가 처리). 모달 닫을 때 입력값 반드시 빈 문자열로 리셋 (보안). |
| 테스트 작성 지침 | manual: 1) 어드민 → 프로필 탭 진입 → 비밀번호 입력 필드가 화면에 노출되지 않음 확인 2) "패스워드 변경" 버튼 클릭 → 모달 표시 3) 잘못된 케이스 4종 (필드 누락/짧음/불일치/공백 padding) 에러 메시지 표시 4) 정상 입력 → 성공 5) 모달 닫고 다시 열면 입력 초기화 |
| 검증 명령어 | `node -c public/js/admin.js` + 브라우저 manual |
| acceptance_tests | `[{"shell":"bash","cmd":"node -c public/js/admin.js","expected_exit":0},{"shell":"pwsh","cmd":"node -c public/js/admin.js","expected_exit":0},{"shell":"bash","cmd":"grep -c \"id=\\\"pw-change-btn\\\"\\|getElementById('pw-change-btn')\" public/js/admin.js","expected_exit":0,"stdout_regex":"^[1-9][0-9]*$"}]` |
| DoD | syntax OK, 인라인 폼 마크업 grep `pw-form` 0건, manual 시나리오 5개 pass |
| rollback | `{"strategy":"git-reset","command":"git reset --hard HEAD~1"}` |
| 예상 소요 | 60분 |

---

### Phase 3 완료 조건 (DoD)
- TASK-P3-001~004 전부 완료
- `test/admin-password-change-form.test.js` 5/5 pass
- 어드민 프로필 탭에 비밀번호 입력 필드가 **노출되지 않음** (옵션 A 핵심 요건)
- "패스워드 변경" 버튼 → 모달 → 정상 변경 흐름 manual pass
- ESC/배경 클릭으로 모달 닫힘 (기존 모달과 동등)

---

## 8. 스펙 매핑 표

| REQ-ID | 요구사항 | 매핑된 TASK-ID |
|---|---|---|
| REQ-PWVAL-001 | 패스워드 길이 검증 trim 누락 수정 | TASK-P1-001 / TASK-P1-002 / TASK-P1-003 / TASK-P1-004 |
| REQ-UNLOCK-001 | 어드민 잠금 해제 UI 미반영 수정 (분석문서 모든 제안 수용) | TASK-P2-001 / TASK-P2-002 / TASK-P2-003 |
| REQ-MODAL-001 | PW 변경 UI 독립 모달화 (옵션 A) | TASK-P3-001 / TASK-P3-002 / TASK-P3-003 / TASK-P3-004 |

**커버리지**: 3/3 요구사항이 모두 매핑됨 (100%).

---

## 9. 리스크 및 완화

| 리스크 | 심각도 | 완화책 |
|---|---|---|
| `node:test`가 Node 18 미만 환경에서 미동작 | Low | 본 계획 메타에 Node 18+ 요구사항 명시. 기존 bare 테스트는 그대로 유지하므로 회귀 없음 |
| `userStore` storage path 주입 메커니즘 부재로 단위 테스트 어려움 | Medium | TASK-P2-001 fixture 작업에서 사전 점검. 기존 인스턴스 export면 factory export 추가만으로 해결. 안 되면 임시 cwd로 chdir |
| 기존 모달 open/close가 `ModalModule.open()` 등 전용 헬퍼 사용 시 패턴 불일치 | Low | TASK-P3-004 시작 전 grep으로 기존 패턴 확인 후 동일 적용. 새 패턴 도입 금지 |
| 패스워드 모달 close 시 입력 잔존으로 다음 사용자 노출 | Medium (보안) | TASK-P3-004 함정 항목에 명시 — 모달 닫을 때 모든 input.value=''로 강제 리셋 |
| frontend·backend 검증 로직 drift | Low | TASK-P3-002의 모듈을 spec으로 간주, frontend mirror 시 동일 메시지 문구 일치 검증 (acceptance_tests grep) |

**Infeasible 항목**: 없음.

---

## 10. 용어집

| 용어 | 정의 |
|---|---|
| **TDD** | Test-Driven Development. 실패하는 테스트를 먼저 작성(RED) → 통과하는 최소 코드 작성(GREEN) → 리팩토링(REFACTOR) |
| **`node:test`** | Node.js 18+ 내장 테스트 러너. 외부 의존성(jest 등) 없이 `node --test`로 실행 |
| **lockedUntil** | `users.json`의 사용자 필드. 로그인 5회 실패 시 일정 시간 잠금 해제 시각이 기록됨. null이면 잠금 아님 |
| **failedLoginCount** | 로그인 연속 실패 횟수 카운터. `resetFailedLogin()`이 0으로 리셋 |
| **resetFailedLogin** | `userStore`의 메서드. `failedLoginCount=0`, `lockedUntil=null`로 리셋 후 영속화 |
| **ManagementModule** | `public/js/admin.js`의 어드민 페이지 메인 객체. 탭별 메서드(`loadProfile`, `loadUsers` 등)와 `loadTab()` 디스패처 보유 |
| **옵션 A** | 분석문서 `2026-04-28.admin-password-modal.md`의 권장안. 독립 PW 변경 모달로 분리. (옵션 B는 탭 내 collapse — 미채택) |
| **acceptance_tests** | 본 계획 v2.2.1 신규 필드. 검증 명령어를 `{shell, cmd, expected_exit, stdout_regex?}` 구조로 표기 |
| **source_anchors** | 본 계획 v2.2.1 신규 필드. 참고 패턴을 `path:line-range` 형식으로 인용 |

---

## 11. 메타

| 항목 | 값 |
|---|---|
| mode | NORMAL (snoworca-planner v2.2.1) |
| 시니어 플래너 | 메인 실행 1인 (Phase 수 N=3 < 7 → 프리스크린 skip) |
| 동적 시니어 트리거 | 보안 키워드("auth", "permission") 1건 감지 — 보안 전문 시니어 자체 점검 (TASK-P3-004 함정 항목에 보안 노트 반영 완료) |
| 평가자 | 인라인 자체 검토 (사용자 시간 제약 — 본 계획은 대화형 단일 패스. 정식 multi-round 평가는 후속 라운드 필요 시 `--max` 재호출) |
| QNA 라운드 | 0 (사용자 지시 명확) |
| Dew File 경로 | `.snoworca/dew/planner/2026-04-28-admin-fixes/` (본 계획 자체가 1차 산출물) |
| feasibility | 인라인 (전 항목 Low) |
| Node 요구사항 | 18+ (`node:test` 사용) |
| TDD 강제 | **3 Phase 모두 RED → GREEN 순서 준수 의무**. RED 라운드(`*-001`) 통과 없이 GREEN 라운드 시작 금지. |
| scope_freeze | true (본 문서 출력 시점) |

---

## 12. 실행 순서 요약 (snoworca-coder용 라우팅 힌트)

```
Phase 1 (RED→GREEN) → Phase 2 (RED→GREEN) → Phase 3 (RED→GREEN) → pre_commit_gate
```

각 Phase 내부 순서:
1. `*-001` RED 테스트 작성 → 실패 확인
2. `*-002` 구현 → 단위 테스트 GREEN
3. 후속 TASK들 (통합, frontend 적용)
4. Phase DoD 만족 확인 후 다음 Phase

**금지**: TDD 순서 위반 (production 코드를 테스트 전에 작성). 위반 발견 시 해당 TASK 처음부터 재시작.
