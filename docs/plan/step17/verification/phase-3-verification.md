# Phase 3 검증 보고서

## 완료 체크리스트

### 3.1 auth.js 전면 재작성
- [ ] `src/middleware/auth.js` 전면 재작성
- [ ] user-key 추출: `X-API-Key` 또는 `Authorization: Bearer`
- [ ] user-key -> SHA-256 해싱 -> `UserStore.findByUserKeyHash(hash)`
- [ ] 비활성 계정 체크, 권한 조회, `req.apiUser` 설정
- [ ] `crypto.timingSafeEqual()` 사용 (타이밍 공격 방지)
- [ ] 검증: 유효한 user-key -> 통과, 잘못된 key -> 401, 비활성 계정 -> 401

### 3.2 admin-auth.js 수정
- [ ] `adminAuth()` 미들웨어 수정 (세션 토큰 + 사용자 상태 확인)
- [ ] `requirePermission()` 수정 (`delete` -> `write` 매핑, `superuser` 추가)
- [ ] `req.adminSession`에 userId, email, groupId, permissions 포함
- [ ] 검증: 세션 기반 인증 + 권한 검사 동작

### 3.3 조건부 인증 미들웨어
- [ ] `src/middleware/conditional-auth.js` 생성
- [ ] `requireReadLogin` 설정에 따라 읽기 경로 인증 조건부 적용
- [ ] 웹 요청 미인증 시 `/login` 리다이렉트, API 요청 시 401
- [ ] 검증: requireReadLogin true/false 전환 시 즉시 반영

### 3.4 api.js (Public API) 수정
- [ ] 읽기 라우트에 `conditionalAuth()` 적용
- [ ] 쓰기 라우트에 `auth()` + `requirePermission('write')` 적용
- [ ] 검증: 읽기 공개 상태에서 쓰기 시 user-key 필요

### 3.5 mcp.js 수정
- [ ] `validateApiKey()` 함수를 user-key 기반으로 수정
- [ ] 읽기 도구: `requireReadLogin`에 따라 조건부, 쓰기 도구: 항상 필요
- [ ] 검증: MCP 읽기/쓰기 도구의 인증 동작

### 3.6 context-mcp.js 수정
- [ ] user-key 검증 로직 적용
- [ ] 검증: context-mcp 엔드포인트 인증 동작

### 3.7 기존 admin-api.js 인증 엔드포인트 폐기 준비
- [ ] `POST /api/admin/auth` -> 410 Gone
- [ ] `POST /api/admin/logout` -> 410 Gone
- [ ] `GET /api/admin/session` -> 410 Gone
- [ ] `POST /api/admin/session/refresh` -> 410 Gone
- [ ] `requirePermission('delete')` -> `requirePermission('write')` 변경
- [ ] 검증: 폐기 엔드포인트 호출 시 410 + 안내 메시지

## 테스트 결과

| 테스트 | 유형 | 결과 | 비고 |
|--------|------|------|------|
| 유효한 user-key로 `GET /api/tree` (requireReadLogin=true) -> 200 | 정상 | [ ] | - |
| `requireReadLogin=false`에서 인증 없이 `GET /api/tree` -> 200 | 정상 | [ ] | - |
| 비활성화된 사용자의 user-key -> 401 `ACCOUNT_DISABLED` | 예외 | [ ] | - |
| read 권한만 있는 사용자가 `POST /api/upload` -> 403 | 예외 | [ ] | - |
| `Authorization: Bearer <key>` 형식 사용 -> 인증 성공 | 경계 | [ ] | - |

## 품질 평가

| 기준 | 등급 | 비고 |
|------|------|------|
| 스펙-코드 정합성 | - | - |
| 테스트 커버리지 | - | - |
| 에러 처리 | - | - |
| 코드 가독성 | - | - |

## 회귀 테스트

| 항목 | 결과 |
|------|------|
| 기존 `/api/tree`, `/api/raw` 공개 접근 유지 (requireReadLogin=false) | [ ] |
| 기존 `/doc/*` 문서 뷰어 정상 동작 | [ ] |
| `/admin` 페이지 접근 시 로그인 필요 (세션 기반) | [ ] |
| MCP search_documents 정상 동작 | [ ] |
| MCP create_document에 user-key 필요 | [ ] |
| 기존 admin 파일 작업 API 세션으로 동작 | [ ] |

## 이슈

| # | 이슈 | 심각도 | 해결 |
|---|------|--------|------|
| - | - | - | - |
