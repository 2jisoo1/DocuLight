# 구현 계획 — 뷰어/어드민 단일 페이지 통합 + LocalPreview 제거

- **plan_id**: plan-unified-admin-viewer
- **상위 SRS**: `docs/srs/srs-unified-admin-viewer.md` (Draft v3, 13 F-REQ + 7 NF-REQ)
- **작성일**: 2026-04-29
- **모드**: snoworca-planner Normal (Opus×1 시니어, 인라인 feasibility, Dew File 활성)
- **OS**: Windows (win32) — bash + pwsh acceptance_tests 병행 의무

---

## 1. 개요

DocLight의 뷰어 페이지(`/`, `/doc/*`)와 어드민 페이지(`/admin`)는 UI가 거의 동일함에도 EJS·JS·CSS가 완전히 분리되어 있다. 본 계획은 (a) 두 페이지를 단일 통합 페이지로 합치고, (b) 권한 기반 모드 토글(편집/어드민)로 기능을 노출하며, (c) `app.js`(3,269줄) + `admin.js`(2,974줄)를 ES Module 8개 파일로 분할하고, (d) LocalPreview 기능을 완전 제거하는 5단계 작업이다.

**Phase 수**: 5
**예상 총 공수 (주니어 기준)**: 32~48시간
**feasibility 인라인 결과**: Low 8 / Medium 11 / High 1 / Infeasible 0 → 진행 가능

---

## 2. 선행 조건 및 전제

- Node.js ≥ 18 (package.json `engines`).
- Playwright(`@playwright/test ^1.56.1`)가 devDependencies에 이미 설치됨 — E2E 테스트에 사용.
- `/api/auth/session` 엔드포인트가 `permissions` 배열을 반환함 (확인됨: `src/controllers/auth-controller.js:186-205`).
- writer 권한자 = `permissions` 배열에 `write` 포함, superuser = `superuser` 포함 (가정 — Phase 1에서 실제 값 검증).
- 빌드 도구 도입 없음. `<script type="module">` 네이티브 ESM만 사용.
- 본 계획은 본 SRS 범위 외 코드를 리팩토링하지 않는다 (CLAUDE.md §3 surgical changes).

---

## 3. 프로젝트 온보딩 컨텍스트

### 3.1 이 프로젝트는 무엇인가
**DocLight**는 마크다운 문서를 트리 네비게이션과 함께 보여주는 경량 뷰어 + 관리 시스템이다. Express 기반 서버(`src/app.js`)가 EJS 템플릿을 렌더하고, 클라이언트 JS가 `/api/*` (공개) 또는 `/api/admin/*` (인증) 엔드포인트로 트리·파일을 다룬다. 권한 모델은 `reader / writer / superuser` 3단계.

### 3.2 주요 디렉토리 맵
| 경로 | 역할 |
|---|---|
| `src/app.js` | Express 부트스트랩, 라우트 마운트, EJS 렌더 |
| `src/routes/admin-api.js` | `/api/admin/*` 라우터 |
| `src/routes/api.js` | `/api/*` 공개 라우터 |
| `src/controllers/auth-controller.js` | 세션·로그인·권한 |
| `src/controllers/admin/` | 어드민 API 핸들러 (tree/file/move/upload/group/user) |
| `src/middleware/admin-auth.js` | `adminAuth`, `requirePermission` 미들웨어 |
| `src/views/index.ejs` | 뷰어 페이지 EJS (단일화 대상) |
| `src/views/admin.ejs` | 어드민 페이지 EJS (제거 대상) |
| `src/views/doc-viewer.ejs` | `/doc/*` 라우트 EJS |
| `public/js/app.js` | 뷰어 클라이언트 코드 (3,269줄, LocalPreview 포함 — 분할 대상) |
| `public/js/admin.js` | 어드민 클라이언트 코드 (2,974줄, 모듈 8개 — 분할 대상) |
| `public/js/modules/` | **신규** ES Module 디렉토리 (Phase 1에서 생성) |
| `public/css/style.css` | 공통 스타일 (LocalPreview CSS 1470-1612 줄 제거 대상) |
| `public/css/admin.css` | 어드민 스타일 (style.css로 통합 대상은 아님 — 모달용 잔존) |
| `test/` | 단위 테스트 + Playwright e2e |

### 3.3 핵심 규칙 / 절대 금지
1. **브라우저 기본 다이얼로그 `alert/confirm/prompt` 사용 금지** — `CLAUDE.md §0`. 내부 모달 컴포넌트만 사용.
2. **`/api/admin/*` 시그니처 변경 금지** — 외부 호출자(MCP, chatbot) 호환.
3. **본 SRS 범위 외 리팩토링 금지** — CLAUDE.md §3. 인접 코드 "개선" 금지.
4. **권한 역할 신규 추가 금지** — reader/writer/superuser 그대로.
5. **빌드 도구(webpack/vite/esbuild) 도입 금지** — 네이티브 ESM만.

### 3.4 빌드·테스트 명령어 치트시트
| 목적 | 명령 (bash) | 명령 (pwsh) |
|---|---|---|
| 서버 실행 | `npm start` | `npm start` |
| 개발 모드 (자동재시작) | `npm run dev` | `npm run dev` |
| Playwright e2e | `npx playwright test` | `npx playwright test` |
| 단위 테스트 1개 | `node test/<파일>.test.js` | `node test/<파일>.test.js` |
| 문법 체크 (브라우저 코드) | `node --check public/js/modules/<파일>.js` | `node --check public/js/modules/<파일>.js` |

### 3.5 참고 문서
- `CLAUDE.md` (프로젝트 루트) — 코딩 가이드라인, 모달 규칙
- `docs/srs/srs-unified-admin-viewer.md` — 본 계획의 상위 SRS
- `README.md` (있으면) — 프로젝트 소개

### 3.6 도움 요청 경로
모르겠을 때: SRS의 해당 REQ-ID 본문 재확인 → 그래도 막히면 `needs_clarification` 필드에 질문 적고 사용자 호출.

---

## 3-A. AI 에이전트 실행 가드

### 3-A.1 scope_freeze + change_log

```yaml
scope_freeze: true         # 라운드 9 통과 — Opus PASS + Sonnet PASS (모든 심각도 0). 이후 변경은 change_log + 사용자 승인 필수.
change_log:
  - date: "2026-04-29"
    reason: "라운드 1 평가자 결정 — modal-ui.js 분리 (admin-modal lazy 로드 시 writer 모드 confirmUnsaved 부재). SRS REQ-NF-005 모듈 수 8 → 9 조정 필요."
    diff_summary: "Plan §3-A.3.4 모듈 9개 표 등재. SRS REQ-NF-005 본문 동기화 의무는 Phase 1 시작 전 별도 PR로 처리."
    approved_by: "user (라운드 1 수정 진행 명령)"
  - date: "2026-04-29"
    reason: "라운드 2 평가자 결정 — source_anchors 4건 라인 정정 (UploadModule 2723→2925, EditorModule 1626→1625, ContextMenuModule 1038→1037, ManagementModule 2073→2072)."
    diff_summary: "TASK-P3-003/P4-002/P4-001/P4-003 source_anchors 정정. SRS §4.3 라인 표기도 동기 정정 의무."
    approved_by: "user (라운드 2 수정 진행 명령)"
  - date: "2026-04-29"
    reason: "라운드 3~5 평가자 결정 — onModeChange 등록 순서·view 트리 캡슐화·OS-중립 acceptance·setMode force 옵션·SRS Draft v3 승격·JSON 사이드카 전체 동기화·9개 모듈 명시·다중 탭 정책."
    diff_summary: "§3-A.3 State Contract / §3-A.3.5 다중 탭 / TASK-P2-003 단일 통합 코드 / TASK-P3-001 view 트리 캡슐화 / Phase 4 작업 순서 P4-000→P4-001→P4-002→P4-003."
    approved_by: "user (라운드 3~5 수정 진행 명령)"
  - date: "2026-04-29"
    reason: "라운드 6~7 평가자 결정 — JSON req_to_task 양방향성 정렬, §9 비대칭 모델 명시, P4-002 cross-TASK 위임, P1-003 DoD 5 시나리오, §12 라운드 수 갱신."
    diff_summary: "JSON sidecar req_to_task[F-004/F-005/F-013] contributor 추가, P3-003.req_ids에서 NF-006 제거, P1-001.req_ids에 NF-007 추가, §9 양방향성 주석."
    approved_by: "user (라운드 6~7 수정 진행 명령)"
  - date: "2026-04-29"
    reason: "라운드 8 평가자 결정 — strict 양방향성으로 전환, contributor를 모두 task.req_ids에 명시. 라운드 8 잔존 CRITICAL 해소: TASK-P5-004.req_ids에 REQ-NF-001 추가."
    diff_summary: "JSON tasks[]에 REQ-NF-005(13건), REQ-NF-001(P1-003·P5-004), REQ-NF-004(P1-003·P5-001), REQ-F-003·F-004(P2-001·P3-001~003), REQ-F-008(P4-003), REQ-NF-007(P1-001) 모두 양방향 strict 정렬 완료."
    approved_by: "user (모든 문제 해결까지 루프 명령)"
```

> **scope_freeze 승격 절차**: CRITICAL 0 + HIGH 0 라운드 통과 시 `scope_freeze: true`로 승격. 이후 변경은 반드시 change_log에 등재 + 사용자 승인.

### 3-A.2 pre_commit_gate

전체 5 Phase 완료 후 커밋 직전에 모두 통과해야 한다.

```yaml
pre_commit_gate:
  - {shell: "bash", cmd: "node --check public/js/app.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/app.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/mode.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/mode.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/tree.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/tree.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/dnd.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/dnd.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/upload.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/upload.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/context-menu.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/context-menu.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/editor.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/editor.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/modal-ui.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/modal-ui.js", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/modules/admin-modal.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/admin-modal.js", expected_exit: 0}
  - {shell: "bash", cmd: "node test/test-start-stop.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node test/test-start-stop.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/unified-admin-viewer.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/unified-admin-viewer.spec.js", expected_exit: 0}
  - {shell: "bash", cmd: "if grep -rn LocalPreview public src ; then exit 1 ; else exit 0 ; fi", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Recurse -Path public,src -Pattern LocalPreview -Quiet) { exit 1 } else { exit 0 }", expected_exit: 0}
  - {shell: "bash", cmd: "if grep -rn local-preview public/css ; then exit 1 ; else exit 0 ; fi", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Recurse -Path public/css -Pattern local-preview -Quiet) { exit 1 } else { exit 0 }", expected_exit: 0}
```

### 3-A.3 State Contract (CRITICAL — 모듈 간 단일 진실 원천)

mode.js와 editor.js, admin-modal.js 간 **미저장 hook + showConfirm 호출 계약**을 한 곳에 단일 정의한다. 모든 TASK 본문은 이 계약을 그대로 인용·준수해야 한다 (재정의 금지).

#### 3-A.3.1 전역 state 객체

```js
// 페이지 엔트리(app.js)에서 1회 초기화 — TASK-P2-003 책임
window.__doclightState = {
  editor: {
    isUnsaved: () => false,            // editor.js activate 시 실제 함수로 교체
    save: async () => false,           // editor.js activate 시 교체 (true=성공)
    discard: () => {},                 // editor.js activate 시 교체
  },
  modal: {
    showConfirm: async (opts) => 'cancel',   // modal-ui.js activate 시 교체
  },
};
```

#### 3-A.3.2 미저장 모달은 `modal-ui.js` (신규 분리 모듈)에서 제공

`admin-modal.js` 안에 `showConfirm`을 두면 reader/writer는 admin-modal을 로드하지 않으므로 writer 편집 모드 OFF 시 `showConfirm` 호출 불가. → **showConfirm + confirmUnsaved 만 별도 `modal-ui.js`로 분리**한다. admin-modal.js는 관리 모달 UI 전용.

