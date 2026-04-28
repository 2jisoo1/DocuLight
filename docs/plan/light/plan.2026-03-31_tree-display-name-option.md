---
title: 파일 리스트 표시명 옵션 추가 (실제 파일명 기본값)
project: DocLight
date: 2026-03-31
type: enhancement
tech_stack: Node.js + Express, Vanilla JS (프론트엔드)
code_path: ./src, ./public
---

# 파일 리스트 표시명 옵션 추가 (실제 파일명 기본값)

## 1. 의도 및 요구사항

### 1.1 목적
파일 리스트(tree)에서 프론트매터 title 대신 실제 파일명을 기본값으로 사용하고, 사용자가 옵션으로 프론트매터 제목 표시를 선택할 수 있도록 한다.

### 1.2 배경
현재 tree-service는 `.md` 파일에 대해 항상 frontmatter의 `name` 필드를 파싱하여 `displayName`으로 반환한다. 웹 UI(`app.js:968`)에서는 `file.displayName || file.name.slice(0, -3)`로 frontmatter 제목을 우선 표시한다. MCP 라우트(`mcp.js:425, 454`)에서는 이미 `file.name`만 출력하고 있어 displayName을 무시 중이다. 사용자가 실제 파일명을 보고 싶을 때 선택할 방법이 없다.

### 1.3 기능 요구사항``
- FR-1: REST API(`/api/tree`, `/api/tree/full`)에 `useDisplayName` 쿼리 파라미터를 추가한다. 기본값은 `false`(실제 파일명 사용).
- FR-2: MCP 도구(`list_documents`, `list_full_tree`)에 `useDisplayName` 인자를 추가한다. 기본값은 `false`.
- FR-3: 웹 UI 사이드바에서 `useDisplayName=false`일 때 `.md` 확장자를 제거한 실제 파일명을 표시하고, `useDisplayName=true`일 때 frontmatter 제목을 표시한다.
- FR-4: 웹 UI에 표시 모드 전환 토글(또는 설정)을 제공한다. 사용자 선택은 `localStorage`에 저장하여 유지한다.

### 1.4 비기능 요구사항
- NFR-1: `useDisplayName=false`일 때 frontmatter 파싱을 건너뛰어 성능을 개선한다.

### 1.5 제약사항
- tree-service의 반환 구조(`name`, `displayName`, `description` 필드)는 기존 호환성을 위해 유지한다.
- `useDisplayName=true`일 때는 현재와 동일하게 동작해야 한다 (회귀 없음).
- admin API(`/api/admin/tree`)는 이 변경의 범위 밖이다.
``
## 2. 현행 코드 분석

### 2.1 영향 범위
| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `src/services/tree-service.js` | 수정 | `getTreeData`, `getFullTreeData`에 `useDisplayName` 옵션 추가. `false`일 때 frontmatter 파싱 건너뛰기 |
| `src/controllers/tree-controller.js` | 수정 | 쿼리 파라미터 `useDisplayName` 파싱하여 서비스에 전달 |
| `src/routes/mcp.js` | 수정 | `list_documents`, `list_full_tree` 도구에 `useDisplayName` 인자 추가 및 출력 포맷 반영 |
| `src/views/index.ejs` | 수정 | `.sidebar-header` 내 `#refresh-btn` 옆에 표시 모드 토글 버튼(`#display-name-toggle-btn`) HTML 추가 |
| `public/js/app.js` | 수정 | tree 렌더링 시 표시 모드 토글 반영, localStorage 저장/읽기, API 호출 시 파라미터 전달 |

### 2.2 재사용 가능 코드
- `parseFrontmatterFromFile` (frontmatter-service.js) — `useDisplayName=true`일 때만 호출하도록 조건 분기
- `DocLightUtils.prefixPath` (doclight-utils.js) — API 호출 경로 생성에 기존대로 사용

### 2.3 주의사항
- `app.js:968`에서 `file.displayName || file.name.slice(0, -3)` 패턴은 displayName이 null이면 자동으로 파일명 폴백하므로, 서비스에서 displayName을 null로 보내면 프론트에서 추가 수정 없이도 파일명이 표시된다.
- MCP `list_documents`/`list_full_tree`는 현재도 `file.name`만 출력 중이므로, `useDisplayName=true`일 때만 displayName을 추가 표시하면 된다.
- `app.js:513, 533`의 이전/다음 내비게이션에서도 displayName을 사용하므로, tree 데이터 로딩 시 옵션이 일관되게 적용되어야 한다.

