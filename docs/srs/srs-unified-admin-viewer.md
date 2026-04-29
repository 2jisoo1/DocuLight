# SRS — 뷰어/어드민 단일 페이지 통합 + LocalPreview 제거

- **Run ID**: unified-admin-viewer
- **작성일**: 2026-04-28
- **모드**: snoworca-srs Normal (인라인 작성, Claude 4.7 Opus)
- **상태**: Draft v3 (plan 평가 라운드 1~4 반영 — 모듈 9개·source_anchor 정정·AC#2 분기)
- **상위 출처**: 사용자 대화 요구사항 (PRD 부재 — REQUIREMENTS_TEXT 기반)

---

## 1. 개요

### 1.1 목적
DocLight는 현재 뷰어 페이지(`/`, `/doc/*`)와 어드민 페이지(`/admin`)가 거의 동일한 UI를 가짐에도 EJS·CSS·JS가 완전히 분리되어 있다. 두 페이지를 단일 통합 페이지로 합치고, 권한 기반 모드 토글(편집/어드민)로 기능을 노출한다. 동시에 사용처가 거의 없고 혼란을 유발하는 "로컬 파일 드래그앤드롭 프리뷰"(LocalPreview)를 제거한다.

### 1.2 범위

**In-Scope**
- 뷰어/어드민 페이지의 단일 라우트 통합 (`/`, `/doc/*`)
- 권한 기반 모드 토글 UI (writer→편집 모드, superuser→어드민 모드)
- URL `?mode=edit` / `?mode=admin` 동기화
- 좌측 파일 트리 드래그앤드롭 업로드(파일·디렉토리·다중)
- 우클릭 컨텍스트 메뉴 (편집·어드민 모드 공통)
- 인라인 편집기 통합
- 사용자/그룹/권한 관리 모달 (어드민 모드 전용)
- LocalPreview 기능 완전 제거
- 기존 `/admin` URL의 `/?mode=admin` 리다이렉트 호환
- 미저장 변경 경고 모달 (내부 모달, 브라우저 기본 다이얼로그 금지)
- 모바일 환경 토글 노출 (DnD는 비활성)

**Out-of-Scope**
- API 엔드포인트 변경 — `/api/*`, `/api/admin/*` 현행 유지
- 신규 권한 역할 도입 (현행 reader / writer / superuser 유지)
- chatbot, MCP 라우트 동작 변경
- 모바일 터치 기반 드래그 업로드 구현
- 다국어/i18n 신규 작업

### 1.3 용어
| 용어 | 정의 |
|---|---|
| 뷰 모드 | 모드 토글이 모두 OFF인 기본 상태. 모든 사용자가 진입 가능 |
| 편집 모드 | `writer` 권한자가 진입하는 모드. 파일 CRUD·업로드·DnD·인라인 편집·컨텍스트 메뉴 활성 |
| 어드민 모드 | `superuser` 권한자가 진입하는 모드. 편집 모드의 모든 기능 + 사용자/그룹/권한 관리 모달 |
| 모드 토글 | 헤더 우측에 노출되는 ON/OFF 버튼. 권한에 따라 한 종류만 노출 |
| 통합 페이지 | 본 SRS에 의해 신설되는 단일 라우트. `/` 및 `/doc/*` 양쪽 모두 동일 모드 체계 적용 |
| LocalPreview | 현재 `app.js:2523-3029`에 존재하는, 로컬 파일을 클라이언트 only로 미리보는 기능. 본 SRS에서 제거 대상 |
| 내부 모달 | 프로젝트 자체 구현 모달 컴포넌트 (`alert`/`confirm`/`prompt` 금지) |

### 1.4 권한 매트릭스

| 권한 | 토글 노출 | 토글 ON 시 활성 기능 |
|---|---|---|
| 비로그인 | 없음 | (해당 없음) |
| reader | 없음 | (해당 없음) |
| writer | **편집 모드 토글만** | 트리 DnD 업로드, 컨텍스트 메뉴, 파일 CRUD, 인라인 편집 |
| superuser | **어드민 모드 토글만** | 편집 모드의 모든 기능 + 사용자/그룹/권한 관리 모달 |

> superuser는 편집 토글을 따로 보지 않는다. 어드민 모드 ON이 곧 편집 기능 ON이다(Q9-b).

---

## 2. 기능 요구사항 (Functional Requirements)

### REQ-F-001 — 라우트 통합 및 `/admin` 리다이렉트
- **설명**: `/admin` 진입 시 서버는 HTTP 302로 `/?mode=admin`으로 리다이렉트한다. 통합 페이지는 `/`(루트) 및 `/doc/*`(문서 뷰어) 라우트에서 동일하게 모드 체계를 지원한다.
- **입력**: HTTP GET `/admin`, `/admin?...query`
- **출력**: 302 Location: `/?mode=admin` (기존 query 보존)
- **제약**: 기존 어드민 페이지 북마크가 깨지지 않아야 한다. POST/PUT/DELETE는 `/api/admin/*`이 처리하므로 영향 없다.
- **AC**:
  1. `curl -I /admin` → 302 + Location 헤더 확인
  2. 미인증 사용자가 `/admin` 접근 → `cfg.auth.requireReadLogin=true` 환경에서 기존 동작과 동일한 로그인 리다이렉트(`/login`). `requireReadLogin=false` 기본 환경에서는 익명도 `/?mode=admin`으로 진입 후 mode.js가 `/api/auth/session` 결과로 view 모드 강등 (현재 동작 보존)
  3. `/admin/users`, `/admin/groups`, `/admin/foo` 등 모든 `/admin/*` 하위 경로 → `/?mode=admin`으로 302 리다이렉트 (단순 정책)

### REQ-F-002 — 권한 기반 모드 토글 UI
- **설명**: 통합 페이지 헤더 우측에 모드 토글 버튼을 노출한다. 권한별로 정확히 한 종류만 노출된다.
- **입력**: 페이지 로드 시 `/api/auth/session` 조회 결과의 `permissions` 배열
- **출력**: DOM에 토글 버튼 1개 또는 0개
- **제약**:
  - reader, 비로그인 → 토글 미노출
  - writer → "편집 모드" 토글만 노출
  - superuser → "어드민 모드" 토글만 노출 (편집 토글은 노출하지 않음)
- **AC**:
  1. reader 세션으로 `/` 진입 → 헤더에 토글 DOM 0개
  2. writer 세션으로 진입 → "편집 모드" 토글 1개, "어드민 모드" 토글 0개
  3. superuser 세션 → "어드민 모드" 토글 1개, "편집 모드" 토글 0개
  4. 비로그인 진입 → 토글 0개 (현재 anonymous 정책 그대로)

### REQ-F-003 — 편집 모드 활성 동작 (writer)
- **설명**: writer가 편집 모드를 ON 하면 (a) 좌측 파일 트리에 DnD 업로드 핸들러 활성, (b) 트리 항목 우클릭 컨텍스트 메뉴 활성, (c) 우측 본문 영역에 인라인 편집기 진입 가능. 페이지 디자인 자체는 뷰 모드와 동일하게 유지된다.
- **입력**: 편집 모드 토글 클릭 (OFF→ON)
- **출력**: `body.classList.add('mode-edit')`, URL이 `?mode=edit`으로 갱신, 트리·본문 핸들러 바인딩
- **제약**:
  - 디자인 변경 없음 (CSS는 `body.mode-edit` 하위 셀렉터로만 추가 동작 부여)
  - 모든 편집 동작은 `/api/admin/*` API 사용 (writer 권한 검증은 서버 측 책임)
- **AC**:
  1. ON 시 `body.mode-edit` 클래스 부여 확인
  2. ON 시 좌측 트리에 파일 드롭 → 업로드 시작
  3. ON 시 트리 항목 우클릭 → 컨텍스트 메뉴 표시
  4. ON 시 본문 영역 편집 진입(편집 버튼 또는 컨텍스트 메뉴 "편집") 가능
  5. OFF 시 위 동작 모두 비활성

### REQ-F-004 — 어드민 모드 활성 동작 (superuser)
- **설명**: superuser가 어드민 모드를 ON 하면 REQ-F-003의 모든 편집 기능이 자동 활성화되고, 헤더에 "관리" 버튼이 추가 노출된다. "관리" 버튼 클릭 시 사용자/그룹/권한 관리 내부 모달이 열린다.
- **입력**: 어드민 모드 토글 클릭 (OFF→ON)
- **출력**: `body.classList.add('mode-admin', 'mode-edit')`, URL이 `?mode=admin`, 헤더에 관리 버튼 표시
- **제약**:
  - 어드민 모드 ON ≡ 편집 모드 ON (편집 기능 모두 활성)
  - URL은 `?mode=admin`만 사용 (포괄). `?mode=admin,edit`는 사용하지 않음
  - 관리 모달은 항상 모달로 노출 (별도 라우트 X)
- **AC**:
  1. ON 시 편집 모드 기능 모두 활성 (REQ-F-003 AC 1~4 동일 통과)
  2. ON 시 헤더에 "관리" 버튼 노출
  3. "관리" 버튼 클릭 → 사용자/그룹/권한 관리 모달 표시
  4. 모달 닫기 후에도 어드민 모드는 ON 유지

### REQ-F-005 — 좌측 트리 DnD 업로드 (파일·디렉토리·다중)
- **설명**: 편집 또는 어드민 모드 ON 상태에서, 사용자가 OS 파일 시스템의 파일 또는 폴더를 좌측 파일 트리 영역에 드래그 드롭하면 업로드가 시작된다. 좌측 트리 영역 외부(본문, 헤더 등)에 드롭하면 아무 반응이 없다.
- **입력**: `dragover`/`drop` 이벤트의 `DataTransfer.items` (파일/디렉토리/다중)
- **출력**: 다중 업로드 큐, 진행률 토스트(기존 어드민 UI 그대로 이식), 완료 후 트리 새로고침
- **제약**:
  - 디렉토리 드롭 시 `webkitGetAsEntry()`로 재귀 순회, 폴더 구조 보존하여 업로드
  - 다중 파일 동시 드롭 지원
  - 업로드 진행률 UI는 현재 admin.js의 `UploadModule`(public/js/admin.js:2524-2925) 컴포넌트를 재사용
  - 모바일/터치 환경에서는 비활성 (REQ-F-010 참조)
  - 드롭 영역은 좌측 트리 컨테이너로 한정 (드롭 영역 시각 피드백은 트리 영역 내부에만 표시)
- **AC**:
  1. 편집 모드 ON, 트리에 단일 파일 드롭 → `/api/admin/upload`로 업로드, 완료 후 트리에 항목 추가
  2. 다중 파일 드롭 → 각 파일별 진행률 토스트 노출, 모두 완료 시 트리 새로고침
  3. 디렉토리 드롭 → 재귀 순회, 하위 폴더 구조 그대로 업로드
  4. 모드 OFF 상태에서 트리에 드롭 → 무반응 (이벤트 핸들러 미바인딩)
  5. 본문 영역에 드롭 → 무반응 (LocalPreview 제거 후, 아무 핸들러 없음)

### REQ-F-006 — 트리 컨텍스트 메뉴
- **설명**: 편집 또는 어드민 모드 ON 시 트리 항목 우클릭으로 컨텍스트 메뉴가 표시된다. 메뉴 항목은 현재 admin.js의 `ContextMenuModule`을 그대로 이식한다(생성/이름변경/삭제/복사/이동/편집 등).
- **입력**: `contextmenu` 이벤트
- **출력**: 트리 항목 위치에 메뉴 DOM 표시
- **제약**:
  - 편집 모드와 어드민 모드의 메뉴 항목은 동일 (사용자/그룹 관리 항목은 메뉴 X, 헤더 "관리" 버튼으로만 진입 — REQ-F-004)
  - 모드 OFF 시 우클릭 → 브라우저 기본 메뉴 (커스텀 메뉴 표시 X)
  - 권한 검증은 서버 측 `/api/admin/*`에서 최종 확인
- **AC**:
  1. 편집 모드 ON, 파일 우클릭 → 커스텀 메뉴 표시
  2. 편집 모드 OFF → 브라우저 기본 메뉴
  3. 메뉴 "삭제" 선택 → 내부 모달로 확인 → `/api/admin/entry` DELETE
  4. 메뉴 항목 클릭 후 메뉴 자동 닫힘

### REQ-F-007 — 인라인 편집기 통합
- **설명**: 편집/어드민 모드에서 마크다운 파일 우클릭 → "편집" 또는 본문 상단 편집 버튼으로 인라인 편집기 진입. 현재 admin.js의 `EditorModule`(public/js/admin.js:1308-1625)을 통합 페이지로 이식한다.
- **입력**: 편집 진입 액션 (메뉴 또는 버튼)
- **출력**: 본문 영역이 편집기 UI로 전환, 저장/취소 버튼 노출
- **제약**:
  - 편집기 DOM은 본문 컨테이너에 동적 마운트 (admin.ejs의 고정 ID 의존 제거)
  - 저장 시 `/api/admin/file` PUT
  - 취소 시 미저장 변경 있으면 내부 모달 경고 (REQ-F-008)
- **AC**:
  1. .md 파일 진입 → 편집기 표시, 원본 내용 로드
  2. 편집 후 저장 → 서버 응답 200 → 편집기 닫고 뷰어로 복귀
  3. 편집 후 취소 → 내부 모달 "변경사항이 저장되지 않았습니다. 계속하시겠습니까?" 표시
  4. 비-마크다운 파일 → 편집 메뉴 비활성

### REQ-F-008 — 모드 OFF / 페이지 이탈 시 미저장 경고 (내부 모달, 3-버튼)
- **설명**: 편집기에서 미저장 변경이 있는 상태에서 (a) 모드 토글 OFF, (b) 트리 항목 클릭으로 다른 문서 이동, (c) 페이지 이동 시 내부 모달로 경고하고 3-버튼 선택지를 제공한다.
- **입력**: 위 3가지 트리거
- **출력**: 내부 모달 (확정 카피 아래 참조) + 3개 버튼
- **확정 모달 카피**:
  - **타이틀**: `저장하지 않은 변경사항이 있습니다`
  - **본문**: `이 페이지를 떠나면 작성한 내용이 사라집니다.`
  - **버튼 1 (Primary)**: `저장하고 나가기` — 현재 편집 내용 저장 후 액션 진행
  - **버튼 2 (Destructive)**: `버리고 나가기` — 변경 폐기 후 액션 진행
  - **버튼 3 (Cancel)**: `취소` — 액션 중단, 편집기 유지
- **제약**:
  - **브라우저 기본 `confirm()`/`alert()`/`prompt()` 사용 금지** (CLAUDE.md §0)
  - [저장하고 나가기]: 서버 저장 성공 시에만 액션 진행. 저장 실패 시 모달 유지 + 에러 토스트
  - [버리고 나가기]: 변경 폐기, 액션 즉시 진행
  - [취소]: 모드 OFF 액션 자체를 취소, 편집기/모드 ON 상태 유지
  - 페이지 unload(`beforeunload`)는 브라우저 표준이므로 예외 (브라우저가 자체 다이얼로그 표시)
- **AC**:
  1. 편집 중 토글 OFF → 3-버튼 내부 모달 표시
  2. [저장하고 나가기] 클릭 + 서버 200 → 모드 OFF 적용 + 편집기 닫힘
  3. [저장하고 나가기] 클릭 + 서버 4xx/5xx → 모달 유지, 에러 토스트, 모드 ON 유지
  4. [버리고 나가기] 클릭 → 변경 폐기 + 모드 OFF + 편집기 닫힘
  5. [취소] 클릭 → 편집기 유지, 모드 ON 그대로
  6. 변경 없는 상태에서 OFF → 모달 없이 즉시 전환

### REQ-F-009 — URL 모드 동기화
- **설명**: 모드 ON/OFF 시 URL의 `?mode` 쿼리스트링이 자동 갱신된다(`history.replaceState`). 페이지 로드 시 URL의 `?mode` 값을 읽어 초기 모드를 결정한다.
- **입력**: 토글 클릭 / 페이지 로드 / 뒤로가기
- **출력**: `window.location.search`에 `mode=edit` 또는 `mode=admin` 또는 부재
- **제약**:
  - `?mode=admin`: superuser만 적용. 권한 없으면 무시하고 뷰 모드로 진입
  - `?mode=edit`: writer 이상만 적용. 권한 없으면 무시
  - 모드 OFF 시 `mode` 파라미터 자동 제거 (다른 query는 보존)
  - `pushState`는 사용하지 않음 (뒤로가기로 모드 토글되지 않도록 `replaceState`만 사용)
- **AC**:
  1. writer가 토글 ON → URL `?mode=edit` 추가
  2. `/?mode=admin`으로 직접 진입한 superuser → 어드민 모드 ON 상태로 페이지 로드
  3. `/?mode=admin`으로 진입한 reader → 모드 OFF, URL의 `mode` 파라미터 제거
  4. 모드 OFF → URL에서 `mode` 제거, 다른 query(예: `?path=/foo`) 보존

### REQ-F-010 — 모바일 토글 노출 + DnD 비활성
- **설명**: 모바일/좁은 화면에서도 모드 토글은 노출하되, 트리 DnD 업로드 핸들러는 바인딩하지 않는다. 컨텍스트 메뉴(롱프레스), 인라인 편집은 정상 동작한다.
- **입력**: `window.matchMedia('(max-width: 768px) and (pointer: coarse)')`
- **출력**: DnD 핸들러 미바인딩, 트리에 드롭 시각 피드백 영역 미생성
- **제약**:
  - **모바일 판정 기준 확정**: 화면 너비 ≤ 768px **AND** `pointer: coarse` 동시 만족
  - 두 조건 중 하나라도 불충족 시 데스크톱으로 간주 → DnD 활성
  - 다른 어드민 기능(이름변경, 삭제 등)은 모바일에서도 동작
- **AC**:
  1. 데스크톱 뷰포트(≥769px 또는 `pointer: fine`) → DnD 영역 활성
  2. 모바일(≤768px AND coarse) → DnD 핸들러 미바인딩, 토글 자체는 표시
  3. 태블릿 가로(폭 ≥769px이면서 coarse, 예: iPad 가로) → DnD 활성 (조건 d의 AND 의미)
  4. 모바일에서 컨텍스트 메뉴(롱프레스 또는 우클릭) 정상 동작

### REQ-F-011 — LocalPreview 기능 완전 제거
- **설명**: `public/js/app.js:2523-3029`의 `LocalPreview` 객체와 `app.js:3265`의 `LocalPreview.init()` 호출, 그리고 관련 CSS(`public/css/style.css`의 `.local-preview-*` 셀렉터)를 모두 제거한다.
- **입력**: (코드 변경)
- **출력**: 코드베이스에서 `LocalPreview` 식별자가 0회 검색됨, `.local-preview-*` 셀렉터 0개
- **제약**:
  - 제거 후 다른 모듈에서 참조 없음을 확인 (grep 검증)
  - 안내 텍스트, README, 문서에서도 관련 설명 제거 또는 갱신
- **AC**:
  1. `grep -r "LocalPreview" public/ src/` → 매치 0건
  2. `grep -r "local-preview" public/css/` → 매치 0건
  3. 사용자가 본문 영역에 파일 드래그 → 무반응 (브라우저 기본 동작 = 파일이 새 탭으로 열림은 허용 안 함; 드롭 자체를 무시)
  4. README 또는 사용자 안내에 "로컬 파일 미리보기" 언급 없음

### REQ-F-012 — 통합 페이지 부수 모듈 호환
- **설명**: 통합 페이지에 chatbot, MCP 안내 등 기존 부수 모듈이 영향받지 않아야 한다.
- **제약**:
  - chatbot UI는 현행 `chatbotMode` 플래그 동작 그대로 유지
  - MCP 라우트(`/mcp`, `/mcp/doc`)는 변경 없음
- **AC**:
  1. chatbot 활성 인스턴스에서 모드 토글 동작 정상
  2. MCP 라우트 회귀 테스트 통과 (별도 변경 없음)

### REQ-F-013 — 통합 페이지의 `/doc/*` 적용
- **설명**: `/doc/some/path.md` 같은 문서 뷰어 라우트도 동일한 모드 토글·DnD·컨텍스트 메뉴를 지원한다.
- **AC**:
  1. writer가 `/doc/foo.md` 진입 → 편집 모드 토글 노출
  2. 편집 모드 ON → 좌측 트리 DnD 동작
  3. URL은 `/doc/foo.md?mode=edit`

---

## 3. 비기능 요구사항 (Non-Functional Requirements)

### REQ-NF-001 — 권한 검증 이중화
- 클라이언트 권한 검증(토글 노출/모드 진입)은 UX 목적. 모든 변경 작업은 서버 `/api/admin/*`가 최종 권한을 검증한다.
- 클라이언트가 변조되어 어드민 모드 강제 진입해도 서버가 차단해야 한다.
- **AC**: reader 세션으로 직접 `/api/admin/upload` POST → 401/403 응답.

### REQ-NF-002 — 모드 전환 응답성
- 모드 토글 클릭 → DOM 갱신·핸들러 바인딩까지 200ms 이내.
- 권한 조회는 페이지 초기 로드 시 1회만 수행 (캐시).
- **AC**: 토글 클릭 후 200ms 내 `body.mode-*` 클래스 적용 확인.

### REQ-NF-003 — 브라우저 기본 다이얼로그 금지
- `window.alert`, `window.confirm`, `window.prompt`는 본 SRS 범위 내 신규/수정 코드에서 사용 금지.
- 기존 코드의 사용처는 본 SRS와 무관하므로 손대지 않는다(touch-only-what-you-must 원칙).
- 단, `beforeunload` 표준 다이얼로그는 예외 (브라우저 정책상 커스텀 불가).
- **AC**: 본 SRS 변경분 `grep -E "window\.(alert|confirm|prompt)"` 결과 0건.

### REQ-NF-004 — 호환성
- 기존 `/admin` URL 북마크 → 자동 리다이렉트로 동작 보장.
- 기존 `/api/admin/*` 호출 코드(서드파티 스크립트, MCP 등) 변경 없이 동작.
- 브라우저 지원: 최신 Chrome/Edge/Firefox/Safari (DnD 디렉토리 업로드는 `webkitGetAsEntry` 의존).

### REQ-NF-005 — 코드 모듈 분할 (필수)
- `app.js`(3,269줄) + `admin.js`(2,974줄)를 **ES Module로 8개 모듈 파일 + 1개 엔트리(=총 9개)로 분할**한다 (라운드 1/2 plan 평가에 따른 modal-ui.js 분리 반영, 본 SRS Draft v3에서 8→9로 조정). `<script type="module">` 사용으로 빌드 도구 도입 없이 진행한다.
- **확정 모듈 구조** (`public/js/modules/`):
  | 모듈 | 책임 | 출처 |
  |---|---|---|
  | `mode.js` | 모드 토글, 권한 게이트, URL 동기화 | 신규 (REQ-F-002, F-009) |
  | `tree.js` | 좌측 파일 트리 렌더링·네비게이션 | `app.js` + `admin.js` 트리 통합 |
  | `dnd.js` | 좌측 트리 드래그앤드롭 핸들러 | `admin.js:2077-2304` |
  | `upload.js` | 업로드 큐, 진행률 토스트 | `admin.js:2524-2925` |
  | `context-menu.js` | 우클릭 컨텍스트 메뉴 | `admin.js` ContextMenuModule |
  | `editor.js` | 인라인 마크다운 편집기 | `admin.js:1308-1625` |
  | `modal-ui.js` | showConfirm + confirmUnsaved (모든 모드 활성) | `admin.js:1042-1228` ModalModule 분리 |
  | `admin-modal.js` | 사용자/그룹/권한 관리 모달 | `admin.ejs` 내부 UI 재구성 + `admin.js:1630-2072` |
  | `app.js` | 엔트리, 모듈 부트스트랩, 뷰어 로직 (TOC, 검색 등 잔존) | 기존 `app.js`에서 LocalPreview·트리 등 분리 후 잔여분 |
- 모듈 간 의존: `app.js` → `mode.js` → 권한별로 `tree.js`/`dnd.js`/`upload.js`/`editor.js` 등 lazy import.
- **AC**:
  1. `public/js/modules/` 디렉토리에 8개 모듈 파일 + README.md 존재 (mode/tree/dnd/upload/context-menu/editor/modal-ui/admin-modal). 엔트리 `app.js`는 `public/js/` 직속
  2. 각 파일 4,000줄 미만
  3. EJS 템플릿이 `<script type="module" src="/js/app.js">`로 엔트리 로드
  4. 브라우저에서 ES Module 정상 로드 (네트워크 탭 확인)

### REQ-NF-006 — 보안
- DnD 업로드 시 파일 크기/MIME 검증은 서버에서 수행 (현행 정책 유지).
- 어드민 관리 모달의 사용자/권한 변경은 superuser 권한 재검증 필수 (CSRF 토큰 또는 세션 검증 — 현행 미들웨어 그대로).

### REQ-NF-007 — 가용성
- LocalPreview 제거로 인한 사용자 회귀 리스크는 낮음 (사용처 미관측). 단, 릴리즈 노트에 명시.
- 기능 플래그/토글 없이 단순 제거. 롤백은 git revert로만 수행.

---

## 4. 외부 인터페이스

### 4.1 클라이언트 → 서버 API
| API | 메서드 | 용도 | 변경 |
|---|---|---|---|
| `/api/auth/session` | GET | 세션·권한 조회 (모드 토글 노출 결정) | **신규 사용처** (기존 엔드포인트 그대로) |
| `/api/admin/tree` | GET | 트리 조회 (편집 모드 진입 시) | 변경 없음 |
| `/api/admin/upload` | POST | DnD 업로드 | 변경 없음 |
| `/api/admin/entry` | DELETE | 삭제 | 변경 없음 |
| `/api/admin/file` | GET/PUT | 편집기 로드/저장 | 변경 없음 |
| `/api/tree`, `/api/file` 등 뷰어 API | GET | 뷰 모드 트리/파일 조회 | 변경 없음 |

### 4.2 서버 라우트
| 라우트 | 처리 | 변경 |
|---|---|---|
| `GET /` | `index.ejs` 렌더 (통합 페이지) | **수정** (모드 토글·관리 모달 partial 포함) |
| `GET /doc/*` | `doc-viewer.ejs` 또는 `index.ejs` 렌더 | **수정** (동일 통합 모듈 로드) |
| `GET /admin` | `/?mode=admin`으로 302 리다이렉트 | **변경** (기존 admin.ejs 렌더 폐지) |
| `GET /admin/*` | `/`로 302 또는 404 (구현 시 결정) | **변경** |
| `GET /login` | 변경 없음 | — |

### 4.3 클라이언트 모듈 매핑 (참고)
| 신규/통합 모듈 | 출처 |
|---|---|
| Mode Toggle | 신규 |
| TreeModule | `admin.js:378-572` 기반, `app.js`의 트리 로직 흡수 |
| ContextMenuModule | `admin.js` 그대로 이식 |
| DragDropModule | `admin.js:2077-2304` 그대로 이식 (라인 정정) |
| UploadModule | `admin.js:2524-2925` 그대로 이식 (라인 정정) |
| EditorModule | `admin.js:1308-1625` 그대로 이식, DOM 마운트 동적화 |
| AdminPanelModal | `admin.ejs`의 사용자/그룹/권한 UI를 모달로 재구성 |

---

## 5. 가정 및 제약

### 5.1 가정
- 현재 `/api/auth/session`이 반환하는 `permissions` 배열에 `superuser`/`write`/`read`가 명확히 구분되어 있다.
- writer = 코드상 `write` 권한 (사용자 표현 "editor"는 본 SRS에서 `writer`로 통일).
- LocalPreview 기능을 사용하는 외부 사용자/문서가 없다 (사용 통계 미관측).
- `webkitGetAsEntry` API가 타깃 브라우저에서 동작 (모든 메이저 브라우저 지원).

### 5.2 제약
- `/api/admin/*` API 시그니처 변경 금지 (호출자 호환).
- 권한 역할 신규 추가 금지.
- 브라우저 기본 모달 사용 금지 (CLAUDE.md §0).
- 코드 변경은 본 요구사항 범위 외의 리팩토링 지양 (CLAUDE.md §3 surgical changes).

### 5.3 미해결 / 추후 결정
**모두 확정** (2026-04-28 사용자 결정).

| ID | 항목 | 확정 결정 | 반영 위치 |
|---|---|---|---|
| U-1 | 모바일 분기 임계값 | `(max-width: 768px) AND (pointer: coarse)` 동시 만족 | REQ-F-010 |
| U-2 | `/admin/*` 하위 경로 | 모든 하위 경로 `/?mode=admin`으로 redirect | REQ-F-001 |
| U-3 | 코드 모듈 분할 | ES Module 9개 파일로 분할(modal-ui.js 분리 추가, plan 라운드 1 평가 결정), 빌드 도구 도입 없음 | REQ-NF-005 |
| U-4 | 미저장 경고 모달 카피 | 3-버튼: [저장하고 나가기 / 버리고 나가기 / 취소] | REQ-F-008 |

---

## 6. 메타

| 항목 | 값 |
|---|---|
| 모드 | snoworca-srs Normal |
| 모델 | Claude 4.7 Opus (1M context) |
| 라운드 수 | 2 (1: 초안, 2: 2026-04-29 후속 회귀 보강) |
| 총 REQ 수 | F: 16, NF: 9 (합 25) |
| 잔존 finding | 0 (Critical/High 모두 처리, 코드 리뷰 PASS) |
| 다음 단계 후보 | snoworca-feasibility (가능성 검증은 이미 사전 수행) → snoworca-planner (구현 계획) |
| 참조 코드 | `public/js/app.js`, `public/js/modules/{mode,tree,dnd,upload,context-menu,editor,modal-ui,admin-modal}.js`, `src/views/{index,doc-viewer}.ejs`, `src/routes/admin-api.js`, `src/middleware/auth.js`, `src/controllers/auth-controller.js` |

---

## 7. REQ-ID 색인 (요약)

```
REQ-F-001  /admin → /?mode=admin 리다이렉트
REQ-F-002  권한 기반 모드 토글 UI
REQ-F-003  편집 모드 활성 동작 (writer)
REQ-F-004  어드민 모드 활성 동작 + 관리 모달 (superuser)
REQ-F-005  좌측 트리 DnD 업로드 (파일·디렉토리·다중)
REQ-F-006  트리 컨텍스트 메뉴
REQ-F-007  인라인 편집기 통합
REQ-F-008  미저장 경고 내부 모달
REQ-F-009  URL ?mode 동기화
REQ-F-010  모바일 토글 노출 + DnD 비활성
REQ-F-011  LocalPreview 완전 제거
REQ-F-012  chatbot/MCP 호환 유지
REQ-F-013  /doc/* 라우트 동일 적용
REQ-NF-001 권한 검증 이중화 (클라+서버)
REQ-NF-002 모드 전환 응답성 ≤200ms
REQ-NF-003 브라우저 기본 다이얼로그 금지
REQ-NF-004 호환성 (URL/API/브라우저)
REQ-NF-005 코드 통합 규모
REQ-NF-006 보안
REQ-NF-007 가용성 (LocalPreview 제거 회귀)
REQ-F-014  관리(설정) 모달 닫힘 정책
REQ-F-015  superuser admin = 쓰기 권한 통합
REQ-F-016  좌측 트리 root 드롭 영역 + 시각화
REQ-NF-008 모드 전환 후 좌측 트리 무결성 (race-free 복원)
REQ-NF-009 코드 변경 시 리뷰 루프 의무화
```

---

## 8. Delta — 후속 회귀 수정 및 보강 (2026-04-29)

본 절은 초기 통합(§2~§3) 머지 직후 발견된 회귀와 사용자 피드백을 반영한 증분이다.
원 요구사항(REQ-F-001~013 / REQ-NF-001~007)은 그대로 유효하며, 아래 항목은 그 위에 가산된다.

### REQ-F-014 — 관리(설정) 모달 닫힘 정책

**Description**: `#mgmt-modal`(설정창)은 다음 경로로만 닫힌다.

- 헤더의 닫기 버튼 `#mgmt-close`(✕) 클릭
- 모달이 열린 상태에서 `Esc` 키
- **배경(오버레이) 클릭으로는 닫히지 않는다** — 실수 클릭으로 인한 작업 손실 방지

**Acceptance**:
1. ✕ 또는 Esc 로 닫으면 `display: none` 처리되고 활성 탭 상태가 초기화된다.
2. 모달 외 영역 클릭은 무반응.
3. `#mgmt-close` 에 hover 시 배경/테두리 강조 (다른 `icon-btn` 과 동일한 32×32 사이즈).

### REQ-F-015 — superuser admin 모드 = 쓰기 권한 통합

**Description**: superuser 권한은 `write` 권한을 묵시적으로 포함한다. admin 모드에서도
**파일 업로드, 삭제, 이름 변경, 새 파일/폴더, 잘라내기/붙여넣기**가 모두 가능해야 한다.

**클라이언트 매핑**: `permissions.includes('superuser')` 가 true 이면 `hasWrite`/`hasDelete`
모두 true 로 평탄화. 서버 인가는 이미 superuser → write/delete 매핑을 수행 중(`src/middleware/auth.js`).

**Acceptance**:
1. superuser 세션이 admin 모드 트리에서 우클릭 시 컨텍스트 메뉴의 **Rename/Delete/New File/New Folder/Cut/Paste** 가 비활성(disabled) 클래스를 갖지 않는다.
2. admin 모드에서 외부 파일을 트리에 드롭하면 `/api/admin/upload` POST 요청이 발생하고 200 응답을 받는다.
3. 본 요구사항은 §1.4 권한 매트릭스의 superuser 행을 보강한다 (admin 모드 = view + edit 의 합집합).

### REQ-F-016 — 좌측 트리 root 드롭 영역 + 시각화

**Description**: 좌측 트리(`#tree-menu`)의 빈 배경(파일 리스트 아래쪽)에 외부 파일을
드롭하면 root(`/`) 경로로 업로드되어야 한다. 드롭 가능한 영역은 시각적으로 표시된다.

**구현 제약**:
- `.tree-container`는 `display: flex; flex-direction: column;` 으로 자식 `#tree-menu`의
  `flex: 1` 을 활성화해 빈 영역까지 트리 컨테이너 hit-area 에 포함시킨다.
- 디렉토리 위 dragover 시 해당 디렉토리에 `.upload-dir-target` 클래스(파란 반투명 + dashed outline) 부여.
- 디렉토리 외(파일 행 또는 빈 배경) dragover 시 `#tree-menu` 에 `.upload-root-target`(동일 효과) 부여.
- `dragleave`(컨테이너 이탈) / `dragend`(드래그 취소) / `drop` 시 모든 강조 즉시 해제.

**Acceptance**:
1. `#tree-menu` 의 시각적 바닥 5px 위 좌표에서 `elementFromPoint` 가 `#tree-menu` 또는 그 자손이어야 한다.
2. 해당 좌표에서 `drop` 이벤트 dispatch 시 `/api/admin/upload?path=%2F` 가 호출된다.
3. 빈 배경 dragover 중 `#tree-menu` 가 `.upload-root-target` 클래스를 갖는다.

### REQ-NF-008 — 모드 전환 후 좌측 트리 무결성 (race-free 복원)

**Description**: admin/edit ↔ view 모드 토글 시 좌측 트리는 항상 정상 렌더된 상태를
유지한다. 새로고침 없이도 view 모드 트리가 즉시 복원된다.

**구현 제약**:
- view 모드 트리 빌더는 `window.__viewTree.{activate, deactivate}` mutex 를 모듈
  top-level 에 노출(초기화 실패해도 전역은 정의됨).
- `activate` 는 in-flight Promise 를 캐싱하여 동시 호출 시 단일 실행으로 합친다(race-free).
- 빌드 실패 시 `.tree-load-error` fallback 메시지 표시.
- admin 트리(`public/js/modules/tree.js`) `deactivate` → `__viewTree.activate` 흐름이 끊기지 않는다.

**Acceptance**:
1. view → admin → view 토글 round-trip 후 `#tree-menu .tree-item-wrapper` 카운트가 토글 전과 동일하다.
2. admin 모드에서 트리 클릭은 동일 viewer(`window.ViewerModule.loadFile`)로 라우팅되어 view 모드와 동일한 마크다운 렌더러를 사용한다.

### REQ-NF-009 — 코드 변경 시 리뷰 루프 의무화

**Description**: 모든 코드 변경(버그 수정·기능·리팩터)은 까칠한 코드 리뷰 서브에이전트의
검수를 통과한 뒤에만 완료로 간주한다.

**규약**: `CLAUDE.md §0-2` 정의 그대로 — 클린 코드(함수 단일 책임), 테스트 커버리지,
예외 발생 가능성을 축으로 평가하고 Critical/High 가 0 이 될 때까지 반복.

**Acceptance**: 변경 직후 리뷰 결과(심각도 분류 + 처리 내역)가 응답에 포함된다.

### 보강된 기존 요구사항 메모

- **REQ-F-002 모드 토글 UI**: 텍스트("편집/관리") → SVG 아이콘 교체, 순서 **편집 → 설정 → 관리** 로 정렬, `aria-pressed="true"` 일 때 활성 색상·테두리 강조 (`.mode-toggle[aria-pressed="true"]`).
- **REQ-F-005 DnD 업로드**: 드롭 대상 결정 규칙에 빈 배경 → root(`/`) 명시(REQ-F-016).
- **REQ-NF-003 브라우저 다이얼로그 금지**: `regenerateKey()` 의 `confirm()` 잔재를 `modal-ui.showConfirm({ dataModal: 'confirm-regenerate-key' })` 로 교체하여 정책 100% 준수.
- **§4.3 클라이언트 모듈 매핑**: `window.ViewerProfile`, `window.ViewerModule`, `window.__viewTree` 가 ESM 모듈 ↔ 인라인 핸들러/모드 mutex 브릿지로 노출됨.

### 회귀 e2e 인덱스

| Test | 검증 |
|------|------|
| 11 | view → admin → view 토글 후 트리 카운트 보존 (REQ-NF-008) |
| 12 | superuser 컨텍스트 메뉴 Rename/Delete 활성 (REQ-F-015) |
| 13 | admin 모드에서 `#tree-menu` DnD 핸들러 바인딩 + 실제 drop → upload 요청 (REQ-F-005, REQ-F-015) |
| 14 | 트리 빈 배경 drop → `/api/admin/upload?path=/` (REQ-F-016) |
| 15 | 빈 배경 dragover → `#tree-menu.upload-root-target` 클래스 (REQ-F-016) |