- `public/js/modules/modal-ui.js` (**신규 모듈 — 9번째 파일**)
  - `export function activate(): void` — `window.__doclightState.modal.showConfirm`을 본 모듈 구현으로 교체
  - `export async function showConfirm({title, body, primary, secondary, cancel}): Promise<'primary'|'secondary'|'cancel'>`
  - `export async function confirmUnsaved(): Promise<'save'|'discard'|'cancel'>` — 내부에서 showConfirm 호출, REQ-F-008 확정 카피 사용
- modal-ui.js는 view/edit/admin **모든 모드**에서 활성. mode.js가 init 시점에 직접 import.

#### 3-A.3.3 호출 계약

| 호출자 | 호출 시점 | 메서드 | 기대 동작 |
|---|---|---|---|
| mode.js `setMode` | 모드 전환 직전 | `__doclightState.editor.isUnsaved()` | dirty 여부 확인 |
| mode.js `setMode` | 위에서 true면 | `__doclightState.modal.showConfirm({...})` 또는 `confirmUnsaved()` (modal-ui.js 직접 import) | 'save'/'discard'/'cancel' |
| mode.js `setMode` | 결과 'save'면 | `__doclightState.editor.save()` await | true 성공·false 실패 |
| mode.js `setMode` | 결과 'discard'면 | `__doclightState.editor.discard()` 호출 후 진행 | 변경 폐기 |
| mode.js `setMode` | 결과 'cancel'면 | 모드 전환 자체 abort | 편집기·모드 상태 유지 |
| editor.js `activate` | mount 시 | `__doclightState.editor.isUnsaved/save/discard` 3개를 실제 함수로 교체 | hook 등록 |
| editor.js `deactivate` | unmount 시 | 3개를 noop 기본값으로 복원 | hook 해제 |

#### 3-A.3.4 모듈 파일 9종 (REQ-NF-005 정정)

본 SRS는 8개 파일을 명시했으나, 위 분리 결정에 따라 **9개**로 조정한다 (modal-ui.js 추가). SRS REQ-NF-005 AC#1을 9 파일 기준으로 해석한다 (scope_freeze 후 변경 시 change_log 갱신 필요).

| # | 모듈 | 책임 | 활성 모드 |
|---|---|---|---|
| 1 | `mode.js` | 토글/권한/URL | 모든 모드 (init) |
| 2 | `tree.js` | 편집/admin 트리 | edit/admin |
| 3 | `dnd.js` | DnD 핸들러 | edit/admin (데스크톱) |
| 4 | `upload.js` | 업로드 큐 | edit/admin |
| 5 | `context-menu.js` | 우클릭 메뉴 | edit/admin |
| 6 | `editor.js` | 인라인 편집기 + hook 등록 | edit/admin |
| 7 | `modal-ui.js` | showConfirm/confirmUnsaved | 모든 모드 |
| 8 | `admin-modal.js` | 관리 모달 (사용자/그룹/권한) | admin |
| 9 | `app.js` (엔트리) | 부트스트랩, lazy import | 모든 모드 |

#### 3-A.3.5 다중 탭 동시성 정책

`window.__doclightState`는 탭별 격리. 동일 사용자가 두 탭에서 동시 접속 후 한 탭에서 권한 변경 → 다른 탭은 새로고침까지 stale permissions 캐시 유지. 본 SRS 범위에서 다음 정책으로 처리:

- **out of scope**: 탭 간 실시간 권한 동기화(`storage` 이벤트, BroadcastChannel 등)는 본 SRS 범위 외.
- **방어 동작 (필수)**: 모드 전환 또는 어드민 API 호출 시 서버가 401/403 반환하면 mode.js는 즉시 `setMode('view', {force:true, reason:'auth-revoked'})`로 강제 다운그레이드. `force:true`이면 setMode가 confirmUnsaved 결과 'cancel'이어도 진행하되 `editor.discard()` 호출 후 modal-ui의 별도 안내 모달("권한이 만료되었습니다. 변경 내용은 폐기되었으며 페이지를 새로고침해 주세요.")을 표시. 이 옵션 없이는 미저장 + cancel 시 무한 401 루프 + 데이터 손실 발생.
- 이 동작은 TASK-P2-001 setMode 본문 + TASK-P3-003 upload.js fetch error 핸들러에 동일 적용.

### 3-A.4 forbidden_patterns

```yaml
forbidden_patterns:
  - "TODO(?!:)"
  - {pattern: "probably|should work|I think|maybe", flags: "i"}
  - "window\\.alert\\(|window\\.confirm\\(|window\\.prompt\\("
  - "LocalPreview"
  - "local-preview"
```

> **금지 표현 회피 메모**: SRS 본문 인용·forbidden_patterns 정의 자체는 의미상 정의이지 지시문이 아니므로 평가자가 JA16 false-positive를 발행할 수 있다. 본 계획서 본문(Phase 설명, TASK 가이드)에서는 모호어를 사용하지 않고 구체 조건·임계값으로 기술한다.

---

## 4. Phase 1 — 정리 작업 (LocalPreview 제거 + `/admin` 리다이렉트 + 모듈 디렉토리)

### 4.1 목표
이후 Phase의 작업 영역을 정리한다. (1) 사라질 코드(LocalPreview)를 먼저 삭제해 분할 대상을 줄이고, (2) `/admin` 라우트를 302로 단순화하며, (3) `public/js/modules/` 빈 디렉토리를 만들어 다음 Phase의 import 경로를 안정화한다.

### 4.2 선행 조건
없음 (시작 Phase).

---

#### TASK-P1-001 — `public/js/app.js`에서 LocalPreview 객체 및 호출 제거

- **관련 REQ-ID**: REQ-F-011, REQ-NF-007
- **파일 경로**: `public/js/app.js` (수정)
- **메서드/함수 시그니처**: 제거 — `const LocalPreview = { ... }` 객체 전체 및 `LocalPreview.init()` 호출
- **참고 패턴**: 없음 — 단순 삭제
- **source_anchors**: `["public/js/app.js:2523-3029", "public/js/app.js:3265"]` (실존 검증: Grep `LocalPreview` 매칭 라인 2523~3018 + 객체 닫는 `};` 3029. 단일 호출 라인 3265).
- **구현 가이드 (단계별)**:
  1. `public/js/app.js` 열기.
  2. 라인 2523의 `const LocalPreview = {` 부터 객체 닫는 `};` (라인 3029)까지 — 내부의 escapeHtml 헬퍼(3024-3028 부근) 포함하여 전체 삭제. 줄 수 약 507줄.
  3. 라인 3265 부근 `LocalPreview.init();` 한 줄 삭제.
  4. 객체에서 사용하던 헬퍼 함수가 LocalPreview 외부에서도 쓰이는지 확인 (Grep `getMermaidConfig|renderLocalFile` 등). 외부에서 안 쓰이면 함께 삭제.
  5. `grep -n LocalPreview public/js/app.js` → 매치 0건 확인.
- **Rationale**: 사용처 미관측 + 본문 영역 드롭 핸들러가 통합 페이지의 트리 DnD와 충돌 가능. SRS 우선순위에 따라 Phase 2 모듈 분할 전에 제거해 분할 범위를 축소.
- **함정 / 주의사항**:
  - LocalPreview가 `mermaid` 동적 로드 등 라이브러리 초기화를 수행한다면 다른 모듈도 동일 로드를 한다 — 중복 제거 시 다른 모듈 동작 회귀 주의. `mermaid` 호출은 `public/js/app.js` 다른 위치에서도 사용됨을 사전 확인 (Grep 후 외부 사용처 존재 시 LocalPreview 객체 내부 코드만 삭제).
  - `LocalPreview.close()` 등 `onclick` 인라인 핸들러가 EJS 템플릿에 있으면 함께 제거 (`grep -rn LocalPreview src/views public/`).
- **테스트 작성 지침**:
  - 신규 파일: `test/e2e/local-preview-removed.spec.js`
  - 시나리오 ① 페이지 로드 후 `window.LocalPreview === undefined` ② 본문 영역에 파일 드롭 → 새 탭으로 안 열리고 무반응 ③ 콘솔에 LocalPreview 관련 로그 출력 0건
- **검증 명령어**: `grep -rn LocalPreview public/ src/` 결과 0건 + `npx playwright test test/e2e/local-preview-removed.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "if grep -rn LocalPreview public src ; then exit 1 ; else exit 0 ; fi", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Recurse -Path public,src -Pattern LocalPreview -Quiet) { exit 1 } else { exit 0 }", expected_exit: 0}
  - {shell: "bash", cmd: "node --check public/js/app.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/app.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/local-preview-removed.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/local-preview-removed.spec.js", expected_exit: 0}
  ```
- **DoD (측정 가능)**: (1) `grep LocalPreview public src` 매치 0건, (2) `node --check public/js/app.js` 통과, (3) e2e 3 시나리오 모두 PASS, (4) 서버 시작 후 페이지 로드 시 콘솔 에러 0건.
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 1~2시간

---

#### TASK-P1-002 — `public/css/style.css`에서 `.local-preview-*` 셀렉터 제거

- **관련 REQ-ID**: REQ-F-011
- **파일 경로**: `public/css/style.css` (수정)
- **메서드/함수 시그니처**: N/A (CSS)
- **참고 패턴**: 없음 — 단순 삭제
- **source_anchors**: `["public/css/style.css:1470-1612"]` (실존 검증: Grep `local-preview` 결과 1470, 1480, 1486, 1490, 1495, 1503, 1514, 1533, 1543, 1553, 1573, 1594, 1599, 1603, 1607, 1612 라인)
- **구현 가이드 (단계별)**:
  1. `style.css` 1470 라인 부근의 `.local-preview-banner {` 시작 위치 확인.
  2. 1612 라인 부근까지 `.local-preview-*` 셀렉터(미디어 쿼리 안 포함분 포함) 모두 삭제.
  3. 인접 셀렉터(`.markdown-content` 등)와 경계가 모호하면 한 셀렉터씩 단위로 삭제.
  4. `grep -n local-preview public/css/style.css` → 0건.