## 3. 구현 계획

## Phase 1: 백엔드 — tree-service 옵션 추가
- [x] Phase 1-1: `getTreeData(config, logger, userPath, options)` 시그니처에 `options.useDisplayName` (기본값: `false`) 추가 `FR-1` ✅
- [x] Phase 1-2: `useDisplayName === false`일 때 frontmatter 파싱을 건너뛰고 `displayName = null`, `description = null` 반환 `FR-1` `NFR-1` ✅
- [x] Phase 1-3: `getFullTreeData`에도 동일한 `useDisplayName` 옵션 적용 `FR-1` `NFR-1` ✅
- **테스트:**
  - 정상: `useDisplayName=false` → 모든 파일의 `displayName`이 `null`
  - 정상: `useDisplayName=true` → frontmatter title이 있는 파일은 `displayName` 값이 존재
  - 경계값: frontmatter가 없는 `.md` 파일 → 양쪽 모두 `displayName`이 `null`

## Phase 2: 백엔드 — API/MCP 파라미터 전달
- [x] Phase 2-1: `tree-controller.js`의 `getTree`, `getFullTree`에서 `req.query.useDisplayName` 파싱 (`'true'`일 때만 true, 기본 false) 후 서비스에 전달 `FR-1` ✅
- [x] Phase 2-2: `mcp.js`의 `list_documents`, `list_full_tree` 도구 inputSchema에 `useDisplayName` boolean 인자 추가 (기본값: `false`) `FR-2` ✅
- [x] Phase 2-3: MCP `list_documents` 출력에서 `useDisplayName=true`이고 `file.displayName`이 있으면 `📄 displayName (file.name)` 형식으로 표시, 아니면 `📄 file.name` 유지 `FR-2` ✅
- [x] Phase 2-4: MCP `list_full_tree` 출력에도 동일 로직 적용 `FR-2` ✅
- **테스트:**
  - 정상: `GET /api/tree?path=/&useDisplayName=true` → displayName 포함 응답
  - 정상: `GET /api/tree?path=/` (파라미터 없음) → displayName이 모두 null
  - 정상: MCP `list_documents` with `useDisplayName: true` → 표시명 포함 출력
  - 예외: `useDisplayName=invalid` → false로 처리 (boolean 파싱 안전장치)

## Phase 3: 프론트엔드 — 표시 모드 토글
- [x] Phase 3-1: `app.js`에서 tree 데이터 fetch 시 localStorage의 `doclight-useDisplayName` 값을 읽어 `useDisplayName` 쿼리 파라미터로 전달 `FR-3` ✅
- [x] Phase 3-2: `index.ejs`의 `.sidebar-header` 내부, `#refresh-btn` 옆에 표시 모드 토글 버튼 추가 (아이콘 토글, id: `display-name-toggle-btn`). `app.js`에서 이벤트 핸들러 바인딩 `FR-4` ✅
- [x] Phase 3-3: 토글 클릭 시 localStorage에 저장하고 tree를 다시 로드 `FR-4` ✅
- [x] Phase 3-4: 기본값은 `false` (실제 파일명 표시). localStorage에 값이 없으면 false `FR-3` ✅
- **테스트:**
  - 정상: 토글 OFF(기본) → 사이드바에 실제 파일명 표시
  - 정상: 토글 ON → 사이드바에 frontmatter 제목 표시 (frontmatter 없는 파일은 파일명 폴백)
  - 정상: 브라우저 새로고침 후 토글 상태 유지 확인
  - 예외: localStorage 접근 불가 환경 → 기본값(false) 사용

## 4. 검증 기준
- [x] 빌드 성공 (`node src/app.js` 정상 기동) ✅
- [x] 기존 테스트 통과 (회귀 없음) ✅
- [x] REST API: `useDisplayName` 파라미터 없이 호출 시 displayName이 null ✅
- [x] REST API: `useDisplayName=true` 호출 시 기존과 동일한 displayName 반환 ✅
- [x] MCP: `list_documents`, `list_full_tree`에 `useDisplayName` 인자 동작 확인 ✅
- [ ] 웹 UI: 토글로 표시 모드 전환 가능, localStorage 유지 (수동 확인 필요)
- [x] 요구사항 전수 매핑: FR-1 → Phase 1 + Phase 2-1, FR-2 → Phase 2-2~2-4, FR-3 → Phase 3-1 + 3-4, FR-4 → Phase 3-2 + 3-3, NFR-1 → Phase 1-2 + 1-3 ✅
