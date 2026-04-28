# 2026-04-28-admin-fixes — Phase Checklist

> PM 자동 생성 파일 (snoworca-pm §15.8 폴백). plan.md 무수정.
> 생성: 2026-04-28T06:30:54Z

> SSOT: pm-state.json. 본 파일은 보조 뷰.

## Phase 1 — 패스워드 길이 검증 버그 (TDD 강제)
- [x] **TASK-P1-001** [RED] 패스워드 trim 검증 실패 테스트 작성
- [x] **TASK-P1-002** [GREEN] password-validator 헬퍼 구현
- [x] **TASK-P1-003** [GREEN] backend 컨트롤러에 헬퍼 적용
- [x] **TASK-P1-004** [GREEN] frontend admin.js 3개소 trim 적용

## Phase 2 — 계정 잠금 해제 미작동 (TDD 강제)
- [x] **TASK-P2-001** [RED] userStore.resetFailedLogin 단위 테스트 작성
- [x] **TASK-P2-002** [GREEN] backend 검증 (필요 시 fixture 헬퍼만)
- [x] **TASK-P2-003** [GREEN] frontend unlockUser/resetPassword 핸들러에 목록 갱신 추가

## Phase 3 — 관리자 ID/PW 변경 모달화 (옵션 A, TDD 강제)
- [x] **TASK-P3-001** [RED] 모달 폼 검증 함수 테스트 작성
- [x] **TASK-P3-002** [GREEN] password-change-form 검증 모듈 구현
- [x] **TASK-P3-003** [GREEN] admin.ejs에 #password-change-modal 모달 컨테이너 추가
- [x] **TASK-P3-004** [GREEN] admin.js 프로필 탭에서 인라인 폼 → 버튼 + 모달 핸들러로 교체