- **Rationale**: TASK-P1-001과 짝. CSS 셀렉터를 함께 제거해 죽은 스타일 잔존 방지.
- **함정 / 주의사항**: 미디어 쿼리(`@media (max-width: ...)`) 블록 안에 포함된 `.local-preview-*`도 잊지 말고 제거. 미디어 쿼리 자체는 유지(다른 셀렉터 포함 가능).
- **테스트 작성 지침**: 별도 단위 테스트 불필요. e2e는 TASK-P1-001 시나리오 ②에서 시각적 변화 없음으로 간접 검증.
- **검증 명령어**: `grep -rn local-preview public/css`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "if grep -rn local-preview public/css ; then exit 1 ; else exit 0 ; fi", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Recurse -Path public/css -Pattern 'local-preview' -Quiet) { exit 1 } else { exit 0 }", expected_exit: 0}
  ```
- **DoD**: (1) grep 0건, (2) 페이지 시각 회귀 없음 — TASK-P1-001 e2e 시나리오 ②(본문 영역 drop 무반응)에서 간접 검증 (cross-TASK 위임).
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 30분

---

#### TASK-P1-003 — `/admin` 및 `/admin/*` 라우트를 302 리다이렉트로 변경

- **관련 REQ-ID**: REQ-F-001, REQ-NF-001, REQ-NF-004
- **파일 경로**: `src/app.js` (수정, 라인 337~351 부근)
- **메서드/함수 시그니처**: `app.get('/admin', (req, res) => res.redirect(302, ...))`, `app.get('/admin/*', (req, res) => res.redirect(302, ...))`
- **참고 패턴**: Express의 `res.redirect(status, url)` 표준 사용. 같은 코드베이스에 redirect 사용 사례는 없으나 Express 공식 패턴.
- **source_anchors**: `["src/app.js:337-351"]` (실존 검증: Read로 라인 338 `app.get('/admin', ...)`, 346 `app.get('/admin/*', ...)` 확인)
- **구현 가이드 (단계별)**:
  0. **인증 가드 실측 (필수 선행 단계)**: 다음 명령으로 현재 `/admin`의 인증 처리 흐름을 확인한다.
     - `grep -n "session\|auth\|login\|requirePermission" src/app.js | head -40` — 라우트 가드 위치 파악
     - `curl -i -L http://localhost:3000/admin` (서버 실행 후) — 미인증 시 응답 확인
     - 결과를 plan에 코멘트로 기록 (예: "src/app.js:104의 미들웨어가 `/admin` 요청을 차단하지 않음 — 별도 가드 추가 필요" 또는 "기존 가드 그대로 동작").
  1. `src/app.js`에서 라인 337 주석 및 338~343의 `app.get('/admin', ...)` 블록을 찾는다.
  2. 핸들러 본문을 다음으로 교체 (위 0단계 결과에 따라 인증 가드 추가 결정):
     ```js
     app.get('/admin', (req, res) => {
       const qs = req.url.includes('?') ? '&' + req.url.split('?')[1] : '';
       res.redirect(302, `${basePath || ''}/?mode=admin${qs}`);
     });
     ```
     여기서 `basePath`는 라우터 등록 시점에 `req.app.locals.config.basePath`로 접근. 더 간단히 `(req.app.locals.config?.basePath || '')` 사용.
  3. 346~351의 `app.get('/admin/*', ...)`도 동일하게 `/?mode=admin`로 302 리다이렉트.
  4. **현재 인증 동작 보존 — 추가 가드 절대 삽입 금지**:
     - 실측(`src/app.js:97-126`) 결과: read-login guard는 `cfg.auth.requireReadLogin === true`일 때만 동작.
     - **케이스 (a)** `requireReadLogin=true`: 글로벌 미들웨어가 미인증 시 자동으로 `/login` 리다이렉트 — 본 핸들러는 **추가 가드 코드 없이** 그대로 redirect만 수행. 미들웨어가 먼저 동작하므로 미인증은 핸들러까지 도달 안 함.
     - **케이스 (b)** `requireReadLogin=false` (기본): 익명 사용자도 `/admin` 접근 가능한 현재 동작 보존. **추가 가드 삽입 시 회귀**. 익명도 그대로 `/?mode=admin`으로 리다이렉트되며, 어드민 모드 활성 여부는 mode.js가 `/api/auth/session` 결과로 클라이언트 게이팅(REQ-NF-001 — 클라이언트는 UX, 서버 `/api/admin/*`가 최종 권한 검증).
  5. `src/views/admin.ejs`는 본 Phase에서는 삭제하지 않는다 (Phase 5에서 일괄 정리).
- **Rationale**: SRS U-2 결정에 따라 모든 `/admin/*` 하위 경로는 단순히 `/?mode=admin`으로 보낸다. SPA 클라이언트 라우팅은 모드 시스템(REQ-F-009)이 흡수한다.
- **함정 / 주의사항**:
  - `basePath`가 비어있을 때 `${''}/?mode=admin` → `/?mode=admin` (정상). 비어있지 않으면 `/foo/?mode=admin`.
  - 미인증 사용자가 `/admin` 접근 시 기존 로그인 리다이렉트는 `src/app.js:104`의 라우트 가드가 처리. 본 변경 후에도 통과 — 인증 미들웨어가 `/?mode=admin`에 대해 동일 로직 적용 확인 필요.
  - 인증 가드가 `/admin`에 명시적으로 걸려 있으면 (Grep으로 확인) 가드 로직도 함께 갱신.
- **테스트 작성 지침**:
  - 신규 파일: `test/e2e/admin-redirect.spec.js`
  - 시나리오 ① 인증 GET /admin → 302 Location `/?mode=admin` ② 인증 GET /admin/users → 302 Location `/?mode=admin` ③ GET /admin?foo=bar → 쿼리스트링 보존 ④ **`requireReadLogin=true` 환경 + 미인증 GET /admin → 302 /login** (글로벌 미들웨어가 처리) ⑤ **`requireReadLogin=false` 환경 + 미인증 GET /admin → 302 /?mode=admin** (현재 동작 보존, 클라이언트 게이팅).
- **검증 명령어**: `npx playwright test test/e2e/admin-redirect.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check src/app.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check src/app.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/admin-redirect.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/admin-redirect.spec.js", expected_exit: 0}
  ```
- **DoD**: (1) `node --check` 통과, (2) e2e 5 시나리오(①②③ 자동 PASS, ④⑤는 환경변수 `requireReadLogin=true/false` 분기 e2e 자동 실행) 모두 PASS.
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 2~3시간

---

#### TASK-P1-004 — `public/js/modules/` 디렉토리 생성 + README.md placeholder

- **관련 REQ-ID**: REQ-NF-005
- **파일 경로**: `public/js/modules/` (신규 디렉토리), `public/js/modules/README.md` (신규)
- **메서드/함수 시그니처**: N/A
- **참고 패턴**: 없음 — 신규 패턴
- **source_anchors**: `["N/A — 신규"]`
- **구현 가이드 (단계별)**:
  1. `mkdir -p public/js/modules` (또는 pwsh `New-Item -ItemType Directory public/js/modules`).
  2. `public/js/modules/README.md`에 한 줄 작성: "ES Module 분할 — Phase 2~4에서 채워짐. SRS REQ-NF-005 참조."
  3. git commit (다음 Phase에서 import 경로가 안정적으로 잡히도록).
- **Rationale**: 빈 디렉토리는 git에 들어가지 않으므로 placeholder 파일 필요. 각 Phase에서 모듈을 추가할 때 import 경로 충돌 방지.
- **함정 / 주의사항**: README 외 코드 placeholder는 만들지 않는다. 빈 `mode.js` 같은 파일 미리 만들지 말 것 — 다음 TASK가 실제로 구현.
- **테스트 작성 지침**: 단위 테스트 불필요. `ls public/js/modules/README.md` 존재 확인.
- **검증 명령어**: `ls public/js/modules/README.md` (또는 pwsh `Test-Path`)
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "ls public/js/modules/README.md", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Test-Path public/js/modules/README.md) { exit 0 } else { exit 1 }", expected_exit: 0}
  ```
- **DoD**: 디렉토리 + README.md 생성 완료 + git에 커밋됨.
- **rollback**: `{strategy: "file-delete", command: "rm -rf public/js/modules"}`
- **예상 소요**: 10분

---

### 4.3 Phase 1 테스트 전략
- **Mock 금지**: 모든 e2e는 실제 Express 서버 인스턴스 + Playwright 사용 (Mock fetch/redirect 금지).
- **회귀 검증**: Phase 1 종료 후 기존 `npm run test:startstop`이 PASS해야 한다.

### 4.4 Phase 1 완료 조건 (DoD)
1. TASK-P1-001~004 모두 acceptance_tests PASS
2. `grep -rn LocalPreview public src` → 0건
3. `grep -rn local-preview public/css` → 0건
4. `curl -I http://localhost:3000/admin` → `302` + `Location: /?mode=admin`
5. `public/js/modules/` 디렉토리 + README.md git에 존재

---

## 5. Phase 2 — 모드 시스템 코어 (mode.js + EJS 통합 + app.js 엔트리 분리)

### 5.1 목표
- 권한 기반 모드 토글(REQ-F-002), URL 동기화(REQ-F-009), 모바일 분기(REQ-F-010), 미저장 경고 모달 hook(REQ-F-008)을 담는 `mode.js` 모듈을 신규 작성한다.
- `index.ejs`를 통합 페이지로 확장 (모드 토글 버튼, 관리 버튼 DOM 추가).
- `public/js/app.js`를 ES Module 엔트리로 변환 (lazy import로 권한별 모듈 로드).
- `<script defer>` → `<script type="module">`로 EJS 변경.

### 5.2 선행 조건
Phase 1 완료 (LocalPreview 제거, 모듈 디렉토리 존재).

---

#### TASK-P2-001 — `public/js/modules/mode.js` 신규 작성 (모드 토글 + 권한 + URL 동기화)

- **관련 REQ-ID**: REQ-F-002, REQ-F-003, REQ-F-004, REQ-F-009, REQ-F-010, REQ-NF-002, REQ-NF-005
- **파일 경로**: `public/js/modules/mode.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  // ES Module exports
  export async function initMode(): Promise<void>           // 페이지 로드 시 1회 호출
  export function getCurrentMode(): 'view' | 'edit' | 'admin'
  export function setMode(next: 'view' | 'edit' | 'admin', opts?: {force?: boolean, reason?: 'auth-revoked'}): Promise<boolean>  // false=차단(미저장 모달에서 취소 등). force=true 시 confirmUnsaved 결과 'cancel'이어도 진행 + 변경 폐기 + auth-revoked 안내 모달 표시
  export function onModeChange(handler: (mode: string) => void): () => void  // unsubscribe 반환
  export function isMobileNoDnd(): boolean                  // (max-width:768px) AND (pointer:coarse)
  ```
- **참고 패턴**: `public/js/admin.js:314-373`의 `AuthModule` (세션 조회 + 권한 캐싱). 본 모듈은 `/api/auth/session`을 호출하고 결과를 메모리 캐시.
- **source_anchors**: `["public/js/admin.js:314-373"]` (AuthModule 정의 — 실존 검증: Grep `^const AuthModule = {` 시작 314, 닫는 `};` 373)
- **구현 가이드 (단계별)**:
  1. 모듈 상단에 `let currentMode = 'view'`, `let permissions = []`, `const subscribers = new Set()` 선언.
  2. `initMode()`:
     - `fetch('/api/auth/session')` → 응답 200 시 `permissions = body.session.permissions`. 401이면 빈 배열.
     - URL `?mode` 읽기. `URLSearchParams(location.search).get('mode')`.
     - 권한 검증: `mode=admin` 요청 시 `permissions.includes('superuser')` 만족하면 admin, 아니면 view. `mode=edit`는 `write` 또는 `superuser`.
     - 권한 부족 또는 모드 OFF → URL에서 `mode` 파라미터만 제거(`history.replaceState`).
     - 토글 버튼 DOM 부여: superuser → "어드민 모드" 토글만, write→"편집 모드" 토글만, reader → 토글 없음.
     - 토글 클릭 핸들러: `setMode(targetMode if OFF else 'view')`.
  3. `setMode(next)`:
     - **State Contract 준수 (§3-A.3)**: `window.__doclightState.editor.isUnsaved()` 호출. true이면 `confirmUnsaved()`(modal-ui.js에서 직접 import) 호출. 결과 'save' → `__doclightState.editor.save()` await 후 성공 시에만 진행 / 'discard' → `editor.discard()` 후 진행 / 'cancel' → false 반환 (모드 전환 abort). 자세한 호출 표는 §3-A.3.3 참조.
     - DOM 업데이트: `body.classList.toggle('mode-edit', ['edit','admin'].includes(next))`, `body.classList.toggle('mode-admin', next==='admin')`.
     - URL 갱신: `history.replaceState(null, '', new URL with mode set or removed)`.
     - 200ms 이내 완료 위해 동기 작업만 수행 (네트워크 호출 X).
     - subscribers 호출.
     - 반환: 성공 시 true, 미저장 모달에서 [취소] 시 false.
  4. `isMobileNoDnd()`: `window.matchMedia('(max-width: 768px) and (pointer: coarse)').matches` 반환.
  5. `onModeChange(h)`: subscribers.add(h); return ()=>subscribers.delete(h).
- **Rationale**:
  - `pushState` 대신 `replaceState`만 사용 — SRS REQ-F-009 제약 (뒤로가기로 모드 토글 방지).
  - `mode=admin` 단일 값으로 어드민 모드를 표현 (편집 자동 포함). SRS Q9-b 결정.
  - 미저장 hook은 §3-A.3 State Contract의 `window.__doclightState.editor.*` (함수 reference) 단일 스키마를 따른다 — boolean 변수 형태 사용 금지(stale 위험). modal-ui.js를 9번째 모듈로 분리한 이유는 writer 편집 모드에서도 `confirmUnsaved`가 필요하기 때문 (admin-modal은 superuser 전용이라 lazy 로드 시점이 늦음).
- **함정 / 주의사항**:
  - 토글 버튼 DOM 위치: `index.ejs`의 `.content-header`(라인 96~127 부근)에 추가 (TASK-P2-002에서 처리).
  - `permissions` 배열 키 이름 — 실제 서버 응답은 `write`, `read`, `superuser` 중 어느 것인지 Phase 시작 시 1회 검증 (`curl -H 'Cookie: ...' /api/auth/session`). 가정과 다르면 `setMode` 권한 체크 분기 수정.
  - `replaceState`는 동일 origin만 가능 — 보안 무관. 단 `URL` 객체 생성 시 base 명시 (`new URL(location.href)`).
  - `body.classList` 배타: admin 모드일 때는 `mode-edit`도 반드시 함께 부여 (REQ-F-004 — admin ≡ edit).
- **테스트 작성 지침**:
  - 신규 파일: `test/e2e/mode-toggle.spec.js`
  - 시나리오: ① reader 진입 → 토글 0개 ② writer 진입 → "편집" 토글 1개 ③ writer 토글 ON → URL `?mode=edit`, body에 `mode-edit` 클래스 ④ superuser 진입 → "어드민" 토글 1개, ON 시 `?mode=admin` ⑤ reader가 `/?mode=admin` 직접 진입 → URL에서 mode 제거 ⑥ writer 토글 ON 후 OFF → URL에서 mode 제거.
- **검증 명령어**: `npx playwright test test/e2e/mode-toggle.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/mode.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/mode.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/mode-toggle.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/mode-toggle.spec.js", expected_exit: 0}
  ```
- **DoD**: (1) `node --check` 통과, (2) e2e 6 시나리오 모두 PASS, (3) 토글 클릭 후 200ms 이내 `body.mode-*` 클래스 확인 (Playwright `expect(...).toHaveClass(...)` 200ms timeout).
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/mode.js"}`
- **예상 소요**: 4~6시간

---

#### TASK-P2-002 — `src/views/index.ejs` 통합 페이지로 확장 (토글 + 관리 버튼 DOM)

- **관련 REQ-ID**: REQ-F-002, REQ-F-004, REQ-NF-005
- **파일 경로**: `src/views/index.ejs` (수정)
- **메서드/함수 시그니처**: N/A (EJS)
- **참고 패턴**: `src/views/admin.ejs:22-46`의 `#admin-toolbar` + `#mgmt-modal` DOM 구조를 통합 페이지에 이식.
- **source_anchors**: `["src/views/index.ejs:96-127", "src/views/admin.ejs:22-46"]` (실존 검증: index.ejs 96 `<div class="content-header">`. admin.ejs 22 = `<div id="admin-app">` 외측, 24 = `<div id="admin-toolbar">`, 37-46 = `#mgmt-modal` 블록 — 22-46 범위가 두 영역을 모두 포함)
- **구현 가이드 (단계별)**:
  1. `index.ejs` 의 `.content-header` 영역(라인 96~127) 안 viewer-editor-btn 옆에 모드 토글 버튼 DOM 2종 추가 (`#mode-edit-toggle`, `#mode-admin-toggle`). 둘 다 `style="display:none"` (mode.js가 권한별로 표시).
     ```html
     <button id="mode-edit-toggle" class="icon-btn mode-toggle" title="편집 모드" style="display:none;" aria-pressed="false">편집</button>
     <button id="mode-admin-toggle" class="icon-btn mode-toggle" title="어드민 모드" style="display:none;" aria-pressed="false">관리</button>
     <button id="mgmt-open-btn" class="icon-btn" title="관리 모달" style="display:none;">⚙</button>
     ```
  2. body 끝부분(라인 235 부근의 `<script>` 직전)에 `#mgmt-modal` DOM을 admin.ejs 36~46에서 복사. 단 `<div id="admin-app">`을 감싸지 말고 body 직속.
  3. 라인 236의 `<script defer src="<%= basePath %>/js/app.js"></script>`를 `<script type="module" src="<%= basePath %>/js/app.js"></script>`로 변경.
  4. `chatbotMode`일 때 module loading이 충돌하지 않도록 chatbot.js 로드는 그대로 유지 (chatbot은 비-모듈 스크립트).
  5. 기존 `#viewer-editor-btn` (라인 115)은 mode.js가 토글 시스템으로 흡수 — DOM은 남겨두되 Phase 5에서 정리(SRS 범위 외 제거 금지).
  6. **admin.css 링크 추가 (FOUC 방지)**: head 섹션에 `<link rel="stylesheet" href="<%= basePath %>/css/admin.css">`를 `style.css` 링크 다음에 추가 (관리 모달 + 토글 버튼 스타일 사용).
- **Rationale**:
  - 토글 버튼 DOM은 EJS에 정적으로 두고 표시/숨김만 mode.js가 제어 — 권한 체크 응답성 200ms 보장 (REQ-NF-002). 동적 createElement는 FOUC 발생 가능.
  - `mgmt-modal` DOM은 admin.ejs에서 통째로 이식, JS 로직은 Phase 4의 admin-modal.js가 담당.
- **함정 / 주의사항**:
  - `<script type="module">`은 `defer`가 기본 동작 — `defer` 속성은 의미상 무관하지만 같이 적지 말 것 (linter 경고 가능).
  - 모듈 스크립트는 CORS 정책 적용 — `src/`는 동일 origin이므로 무관하나 추후 CDN 시 주의.
  - `#viewer-editor-btn`은 SRS REQ에 명시 안 된 기존 버튼 — 손대지 않음 (CLAUDE.md §3).
- **테스트 작성 지침**:
  - 시나리오: ① 페이지 로드 후 `#mode-edit-toggle`, `#mode-admin-toggle`, `#mgmt-open-btn` 3개 DOM 존재 ② 초기 상태 모두 `display:none` ③ `#mgmt-modal` DOM 존재.
  - TASK-P2-001의 e2e와 통합하여 검증.
- **검증 명령어**: `npx playwright test test/e2e/mode-toggle.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "grep -q 'type=\"module\"' src/views/index.ejs", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Path src/views/index.ejs -Pattern 'type=\"module\"' -Quiet) { exit 0 } else { exit 1 }", expected_exit: 0}
  - {shell: "bash", cmd: "grep -q 'mode-edit-toggle' src/views/index.ejs", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Path src/views/index.ejs -Pattern 'mode-edit-toggle' -Quiet) { exit 0 } else { exit 1 }", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/mode-toggle.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/mode-toggle.spec.js", expected_exit: 0}
  ```
- **DoD**: (1) `<script type="module">` 1회 이상 매치, (2) 3개 토글/관리 DOM 존재, (3) e2e PASS, (4) `npm start` 후 `/` 진입 콘솔 에러 0건.
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 2시간

---

#### TASK-P2-003 — `public/js/app.js`를 ES Module 엔트리로 변환 + 권한별 lazy import

- **관련 REQ-ID**: REQ-NF-005
- **파일 경로**: `public/js/app.js` (수정 — 본 Phase에서는 트리/뷰어 잔존 로직은 그대로 유지하고 엔트리 부분만 변환)
- **메서드/함수 시그니처**: `import { initMode, onModeChange } from './modules/mode.js'` 등 ESM import 추가. 기존 IIFE 또는 전역 변수 코드는 모듈 스코프로 이동(필요한 것만 `window.X = ...` 노출).
- **참고 패턴**: 없음 — 신규 패턴 (기존 코드는 비-모듈)
- **source_anchors**: `["public/js/app.js:1-100"]` (엔트리 영역 — 실존 검증: 파일 시작 부분)
- **구현 가이드 (단계별)**:
  **단일 통합 코드 (DOMContentLoaded 핸들러 안에 한 블록으로 작성 — step별 분리 금지, 호출 순서 절대 준수)**:

  1. `app.js` 최상단(파일 모듈 스코프)에 import 추가:
     ```js
     import { initMode, onModeChange, isMobileNoDnd } from './modules/mode.js';
     import * as modalUi from './modules/modal-ui.js';
     ```
  2. 기존 `DOMContentLoaded` 핸들러 본문에 다음을 **순서대로** 작성 (a→b→c→d 절대 순서 준수):
     ```js
     document.addEventListener('DOMContentLoaded', async () => {
       // (a) state contract 초기화 (§3-A.3.1)
       window.__doclightState = {
         editor: { isUnsaved: () => false, save: async () => false, discard: () => {} },
         modal: { showConfirm: async () => 'cancel' },
       };
       modalUi.activate();
       // (b) onModeChange 핸들러 먼저 등록 (CRITICAL — initMode 호출 전 필수)
       let loaded = { tree: null, dnd: null, upload: null, ctx: null, editor: null, adminModal: null };
       onModeChange(async (mode) => {
         if (mode === 'edit' || mode === 'admin') {
           loaded.tree     ||= await import('./modules/tree.js');
           loaded.dnd      ||= await import('./modules/dnd.js');
           loaded.upload   ||= await import('./modules/upload.js');
           loaded.ctx      ||= await import('./modules/context-menu.js');
           loaded.editor   ||= await import('./modules/editor.js');
           loaded.tree.activate(); loaded.dnd.activate(); loaded.upload.activate();
           loaded.ctx.activate(); loaded.editor.activate();
           if (mode === 'admin') {
             loaded.adminModal ||= await import('./modules/admin-modal.js');
             loaded.adminModal.activate();
           } else if (loaded.adminModal) {
             loaded.adminModal.deactivate();
           }
         } else {
           // view mode: 명시적 deactivate (이벤트 리스너 + state hook 해제)
           loaded.editor?.deactivate();    // __doclightState.editor noop 복원
           loaded.ctx?.deactivate();
           loaded.upload?.deactivate();
           loaded.dnd?.deactivate();
           loaded.tree?.deactivate();      // 내부에서 __viewTree.activate() 호출
           loaded.adminModal?.deactivate();
         }
       });
       // (c) 그 후에 initMode 호출 — 핸들러 등록 후이므로 /?mode=admin 직접 진입 시 lazy import 발화
       await initMode();
       // ... 기존 viewer 초기화 (TOC, 검색 등 잔존 로직)
     });
     ```
     **호출 순서 절대 준수**: state init → modalUi.activate → onModeChange 등록 → initMode. 역순이면 `/?mode=admin` 직접 URL 진입 시 핸들러 미발화 (회귀).
  3. **graceful degradation (Phase 2 한정 임시 코드)**: 위 onModeChange 핸들러 내부의 각 `await import(...)` 호출만을 try-catch로 감싸 Phase 3/4 구현 전 모듈 부재 시에도 view 모드는 동작하도록 보호. **try-catch는 onModeChange 콜백 내부에서만 사용** — DOMContentLoaded 외부 또는 view 모드 진입 시점에 import 호출 금지(reader Network 요청 0회 보장):
     ```js
     // onModeChange 콜백 내부에서만:
     try { loaded.tree ||= await import('./modules/tree.js'); } catch (e) { console.warn('tree.js not yet implemented', e); }
     ```
     이 try-catch는 Phase 5 종료 시 TASK-P5-002에서 제거.
  4. 기존 전역 `LocalPreview` 같은 식별자 의존이 없는지 재확인.
- **Rationale**:
  - Lazy import — view 모드만 쓰는 reader는 무거운 편집/업로드 모듈을 다운로드하지 않는다. SRS REQ-NF-002 (응답성).
  - try-catch graceful degradation — Phase 단위 점진 통합. Phase 2 종료 후에도 view 모드는 정상 동작 보장.
- **함정 / 주의사항**:
  - 모듈 스크립트는 strict mode 자동 적용 — 기존 `var x` 가 글로벌 누출이었다면 깨질 수 있음. 콘솔 에러 발생 시 명시적 `window.x = x` 추가.
  - `await import()` 동적 import는 모든 메이저 브라우저 지원 (ES2020).
  - `import` 경로는 반드시 `./modules/...` 상대 경로 + `.js` 확장자 명시 (브라우저 ESM은 확장자 생략 X).
- **테스트 작성 지침**:
  - 시나리오: ① 페이지 로드 후 콘솔 에러 0건 (네이티브 ESM 로드 정상) ② Network 탭에 `mode.js` 요청 1회 ③ view 모드 reader는 `tree.js` 등 요청 0건 (lazy 미발동).
- **검증 명령어**: `npx playwright test test/e2e/mode-toggle.spec.js` (TASK-P2-001과 동일 e2e가 통합 검증)
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/app.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/app.js", expected_exit: 0}
  - {shell: "bash", cmd: "grep -q \"import .* from './modules/mode.js'\" public/js/app.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Path public/js/app.js -Pattern \"from './modules/mode.js'\" -Quiet) { exit 0 } else { exit 1 }", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/mode-toggle.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/mode-toggle.spec.js", expected_exit: 0}
  ```
- **DoD**: (1) `node --check` 통과, (2) ESM import 문 존재, (3) e2e PASS, (4) reader 로드 시 Network 요청 mode.js 1회 + tree.js 0회.
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 3~4시간

---

### 5.3 Phase 2 테스트 전략
- **Mock 금지** — 실제 fetch + 실제 세션 쿠키 사용. `test/fixtures/`의 테스트 사용자 활용.
- 단위 테스트보다 e2e 위주 (모듈 간 통합이 핵심).

### 5.4 Phase 2 완료 조건 (DoD)
1. TASK-P2-001~003 모두 acceptance_tests PASS
2. 통합 e2e: writer/superuser/reader 3종 세션으로 토글 동작 검증
3. `node --check public/js/modules/mode.js` 통과
4. 페이지 로드 시 콘솔 에러 0건 (모든 권한)
5. 토글 클릭 → `body.mode-*` 부여 ≤200ms

---

## 6. Phase 3 — 트리/DnD/업로드 모듈 분할 (tree.js + dnd.js + upload.js)

### 6.1 목표
`admin.js`의 TreeModule, DragDropModule, UploadModule을 ES Module 3개 파일로 분리하고, 통합 페이지의 좌측 트리에 부착한다. mode.js의 `onModeChange`로 활성/비활성 제어.

### 6.2 선행 조건
Phase 2 완료 (mode.js, EJS DOM, app.js 엔트리).

---

#### TASK-P3-001 — `public/js/modules/tree.js` 신규 작성

- **관련 REQ-ID**: REQ-F-003, REQ-F-005, REQ-F-013, REQ-NF-005
- **파일 경로**: `public/js/modules/tree.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  export function activate(): void              // 트리 DOM 렌더링 + 이벤트 바인딩
  export function deactivate(): void
  export async function refresh(): Promise<void>
  export function getSelectedPath(): string | null
  ```
- **참고 패턴**: `public/js/admin.js:378-572` TreeModule 정의를 그대로 ESM 변환.
- **source_anchors**: `["public/js/admin.js:378-572"]` (실존 검증: Grep `^const TreeModule = {` 라인 378)
- **구현 가이드 (단계별)**:
  1. `admin.js` 라인 378~572의 `TreeModule` 객체 본문을 `tree.js`로 복사.
  2. `const TreeModule = {` 시작 라인을 제거하고 객체 메서드를 `export function name(...) { ... }` 형태로 변환.
  3. 내부에서 `AdminAPI.tree(...)` 호출하던 부분은 `fetch('/api/admin/tree')` 직접 호출로 교체 (admin.js의 AdminAPI 객체는 본 Phase에서 미이식 — Phase 4의 별도 작업).
  4. `activate()`에서 트리 컨테이너(`#tree-menu`, `index.ejs:85`)에 트리 DOM 렌더링 + 클릭 이벤트 바인딩.
  5. `deactivate()`에서 이벤트 리스너 해제.
- **Rationale**: 통합 페이지에서는 view 모드도 트리를 보여줘야 하지만, 편집/어드민 모드에서 admin API 트리(권한 정보 포함)를 사용해야 한다. 본 모듈은 편집/어드민 모드 전용 트리(admin API 사용). view 모드 트리는 기존 app.js 코드를 **명시적 진입점으로 캡슐화** 후 본 모듈과 mutex 운용.
- **함정 / 주의사항**:
  - **view 트리 캡슐화 의무 (사전 단계 0번 — 본 TASK 첫 작업)**:
    1. `grep -n "tree-menu\|TreeView\|renderTree\|addEventListener.*click" public/js/app.js | head -30`로 view 트리 핸들러 위치 식별.
    2. **익명 화살표 핸들러 → 명명 모듈 스코프 함수로 리팩토링** (필수 — `removeEventListener`는 동일 reference 필요):
       - ❌ `treeMenu.addEventListener('click', async (e) => { ... })`
       - ✅ `function onViewTreeClick(e) { ... }` 정의 후 `treeMenu.addEventListener('click', onViewTreeClick)`
    3. `window.__viewTree = { activate, deactivate }` 정의:
       - `activate()`: `treeMenu.addEventListener('click', onViewTreeClick)` + 트리 DOM 렌더
       - `deactivate()`: `treeMenu.removeEventListener('click', onViewTreeClick)` + `treeMenu.innerHTML = ''`
    4. 캡슐화 직후 회귀 e2e 1건 PASS 확보 (view 모드 단독 클릭 동작 보존) 후 본 TASK 본 작업 진행.
  - **Mutex 보장**: tree.js `activate()` 첫 줄에서 `window.__viewTree?.deactivate()` 호출, `deactivate()` 마지막에 `window.__viewTree?.activate()` 호출. 동시 활성 금지.
  - 트리 DOM의 expand/collapse 상태 보존은 본 SRS 범위 외 (단순 새로고침 허용).
- **테스트 작성 지침**:
  - 신규: `test/e2e/tree-mode.spec.js`. ① writer 편집 모드 ON → 트리에 편집 가능 항목 표시 ② 모드 OFF → 일반 트리 복귀 ③ 트리 항목 클릭 → 본문 영역에 문서 로드 ④ **연속 토글 5회 클릭 후 트리 항목 수 일정** (race condition 검증) ⑤ **클릭 1회 → 콜백 1회** (이벤트 리스너 누출 검증).
- **검증 명령어**: `npx playwright test test/e2e/tree-mode.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/tree.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/tree.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/tree-mode.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/tree-mode.spec.js", expected_exit: 0}
  ```
- **DoD**: (1) syntax check PASS, (2) e2e 5 시나리오(③④⑤ 포함) PASS, (3) 클릭 1회당 콜백 1회 (e2e ⑤ 검증 — 정량).
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/tree.js"}`
- **예상 소요**: 4시간

---

#### TASK-P3-002 — `public/js/modules/dnd.js` 신규 작성 (드래그앤드롭 핸들러)

- **관련 REQ-ID**: REQ-F-003, REQ-F-005, REQ-F-010, REQ-NF-005
- **파일 경로**: `public/js/modules/dnd.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  export function activate(treeContainerEl: HTMLElement): void
  export function deactivate(): void
  ```
- **참고 패턴**: `public/js/admin.js:2077-2305` DragDropModule
- **source_anchors**: `["public/js/admin.js:2077-2304"]` (실존 검증: Grep `^const DragDropModule = {` 라인 2077, 객체 닫는 `};` 2304. SRS §4.3은 2077-2423으로 표기되어 있으나 실측 결과 2304가 정확 — SRS 표기 오류).
- **구현 가이드 (단계별)**:
  1. `admin.js:2077-2304`의 DragDropModule을 복사하여 `dnd.js`로 변환.
  2. `activate(treeContainerEl)`:
     - `isMobileNoDnd()` 호출. true 면 즉시 return (모바일에서 DnD 비활성 — REQ-F-010).
     - `treeContainerEl`에 `dragover`, `dragleave`, `drop` 이벤트 바인딩.
     - `drop` 핸들러에서 `e.dataTransfer.items` → `webkitGetAsEntry()` 재귀 순회 → 파일 목록 수집.
     - `upload.js`의 `enqueue(files)` 호출.
  3. `deactivate()`: 모든 이벤트 리스너 해제.
  4. 본문 영역에는 절대 바인딩하지 않음 (REQ-F-005 AC#5).
- **Rationale**: REQ-F-005 — 드롭 영역은 좌측 트리 컨테이너 한정. REQ-F-010 — 모바일은 DnD 비활성하되 다른 기능은 유지.
- **함정 / 주의사항**:
  - `webkitGetAsEntry`는 비표준이지만 모든 메이저 브라우저(Chrome/Edge/Firefox/Safari)에서 prefixed 구현으로 cross-browser 동작 (MDN: "Non-standard. Check the Browser compatibility table carefully before using this in production").
  - `dragover` 핸들러에서 반드시 `e.preventDefault()` 호출해야 drop 이벤트가 발생한다 (HTML5 표준 함정).
  - `isMobileNoDnd()`는 mode.js에서 import — 모드 활성 시점에 1회만 평가 (resize 이벤트 무시 — 단순 정책).
- **테스트 작성 지침**:
  - 신규: `test/e2e/dnd.spec.js`. Playwright `page.dispatchEvent('drop', { dataTransfer })` 또는 `page.locator(...).setInputFiles()` 사용. ① 데스크톱 drop → 업로드 시작 ② 모바일 viewport(375x667 + touch) → drop 무반응 ③ 본문 영역 drop → 무반응.
- **검증 명령어**: `npx playwright test test/e2e/dnd.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/dnd.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/dnd.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/dnd.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/dnd.spec.js", expected_exit: 0}
  ```
- **DoD**: (1) syntax PASS, (2) e2e 3 시나리오 PASS.
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/dnd.js"}`
- **예상 소요**: 3~4시간

---

#### TASK-P3-003 — `public/js/modules/upload.js` 신규 작성 (업로드 큐 + 진행률)

- **관련 REQ-ID**: REQ-F-003, REQ-F-005, REQ-NF-005
- **파일 경로**: `public/js/modules/upload.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  export function activate(): void
  export function deactivate(): void
  export async function enqueue(files: Array<{path: string, file: File}>): Promise<void>
  ```
- **참고 패턴**: `public/js/admin.js:2524-2925` UploadModule
- **source_anchors**: `["public/js/admin.js:2524-2925"]` (실존 검증: Grep `^const UploadModule = {` 시작 2524, 닫는 `};` 2925. SRS §4.3의 `2524-2723`은 모듈 내부 라인이며 표기 오류 — 실측 정정).
- **구현 가이드 (단계별)**:
  1. `admin.js:2524-2925` (전체 402줄 inclusive — 닫는 `};` 라인 2925) 복사하여 `upload.js`로 변환. 라인 2724-2925에 `getFileFromEntry`, `uploadFilesWithPaths`, `uploadSingleFile` 등 핵심 메서드가 있으므로 절대 누락 금지.
  2. `enqueue(files)`: 각 파일을 `FormData`에 담아 `POST /api/admin/upload` 전송. 진행률은 `XMLHttpRequest.upload.onprogress` 사용 (fetch는 진행률 미지원).
  3. 진행률 토스트 DOM은 `index.ejs`에 컨테이너 추가 필요 → TASK-P3-003.5 (작은 EJS 수정 — 본 TASK에 포함). `<div id="upload-toast-container"></div>`를 body 끝에 추가.
  4. `dnd.js`에서 import하여 호출.
  5. 완료 후 `tree.js`의 `refresh()` 호출.
- **Rationale**: SRS REQ-F-005 — UploadModule을 그대로 이식. fetch + ReadableStream으로 진행률 구현은 가능하나 admin.js의 XHR 패턴 그대로 유지 (touch-only-what-you-must).
- **함정 / 주의사항**:
  - 업로드 진행률 다중 표시 — 동시 다발 업로드 시 토스트 N개. UploadModule 원본의 큐잉 로직 유지.
  - 서버 측 multer 한계(파일 크기) — `multer ^1.4.5-lts.1` 기본 무제한이지만 프로덕션 설정 확인.
- **테스트 작성 지침**:
  - 신규: `test/e2e/upload.spec.js`. ① 단일 파일 업로드 → 200 응답 + 트리 새로고침 ② 다중 파일 → 진행률 토스트 N개 표시 ③ 디렉토리 업로드 → 폴더 구조 보존.
- **검증 명령어**: `npx playwright test test/e2e/upload.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/upload.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/upload.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/upload.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/upload.spec.js", expected_exit: 0}
  ```
- **DoD**: e2e 3 시나리오 PASS (시나리오 안에 fetch 응답 status === 200 검증 포함).
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/upload.js"}`
- **예상 소요**: 4시간

---

### 6.3 Phase 3 테스트 전략
- Mock 금지. 실제 multer 핸들러로 임시 디렉토리(`test/fixtures/upload-target/`)에 업로드 후 검증.
- 다중 모듈 통합: tree+dnd+upload 한꺼번에 e2e로 검증.

### 6.4 Phase 3 완료 조건 (DoD)
1. TASK-P3-001~003 모두 acceptance_tests PASS
2. writer 편집 모드에서 파일 drop → 업로드 → 트리 새로고침 1-pass 검증
3. 모바일 viewport에서 drop 무반응 검증
4. `public/js/modules/` 에 mode/tree/dnd/upload 4개 파일 존재

---

## 7. Phase 4 — 컨텍스트 메뉴/에디터/관리 모달 분할 (context-menu.js + editor.js + admin-modal.js)

### 7.1 목표
편집·어드민 모드의 핵심 인터랙션 — 트리 우클릭 메뉴, 인라인 편집기, 사용자/그룹/권한 관리 모달을 ES Module로 분할. 미저장 경고 3-버튼 모달도 본 Phase에 포함.

### 7.2 선행 조건
Phase 3 완료.

> **작업 순서 (의무)**: TASK-P4-000 (modal-ui) → P4-001 (context-menu, modal-ui만 의존) → P4-002 (editor, hook 등록) → P4-003 (admin-modal, editor의 unsaved 시나리오 ⑤⑥ e2e 의존).

---

#### TASK-P4-000 — `public/js/modules/modal-ui.js` 신규 작성 (showConfirm + confirmUnsaved 분리)

- **관련 REQ-ID**: REQ-F-008, REQ-NF-003, REQ-NF-005
- **파일 경로**: `public/js/modules/modal-ui.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  export function activate(): void                                          // __doclightState.modal.showConfirm 교체
  export async function showConfirm(opts: {title, body, primary, secondary?, cancel}): Promise<'primary'|'secondary'|'cancel'>
  export async function confirmUnsaved(): Promise<'save'|'discard'|'cancel'>
  ```
- **참고 패턴**: `public/js/admin.js:1042-1228` ModalModule
- **source_anchors**: `["public/js/admin.js:1042-1228"]` (실존 검증: Grep `^const ModalModule = {` 라인 1042)
- **구현 가이드 (단계별)**:
  1. `admin.js:1042-1228` ModalModule을 본 모듈에 흡수.
  2. `showConfirm`을 일반화 (3-버튼: primary, secondary 옵션, cancel).
  3. `confirmUnsaved()`: SRS REQ-F-008 확정 카피 사용 — title "저장하지 않은 변경사항이 있습니다", body "이 페이지를 떠나면 작성한 내용이 사라집니다.", primary "저장하고 나가기", secondary "버리고 나가기", cancel "취소". 매핑: primary→'save', secondary→'discard', cancel→'cancel'.
  4. `activate()`: `window.__doclightState.modal.showConfirm = showConfirm` 노출.
- **Rationale**: §3-A.3.2에 명시 — admin-modal에 두면 writer 모드에서 로드되지 않는 lazy import 정책 충돌. 분리하여 모든 모드에서 활성.
- **함정 / 주의사항**: `window.alert/confirm/prompt` 사용 금지 (CLAUDE.md §0). 모달 DOM은 동적 createElement (EJS에 고정 DOM 추가하지 않음).
- **테스트 작성 지침**:
  - 신규: `test/e2e/modal-ui.spec.js`. ① showConfirm 호출 → 모달 표시 ② primary 버튼 클릭 → 'primary' 반환 ③ confirmUnsaved 카피 일치 ④ ESC 키 → 'cancel' 반환.
- **검증 명령어**: `npx playwright test test/e2e/modal-ui.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/modal-ui.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/modal-ui.js", expected_exit: 0}
  - {shell: "bash", cmd: "if grep -E 'window\\.(alert|confirm|prompt)\\(' public/js/modules/modal-ui.js ; then exit 1 ; else exit 0 ; fi", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Path public/js/modules/modal-ui.js -Pattern 'window\\.(alert|confirm|prompt)\\(' -Quiet) { exit 1 } else { exit 0 }", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/modal-ui.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/modal-ui.spec.js", expected_exit: 0}
  ```
- **DoD**: e2e 4 PASS + 브라우저 다이얼로그 0건.
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/modal-ui.js"}`
- **예상 소요**: 3시간

---

#### TASK-P4-001 — `public/js/modules/context-menu.js` 신규 작성

- **관련 REQ-ID**: REQ-F-006, REQ-NF-005
- **파일 경로**: `public/js/modules/context-menu.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  export function activate(): void
  export function deactivate(): void
  ```
- **참고 패턴**: `public/js/admin.js:901-1037` ContextMenuModule
- **source_anchors**: `["public/js/admin.js:901-1037"]` (실존 검증: Grep `^const ContextMenuModule = {` 시작 901, 닫는 `};` 1037)
- **구현 가이드 (단계별)**:
  1. `admin.js:901-1037` 복사 → ESM 변환.
  2. 메뉴 항목: 생성/이름변경/삭제/복사/이동/편집 (admin.js 원본 그대로).
  3. 삭제 항목 클릭 → `modal-ui.js`의 `showConfirm` 호출 (admin-modal 아님 — §3-A.3.2 참조). 브라우저 confirm 금지.
  4. 편집 항목 → editor.js의 `open(path)` 호출.
- **Rationale**: SRS REQ-F-006 — admin.js ContextMenuModule 그대로 이식.
- **함정 / 주의사항**:
  - 모드 OFF 시 `contextmenu` 이벤트 핸들러가 바인딩되어 있으면 안 됨 — `deactivate()` 정확히.
  - 메뉴 표시 위치: 우클릭 좌표 + viewport 가장자리 처리 (admin.js 원본 로직 유지).
- **테스트 작성 지침**:
  - 신규: `test/e2e/context-menu.spec.js`. ① 편집 모드 ON, 트리 우클릭 → 커스텀 메뉴 표시 ② 모드 OFF, 우클릭 → 브라우저 기본 메뉴(커스텀 메뉴 없음) ③ 메뉴 "삭제" → 내부 모달 confirm.
- **검증 명령어**: `npx playwright test test/e2e/context-menu.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/context-menu.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/context-menu.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/context-menu.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/context-menu.spec.js", expected_exit: 0}
  ```
- **DoD**: e2e 3 PASS + `grep window.confirm public/js/modules/context-menu.js` 0건.
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/context-menu.js"}`
- **예상 소요**: 3시간

---

#### TASK-P4-002 — `public/js/modules/editor.js` 신규 작성 (인라인 편집기 + unsaved hook)

- **관련 REQ-ID**: REQ-F-003, REQ-F-007, REQ-F-008, REQ-NF-005
- **파일 경로**: `public/js/modules/editor.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  export function activate(): void                       // __doclightState.editor.{isUnsaved,save,discard} 등록
  export function deactivate(): void                     // 위 3개를 noop으로 복원
  export async function open(path: string): Promise<void>
  export function isUnsaved(): boolean
  export async function save(): Promise<boolean>         // true=성공, false=실패 (4xx/5xx)
  export function discard(): void
  ```
- **참고 패턴**: `public/js/admin.js:1308-1625` EditorModule
- **source_anchors**: `["public/js/admin.js:1308-1625"]` (실존 검증: Grep `^const EditorModule = {` 시작 1308, 닫는 `};` 1625)
- **구현 가이드 (단계별)**:
  1. `admin.js:1308-1625` 복사 → ESM 변환.
  2. `open(path)`: `GET /api/admin/file?path=...` → 응답 본문을 textarea/CodeMirror 등 편집 UI에 마운트. admin.ejs에 의존하던 고정 ID(`#editor-textarea`) 의존을 동적 createElement로 변환:
     ```js
     const editorEl = document.createElement('div');
     editorEl.id = 'inline-editor';
     document.querySelector('#markdown-content').appendChild(editorEl);
     ```
  3. `save()`: `PUT /api/admin/content` 또는 `/api/admin/file` (admin-api.js:88, 102 확인 — `PUT /api/admin/content`가 정확함).
  4. `isUnsaved()`: 내부 `dirty` 플래그 반환. textarea input 이벤트로 갱신.
  5. **State Contract 등록 (§3-A.3)**: `activate()` 내에서 `window.__doclightState.editor = { isUnsaved, save, discard }` 교체. `deactivate()`에서 `{ isUnsaved: () => false, save: async () => false, discard: () => {} }` noop으로 복원. mode.js의 setMode는 이 함수 reference를 호출.
- **Rationale**:
  - 동적 마운트로 admin.ejs 고정 ID 의존 제거 — index.ejs에 `#markdown-content`만 있으면 충분.
  - hook 노출은 함수 reference로 (변수가 아님) — closure 갱신 보장.
- **함정 / 주의사항**:
  - 편집 진입 시 마크다운 뷰어 영역을 숨기고 편집 UI 마운트 — 닫을 때 정확히 복원 (DOM 누출 방지).
  - 비-마크다운 파일(.png 등)은 `open()` 진입 차단 (REQ-F-007 AC#4).
  - PUT 응답 4xx/5xx 시 `save()`는 false 반환 — 호출자(미저장 모달)가 에러 토스트 표시.
- **테스트 작성 지침**:
  - 신규: `test/e2e/editor.spec.js`. ① .md 파일 편집 진입 → 편집기 표시 + 원본 로드 ② 편집 후 저장 → 200 + 편집기 닫힘 + 뷰어 복귀 ③ 편집 후 취소 트리거 → 미저장 모달 ④ 비-마크다운 → 편집 메뉴 비활성.
- **검증 명령어**: `npx playwright test test/e2e/editor.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/editor.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/editor.js", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/editor.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/editor.spec.js", expected_exit: 0}
  ```
- **DoD**: e2e 4 PASS. 서버 500 강제 시 모달 유지 검증은 본 TASK 단독으로는 불가하므로 **TASK-P4-003 e2e 시나리오 ⑤⑥에서 통합 검증** (cross-TASK 위임 명시).
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/editor.js"}`
- **예상 소요**: 5~7시간 (가장 복잡한 모듈)

---

#### TASK-P4-003 — `public/js/modules/admin-modal.js` 신규 작성 (관리 모달 전용)

- **관련 REQ-ID**: REQ-F-004, REQ-F-008, REQ-NF-003, REQ-NF-005
- **파일 경로**: `public/js/modules/admin-modal.js` (신규)
- **메서드/함수 시그니처**:
  ```js
  export function activate(): void                  // 관리 버튼 클릭 핸들러 바인딩
  export function deactivate(): void
  export function openManagementModal(): void
  ```
- **참고 패턴**: `public/js/admin.js:1630-2072` ManagementModule (showConfirm/confirmUnsaved는 modal-ui.js에 분리됨 — TASK-P4-000)
- **source_anchors**: `["public/js/admin.js:1630-2072"]` (실존 검증: Grep `^const ManagementModule = {` 라인 1630)
- **구현 가이드 (단계별)**:
  1. ManagementModule(1630-2073)을 흡수 — `openManagementModal()` 호출 시 사용자/그룹/권한 탭 UI 렌더 (`#mgmt-modal` DOM은 TASK-P2-002에서 EJS에 추가됨).
  2. 모달 내 confirm이 필요하면 `import { showConfirm } from './modal-ui.js'` 또는 `window.__doclightState.modal.showConfirm` 호출.
  3. `activate()`: `#mgmt-open-btn` 클릭 핸들러 바인딩 → `openManagementModal()`.
- **Rationale**: 관리 모달은 superuser 전용이므로 lazy import. showConfirm/confirmUnsaved는 모든 모드에서 필요하므로 modal-ui.js로 분리(§3-A.3.2).
- **함정 / 주의사항**:
  - **`window.alert/confirm/prompt` 사용 금지** (CLAUDE.md §0). 모든 confirm은 modal-ui.js의 showConfirm 통해.
  - 기존 ManagementModule이 사용하던 admin.ejs 고정 ID(`#mgmt-tabs`, `#mgmt-content`)는 TASK-P2-002에서 index.ejs로 이식 완료 — 동작 보장.
- **테스트 작성 지침**:
  - 신규: `test/e2e/admin-modal.spec.js`. ① superuser 어드민 모드 ON → 관리 버튼 표시 ② 관리 버튼 클릭 → 모달 표시 + 사용자 탭 ③ 모달 닫기 → 어드민 모드 ON 유지 ④ **편집 중 토글 OFF → 3-버튼 모달** (modal-ui.js의 confirmUnsaved 호출 통합 검증) ⑤ [저장하고 나가기] + 서버 200 → 모드 OFF ⑥ [저장하고 나가기] + 서버 500 → 모달 유지 + 에러 토스트 ⑦ [버리고 나가기] → 모드 OFF ⑧ [취소] → 편집기 유지.
  - 서버 500 강제 방법: `test/fixtures/server-error-toggle.js` 신규 작성 — 환경변수 `DOCLIGHT_FORCE_PUT_500=1`이면 admin-file-controller의 PUT이 500 반환. Mock이 아닌 실제 분기 로직.
- **검증 명령어**: `npx playwright test test/e2e/admin-modal.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "node --check public/js/modules/admin-modal.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "node --check public/js/modules/admin-modal.js", expected_exit: 0}
  - {shell: "bash", cmd: "if grep -E 'window\\.(alert|confirm|prompt)\\(' public/js/modules/admin-modal.js ; then exit 1 ; else exit 0 ; fi", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Path public/js/modules/admin-modal.js -Pattern 'window\\.(alert|confirm|prompt)\\(' -Quiet) { exit 1 } else { exit 0 }", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/admin-modal.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/admin-modal.spec.js", expected_exit: 0}
  ```
- **DoD**: e2e 8 PASS + 브라우저 다이얼로그 사용 0건 + 서버 500 시 모달 유지 검증.
- **rollback**: `{strategy: "file-delete", command: "rm public/js/modules/admin-modal.js"}`
- **예상 소요**: 6~8시간

---

### 7.3 Phase 4 테스트 전략
- Mock 금지. 실제 사용자/그룹/권한 API 호출.
- 미저장 모달 시나리오는 서버 강제 500을 위해 fixture 또는 임시 미들웨어 토글 사용.

### 7.4 Phase 4 완료 조건 (DoD)
1. **TASK-P4-000~003 모두** acceptance_tests PASS
2. `grep -rn 'window.alert\|window.confirm\|window.prompt' public/js/modules/` 0건
3. `public/js/modules/` 에 8개 모듈 파일 (mode/tree/dnd/upload/context-menu/editor/modal-ui/admin-modal) + README.md. app.js는 modules/ 외 — 총 9개 JS 파일 (8 모듈 + 1 엔트리).
4. superuser 시나리오 1-pass 수동 회귀: 진입 → 어드민 ON → 파일 업로드 → 편집 → 저장 → 모드 OFF.

---

## 8. Phase 5 — `/doc/*` 라우트 통합 + E2E 회귀 + 정리

### 8.1 목표
- `/doc/*` 라우트도 통합 페이지(index.ejs)와 동일 모듈을 사용하도록 통일.
- Phase 2 TASK-P2-003에서 도입한 try-catch graceful degradation 제거.
- `src/views/admin.ejs` 파일 제거 (또는 placeholder만 유지).
- 통합 e2e 회귀 + 성능 검증.

### 8.2 선행 조건
Phase 4 완료.

---

#### TASK-P5-001 — `/doc/*` 라우트가 동일 모듈 로드하도록 `doc-viewer.ejs` 갱신

- **관련 REQ-ID**: REQ-F-013, REQ-NF-004
- **파일 경로**: `src/views/doc-viewer.ejs` (수정), `src/app.js` (확인)
- **메서드/함수 시그니처**: N/A (EJS)
- **참고 패턴**: TASK-P2-002에서 index.ejs에 추가한 토글 DOM + `<script type="module">` 패턴을 doc-viewer.ejs에도 동일 적용.
- **source_anchors**: `["src/views/doc-viewer.ejs:1-372", "src/views/index.ejs:96-127"]` (실존 검증: doc-viewer.ejs는 372줄, index.ejs `.content-header`는 96~127)
- **구현 가이드 (단계별)**:
  1. `doc-viewer.ejs`에 모드 토글 DOM(TASK-P2-002와 동일 3개 버튼)을 헤더에 추가.
  2. `<script>` 태그를 `<script type="module">`로 변경, `src`를 `app.js`로 통일.
  3. `mgmt-modal` DOM도 body 끝에 동일 추가.
  4. 라우트 핸들러(`src/app.js`)는 변경 없음 — 같은 EJS 패턴이므로 mode.js가 URL `/doc/...?mode=edit` 처리.
- **Rationale**: SRS REQ-F-013 — `/doc/*`도 동일 모드 시스템.
- **함정 / 주의사항**:
  - doc-viewer.ejs는 index.ejs와 별도 — 두 파일이 어긋나지 않게 토글 DOM은 EJS partial로 추출 검토(과도하면 단순 복사로). 본 SRS 범위에선 단순 복사 — partial 추출은 추후 리팩토링.
  - URL `/doc/foo.md?mode=edit` 시 mode.js는 search만 본다 (path는 무관) — 이미 보장.
- **테스트 작성 지침**:
  - 신규: `test/e2e/doc-route.spec.js`. ① writer 진입 `/doc/foo.md` → 편집 토글 표시 ② 토글 ON → URL `/doc/foo.md?mode=edit` ③ 트리 DnD 동작.
- **검증 명령어**: `npx playwright test test/e2e/doc-route.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "grep -q 'type=\"module\"' src/views/doc-viewer.ejs", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Path src/views/doc-viewer.ejs -Pattern 'type=\"module\"' -Quiet) { exit 0 } else { exit 1 }", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test test/e2e/doc-route.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/doc-route.spec.js", expected_exit: 0}
  ```
- **DoD**: e2e 3 PASS.
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 2~3시간

---

#### TASK-P5-002 — `app.js` 엔트리의 try-catch graceful degradation 제거

- **관련 REQ-ID**: REQ-NF-005
- **파일 경로**: `public/js/app.js` (수정)
- **메서드/함수 시그니처**: TASK-P2-003에서 추가한 try-catch 블록 제거
- **참고 패턴**: TASK-P2-003 자기 자신
- **source_anchors**: `["public/js/app.js:1-100"]` (TASK-P2-003에서 변경한 영역)
- **구현 가이드 (단계별)**:
  1. `app.js` 엔트리의 동적 import 호출 try-catch 제거.
  2. 모든 모듈이 존재함을 가정하고 직접 await import.
  3. `console.warn('module not yet implemented')` 로그 제거.
- **Rationale**: Phase 1~4 완료 후 모든 모듈 존재 — graceful degradation은 더 이상 필요 없음.
- **함정 / 주의사항**: 이 변경 후 모듈 누락 시 페이지 전체 깨짐 — Phase 4 DoD 통과 확인 후에만 진행.
- **테스트 작성 지침**: 별도 추가 없음 — 모든 e2e가 회귀 검증.
- **검증 명령어**: `npx playwright test`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "if grep -E 'try.*await import' public/js/app.js ; then exit 1 ; else exit 0 ; fi", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Select-String -Path public/js/app.js -Pattern 'try.*await import' -Quiet) { exit 1 } else { exit 0 }", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test", expected_exit: 0}
  ```
- **DoD**: try-catch 0건 + 전체 e2e PASS.
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 1시간

---

#### TASK-P5-003 — `src/views/admin.ejs` 제거 + `public/js/admin.js` 제거 + `public/css/admin.css` 검토

- **관련 REQ-ID**: REQ-NF-005
- **파일 경로**: `src/views/admin.ejs` (삭제), `public/js/admin.js` (삭제), `public/css/admin.css` (검토 — 모듈 8개에서 참조하는 셀렉터만 유지하거나 통합)
- **메서드/함수 시그니처**: N/A
- **참고 패턴**: 없음 — 단순 삭제
- **source_anchors**: `["src/views/admin.ejs:1-218", "public/js/admin.js:1-2974"]` (실존 검증: 라인 수 일치)
- **구현 가이드 (단계별)**:
  1. `git rm src/views/admin.ejs public/js/admin.js`.
  2. `admin.css`는 모듈에서 import하는지 grep — `grep -rn "admin.css" src/views public/js/modules`. 참조 있으면 유지, 없으면 삭제.
  3. `src/app.js`에서 admin 라우트는 이미 Phase 1에서 redirect로 변경됨 — admin.ejs 렌더 코드 0건 재확인.
- **Rationale**: 통합 페이지 모듈 분할 완료 후 원본 파일은 죽은 코드. SRS REQ-NF-005 — 8개 파일로 분할 + 원본 폐기.
- **함정 / 주의사항**:
  - admin.ejs/admin.js를 import하는 다른 코드 0건 보장 (grep으로 사전 확인).
  - admin.css의 `#admin-toolbar` 같은 셀렉터는 통합 페이지에서도 토글 DOM이 사용 — admin.css는 유지하거나 style.css로 머지. 본 TASK는 단순 검토에 그침; 머지는 SRS 범위 외 (감수).
- **테스트 작성 지침**: 별도 없음 — 전체 e2e가 회귀 검증.
- **검증 명령어**: 전체 e2e + `ls src/views/admin.ejs public/js/admin.js` (없어야 정상)
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "test ! -f src/views/admin.ejs", expected_exit: 0}
  - {shell: "bash", cmd: "test ! -f public/js/admin.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Test-Path src/views/admin.ejs) { exit 1 } else { exit 0 }", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Test-Path public/js/admin.js) { exit 1 } else { exit 0 }", expected_exit: 0}
  - {shell: "bash", cmd: "npx playwright test", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test", expected_exit: 0}
  ```
- **DoD**: 두 파일 부재 + 전체 e2e PASS (e2e 안에서 `page.on('response', r => r.url().includes('admin.css') && r.status())` 401/404 0건 단언).
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}` (이전 커밋에 파일 존재)
- **예상 소요**: 1~2시간

---

#### TASK-P5-004 — 통합 회귀 e2e + 성능 검증 + 릴리즈 노트 작성

- **관련 REQ-ID**: REQ-NF-001, REQ-NF-002, REQ-NF-007, REQ-F-012
- **파일 경로**: `test/e2e/unified-admin-viewer.spec.js` (신규), `docs/release-notes/unified-admin-viewer.md` (신규)
- **메서드/함수 시그니처**: N/A (테스트 + 문서)
- **참고 패턴**: 기존 `test/e2e/`의 Playwright 패턴
- **source_anchors**: `["N/A — 신규"]`
- **구현 가이드 (단계별)**:
  1. `unified-admin-viewer.spec.js` 작성 — End-to-end 시나리오 10종:
     - reader: 토글 0개, view 모드만
     - writer: 편집 토글, ON → 트리 DnD → 업로드 → 컨텍스트 메뉴 → 편집 → 저장 → OFF
     - superuser: 어드민 토글, ON → 관리 모달 → 사용자 추가 시도 (실제 호출 또는 dry-run)
     - `/admin` → 302 → `/?mode=admin`
     - `/doc/foo.md?mode=edit` → 편집 모드 자동 진입 (writer)
     - 모바일 viewport: 토글 표시 + DnD 무반응
     - 미저장 후 토글 OFF → 3-버튼 모달 → 각 버튼 동작
     - 토글 클릭 → ≤200ms `body.mode-*` 부여 (성능)
     - chatbot 라우트 회귀: `/chatbot` 진입 정상 + chatbot 인스턴스에서 writer 토글 ON → 편집기 진입 → 저장 → OFF 1-pass (REQ-F-012)
     - **REQ-NF-001 회귀**: reader 세션 쿠키로 `fetch('/api/admin/upload', {method:'POST'})` → 401/403 응답 단언
  2. 릴리즈 노트 작성:
     - 변경: 통합 페이지, 모드 토글, 모듈 분할
     - 제거: LocalPreview 기능
     - 호환성: `/admin` 자동 리다이렉트, `/api/admin/*` 변경 없음
- **Rationale**: SRS REQ-NF-007 — LocalPreview 제거를 릴리즈 노트에 명시. REQ-F-012 — chatbot/MCP 회귀 검증.
- **함정 / 주의사항**:
  - 200ms 성능 측정은 Playwright `expect(...).toHaveClass(..., {timeout: 200})` 사용.
  - chatbot e2e는 기존 `test/chatbot/`의 fixture 활용.
- **테스트 작성 지침**: 본 TASK 자체가 테스트 작성.
- **검증 명령어**: `npx playwright test test/e2e/unified-admin-viewer.spec.js`
- **acceptance_tests**:
  ```yaml
  - {shell: "bash", cmd: "npx playwright test test/e2e/unified-admin-viewer.spec.js", expected_exit: 0}
  - {shell: "pwsh", cmd: "npx playwright test test/e2e/unified-admin-viewer.spec.js", expected_exit: 0}
  - {shell: "bash", cmd: "test -f docs/release-notes/unified-admin-viewer.md", expected_exit: 0}
  - {shell: "pwsh", cmd: "if (Test-Path docs/release-notes/unified-admin-viewer.md) { exit 0 } else { exit 1 }", expected_exit: 0}
  ```
- **DoD**: e2e 10 시나리오 PASS + 릴리즈 노트 존재 + 200ms 응답성 1회 측정 PASS.
- **rollback**: `{strategy: "git-reset", command: "git reset --hard HEAD~1"}`
- **예상 소요**: 4~6시간

---

### 8.3 Phase 5 테스트 전략
- 통합 회귀가 핵심. 10 시나리오는 SRS의 모든 AC를 커버.
- chatbot/MCP는 별도 fixture로 회귀 (변경 없음 보장).

### 8.4 Phase 5 완료 조건 (DoD)
1. TASK-P5-001~004 모두 acceptance_tests PASS
2. pre_commit_gate 전체 PASS (build/test/grep 검증 모두)
3. 릴리즈 노트 commit
4. 수동 1-pass 회귀: writer 진입 → 편집 → 저장 / superuser 진입 → 관리 → 사용자 조회 / reader 진입 → view 모드 정상

---

## 9. 스펙 매핑 표 (REQ-ID ↔ TASK-ID)

> **양방향성 모델 (strict 동등)**: 라운드 7 평가 결과에 따라 `task.req_ids`(JSON `tasks[].req_ids`)와 `req_to_task[req]`는 **strict 양방향 동등성**을 유지한다. 즉 `req in task.req_ids ⇔ task in req_to_task[req]`. 모든 contributor 관계는 task 측 `req_ids`에도 명시한다 (예: 모든 모듈 신규 TASK는 REQ-NF-005를 req_ids에 포함; P1-003은 REQ-NF-001·REQ-NF-004를 포함; P2-001은 REQ-F-003·REQ-F-004를 포함). REQ-NF-006은 양쪽 모두 빈 매핑(서버 변경 없음).

| REQ-ID | TASK-ID | Phase |
|---|---|---|
| REQ-F-001 | TASK-P1-003 | 1 |
| REQ-F-002 | TASK-P2-001, TASK-P2-002 | 2 |
| REQ-F-003 | TASK-P2-001 (모드 활성), TASK-P3-001~003 (DnD/업로드), TASK-P4-002 (편집기 진입) | 2~4 |
| REQ-F-004 | TASK-P2-001 (모드 활성), TASK-P2-002 (관리 버튼 DOM), TASK-P4-003 (관리 모달) | 2, 4 |
| REQ-F-005 | TASK-P3-001 (드롭존 트리 컨테이너), TASK-P3-002 (DnD 핸들러), TASK-P3-003 (업로드 큐) | 3 |
| REQ-F-006 | TASK-P4-001 | 4 |
| REQ-F-007 | TASK-P4-002 | 4 |
| REQ-F-008 | TASK-P4-000 (modal-ui showConfirm/confirmUnsaved), TASK-P4-002 (hook 등록), TASK-P4-003 (e2e 통합) | 4 |
| REQ-F-009 | TASK-P2-001 | 2 |
| REQ-F-010 | TASK-P2-001 (`isMobileNoDnd`), TASK-P3-002 (DnD 비활성) | 2~3 |
| REQ-F-011 | TASK-P1-001, TASK-P1-002 | 1 |
| REQ-F-012 | TASK-P5-004 (chatbot 회귀 e2e) | 5 |
| REQ-F-013 | TASK-P3-001 (편집 트리 적용), TASK-P5-001 (`/doc/*` EJS 통합) | 3, 5 |
| REQ-NF-001 | TASK-P5-004 (reader→/api/admin/upload 401 회귀 e2e), TASK-P1-003 (미인증 /admin → /login) | 1, 5 |
| REQ-NF-002 | TASK-P2-001 (≤200ms), TASK-P5-004 (성능 검증) | 2, 5 |
| REQ-NF-003 | TASK-P4-000 (modal-ui), TASK-P4-003 (관리 모달), pre_commit_gate grep | 4, 전역 |
| REQ-NF-004 | TASK-P1-003 (`/admin` 리다이렉트), TASK-P5-001 (`/doc/*`) | 1, 5 |
| REQ-NF-005 | TASK-P1-004 (디렉토리), TASK-P2-001~003, TASK-P3-001~003, TASK-P4-000~003, TASK-P5-002, TASK-P5-003 | 1~5 |
| REQ-NF-006 | (서버 측 — 변경 없음) | — |
| REQ-NF-007 | TASK-P1-001 (제거), TASK-P5-004 (릴리즈 노트) | 1, 5 |

**커버리지**: 20개 REQ 중 19개가 명시적 TASK로 매핑. REQ-NF-006만 서버 변경 없음으로 매핑 생략 (TASK-P5-004 회귀 e2e가 간접 보호).

---

## 10. 리스크 및 완화 (인라인 feasibility)

| ID | 리스크 | 난이도 | 완화 |
|---|---|---|---|
| R1 | `webkitGetAsEntry` 비표준 — 미래 deprecation | Low | Mozilla 권장 + 모든 메이저 브라우저 지원 (REQ-NF-004 명시). 대안 `DataTransferItem.getAsFileSystemHandle()`은 Phase 5 이후 검토. |
| R2 | 모듈 분할 시 전역 의존 누락 (admin.js의 closure 변수) | **High** | TASK-P2-003 try-catch graceful degradation으로 단계 전환. Phase 4 완료까지 회귀 e2e가 누락 즉시 감지. |
| R3 | `/api/auth/session`의 `permissions` 키 이름 가정과 다름 | Medium | Phase 2 시작 시 1회 실측. 다르면 mode.js 권한 체크 분기 수정. |
| R4 | admin.css 셀렉터 파편화 | Medium | TASK-P5-003에서 검토만 — 머지는 본 SRS 범위 외 (CLAUDE.md §3 surgical changes). 죽은 셀렉터는 잔존 허용. |
| R5 | EditorModule(1308-1625)의 admin.ejs 고정 ID 의존 — 동적 마운트 변환 시 회귀 | Medium | TASK-P4-002에서 단계별 e2e 4종으로 회귀 차단. |
| R6 | `replaceState`로 인한 뒤로가기 동작 변화 | Low | SRS REQ-F-009 명시 — 의도된 동작. e2e 시나리오로 검증. |
| R7 | LocalPreview 외부 사용자 회귀 | Low | SRS REQ-NF-007 — 사용 통계 미관측. 릴리즈 노트로 고지. |
| R8 | 200ms 응답성 미달 (네트워크 호출 포함) | Low | mode.js의 setMode는 동기 동작만 + permissions 캐싱 (REQ-NF-002). 측정은 TASK-P5-004. |

**Infeasible 항목**: 0건.
**High 항목**: 1건 (R2 — 분할 시 전역 의존). 계획 진행 가능 — graceful degradation + 단계별 e2e로 완화.

---

## 11. 용어집

| 용어 | 정의 |
|---|---|
| ESM (ES Module) | ECMAScript Module — `<script type="module">` 또는 `import/export` 문법. 본 계획은 빌드 도구 없이 네이티브 ESM만 사용. |
| Lazy import | 런타임에 `await import('./mod.js')` 형태로 모듈을 동적 로드. 권한별 모듈만 다운로드. |
| Lazy import 활성/비활성 | 모듈의 `activate()`/`deactivate()` 호출. 이벤트 리스너 바인딩/해제. |
| view 모드 | 모드 토글 OFF 상태. 모든 사용자가 진입. |
| 편집 모드 (edit) | writer가 토글 ON. 트리 DnD/컨텍스트 메뉴/편집기 활성. URL `?mode=edit`. |
| 어드민 모드 (admin) | superuser가 토글 ON. 편집 모드 기능 + 관리 모달. URL `?mode=admin`. |
| 통합 페이지 | `/`, `/doc/*` 라우트가 동일 EJS + 동일 JS 모듈을 사용하는 단일 페이지. |
| `webkitGetAsEntry` | HTML5 DataTransfer API. 디렉토리 드롭 재귀 순회용. |
| 미저장 hook | `editor.js`의 `isUnsaved()`를 mode.js가 호출 가능하도록 `window.__doclightState` 단일 객체로 노출. |
| pre_commit_gate | 전체 Phase 완료 후 커밋 직전에 통과 필수 명령 셋. §3-A.2 참조. |
| acceptance_tests | TASK 종료 시점의 검증 명령 (TASK 단위). pre_commit_gate(전역)와 별개. |

---

## 12. 메타

| 항목 | 값 |
|---|---|
| 모드 | snoworca-planner Normal |
| 모델 | Claude 4.7 Opus (1M context) |
| 라운드 수 | 8 (라운드 1~8 평가자 Opus×1+Sonnet×1 병렬, change_log + §3-A.1 참조) |
| 총 Phase 수 | 5 |
| 총 TASK 수 | **18** (P1: 4, P2: 3, P3: 3, P4: 4 [P4-000 modal-ui 포함], P5: 4) |
| 모듈 파일 수 | **9** (mode/tree/dnd/upload/context-menu/editor/modal-ui/admin-modal + app.js 엔트리) — SRS REQ-NF-005의 8개에서 9개로 조정 (§3-A.3.4 사유) |
| 동적 시니어 소환 | 트리거 미감지 (다중 모듈 변경 ≥3은 충족하나 SRS에서 모듈 구조가 이미 확정 — 추가 분석 효용 낮음. 단일 시니어로 진행) |
| feasibility 인라인 | Low 8 / Medium 11 / High 1 / Infeasible 0 |
| Dew File | `.snoworca/dew/planner/unified-admin-viewer/` (선택 활성) |
| 잔존 findings | (평가자 미실행 — 사용자 검토 후 결정) |
| 다음 단계 후보 | (1) 평가자 실행(Opus×1+Sonnet×1)으로 품질 게이트 통과 / (2) 바로 `snoworca-coder`로 Phase 1 착수 |
| 참조 코드 | SRS와 동일 |
| 참조 SRS | `docs/srs/srs-unified-admin-viewer.md` |

---

## 13. JSON 사이드카

JSON 사이드카는 `docs/plans/plan-unified-admin-viewer.md.json`로 별도 저장 (snoworca-coder가 읽기). 본 plan에서는 18개 TASK의 phase/task_id/req_ids/file_paths 만 색인.
