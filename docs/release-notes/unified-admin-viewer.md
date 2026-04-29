# 통합 어드민/뷰어 릴리즈 노트

**Release date**: 2026-04-29  
**SRS**: `docs/srs/srs-unified-admin-viewer.md`  
**Plan**: `docs/plans/plan-unified-admin-viewer.md`

## 1. 변경 사항 (What's new)

### 1.1 통합 페이지
- `/` 와 `/doc/*` 가 동일한 EJS 템플릿(`src/views/index.ejs` + `doc-viewer.ejs`)과 동일한 ESM 모듈 셋을 사용하도록 통합되었다.
- 사용자는 별도 페이지 이동 없이 같은 화면에서 권한에 따른 모드 토글로 view/edit/admin 을 전환한다.

### 1.2 모드 토글 (REQ-F-002 / REQ-F-009)
- writer 권한 사용자에게는 "편집 모드" 토글이 노출된다.
- superuser 권한 사용자에게는 추가로 "어드민 모드" 토글이 노출된다.
- 토글 클릭 시 200ms 이내에 `body.mode-edit` / `body.mode-admin` 클래스가 적용되며 (REQ-NF-002), URL 파라미터 `?mode=edit|admin` 이 `history.replaceState` 로 동기화된다.
- 토글 OFF 시 미저장 변경이 있으면 3-버튼 확인 모달 (저장 / 폐기 / 취소) 이 표시된다 (REQ-F-008).

### 1.3 모듈 분할 (REQ-NF-005)
JS 가 9 개의 독립 ESM 모듈로 분리되어 권한별 lazy import 가 적용된다.

| 모듈 | 책임 |
|---|---|
| `mode.js` | 모드 토글 / 권한 / URL |
| `tree.js` | 편집·admin 트리 |
| `dnd.js` | DnD 핸들러 |
| `upload.js` | 업로드 큐 |
| `context-menu.js` | 우클릭 메뉴 |
| `editor.js` | 인라인 편집기 + 미저장 hook |
| `modal-ui.js` | showConfirm / confirmUnsaved |
| `admin-modal.js` | 관리 모달 (사용자 / 그룹 / 권한) |
| `app.js` | 페이지 엔트리 / 부트스트랩 |

reader 세션은 `mode.js` + `modal-ui.js` 만 다운로드한다.

### 1.4 chatbot/MCP 회귀 보호 (REQ-F-012)
- `/chatbot` 라우트와 MCP 인스턴스 동작은 변경되지 않았다. e2e 회귀 테스트(`test/e2e/unified-admin-viewer.spec.js`) 시나리오 8 이 라우트 응답성을 검증한다.

## 2. 제거된 기능

### 2.1 LocalPreview 제거 (REQ-NF-007)
- 클라이언트 측 마크다운 미리보기(LocalPreview, `local-preview` CSS 클래스, 관련 핸들러)가 전부 제거되었다.
- 미리보기는 서버가 렌더링한 `/doc/*` 페이지로 일원화된다. 편집 중에는 `editor.js` 의 인라인 편집기에서 저장 후 라우팅으로 확인한다.
- `pre_commit_gate` 의 grep 검사가 `public/`, `src/` 에서 해당 식별자가 0 건인지 검증한다.

### 2.2 별도 어드민 페이지(`/admin`) 제거
- `src/views/admin.ejs` 및 `public/js/admin.js` 단독 페이지가 제거되었다.
- 기존 북마크 호환을 위해 `/admin` 은 superuser 인증 후 `/?mode=admin` 으로 302 리다이렉트된다 (REQ-NF-004). 미인증 접근은 기존과 동일하게 `/login` 으로 리다이렉트된다.

## 3. 호환성

| 항목 | 상태 |
|---|---|
| `/api/admin/*` 엔드포인트 | 변경 없음 (REQ-NF-001) |
| `/api/auth/*` 엔드포인트 | 변경 없음 |
| 사용자/그룹/권한 데이터 모델 | 변경 없음 |
| `/admin` URL | 302 → `/?mode=admin` 자동 리다이렉트 |
| `/doc/*` 정적 마크다운 다운로드 (`?raw=1` 또는 `.md` 확장자) | 변경 없음 |
| 북마크된 admin URL | 호환 유지 |
| 외부 링크 / API 키 사용자 | 영향 없음 |

## 4. 마이그레이션 가이드

운영자 측 작업은 없다. 정적 자산(`public/css/style.css`, `public/js/modules/*.js`)이 갱신되므로 CDN/리버스 프록시 캐시가 있다면 무효화 권장.

## 5. 회귀 검증

- `test/e2e/unified-admin-viewer.spec.js` — 10 시나리오 (reader/writer/superuser 토글, `/admin` 리다이렉트, `/doc/*?mode=edit`, 모바일 viewport, 미저장 모달, 200ms 응답성, chatbot 회귀, `/api/admin/*` 401/403, LocalPreview 제거 검증).
- `pre_commit_gate` (계획서 §3-A.2) — 9 개 모듈 `node --check`, `test/test-start-stop.js`, e2e, LocalPreview 흔적 grep 검사.

## 6. 관련 REQ-ID

REQ-F-002, REQ-F-008, REQ-F-009, REQ-F-010, REQ-F-012, REQ-F-013, REQ-NF-001, REQ-NF-002, REQ-NF-004, REQ-NF-005, REQ-NF-007.
