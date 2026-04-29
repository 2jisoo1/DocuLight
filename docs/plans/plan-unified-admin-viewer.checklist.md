# plan-unified-admin-viewer — Phase Checklist

> PM 자동 생성 (snoworca-pm §15.8 폴백). plan.md 무수정.
> 생성: 2026-04-28T21:12:09Z

> SSOT: pm-state.json. 본 파일은 보조 뷰.

## Phase 1: 정리 작업 (LocalPreview 제거 + /admin 리다이렉트 + 모듈 디렉토리)
- [x] **TASK-P1-001** LocalPreview 객체 + 호출 제거
- [x] **TASK-P1-002** .local-preview-* CSS 셀렉터 제거
- [x] **TASK-P1-003** /admin 및 /admin/* 302 리다이렉트
- [x] **TASK-P1-004** public/js/modules/ 디렉토리 + README placeholder

## Phase 2: 모드 시스템 코어 (mode.js + EJS 통합 + app.js 엔트리)
- [x] **TASK-P2-001** mode.js — 토글/권한/URL 동기화
- [x] **TASK-P2-002** index.ejs 통합 페이지 확장 (토글 + 관리 버튼 DOM)
- [x] **TASK-P2-003** app.js ESM 엔트리 변환 + 권한별 lazy import

## Phase 3: 트리/DnD/업로드 모듈
- [x] **TASK-P3-001** tree.js 신규
- [x] **TASK-P3-002** dnd.js 신규
- [x] **TASK-P3-003** upload.js 신규

## Phase 4: modal-ui + 컨텍스트 메뉴 + 에디터 + 관리 모달 (작업 순서: P4-000 → P4-001 → P4-002 → P4-003)
- [x] **TASK-P4-000** modal-ui.js 신규 (showConfirm + confirmUnsaved 분리)
- [x] **TASK-P4-001** context-menu.js 신규
- [x] **TASK-P4-002** editor.js 신규 + unsaved hook
- [x] **TASK-P4-003** admin-modal.js 신규 (관리 모달 전용)

## Phase 5: /doc/* 통합 + 회귀 + 정리
- [x] **TASK-P5-001** doc-viewer.ejs 통합
- [x] **TASK-P5-002** app.js try-catch graceful degradation 제거
- [x] **TASK-P5-003** admin.ejs + admin.js 제거 + admin.css 검토
- [x] **TASK-P5-004** 통합 회귀 e2e + 성능 + 릴리즈 노트
