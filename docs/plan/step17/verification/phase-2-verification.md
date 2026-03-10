# Phase 2 검증 보고서

## 완료 체크리스트

### 2.1 Setup Guard 미들웨어
- [ ] `src/middleware/setup-guard.js` 생성
- [ ] `UserStore.getUserCount() === 0`이면 `/setup` 리다이렉트, 아니면 통과
- [ ] 캐시: Setup 완료 플래그를 메모리에 저장
- [ ] `app.js`에서 IP whitelist + request logger 직후에 마운트
- [ ] 검증: 사용자 0명 -> /setup 리다이렉트. 1명 이상 -> 통과

### 2.2 Setup Wizard 페이지 (서버)
- [ ] `src/views/setup.ejs` 생성 (이메일, 패스워드, 패스워드 확인, 버튼)
- [ ] `app.js`에 `GET /setup` 라우트 추가
- [ ] 검증: 사용자 0명 상태에서 /setup 접속 시 폼 표시

### 2.3 Setup API 엔드포인트
- [ ] `POST /api/auth/setup` 엔드포인트 구현
- [ ] 사용자 존재 시 403, 이메일/패스워드 검증, 슈퍼유저 생성
- [ ] Setup 완료 플래그 갱신
- [ ] 검증: Setup 완료 후 동일 API 재호출 시 403

### 2.4 세션 서비스 확장
- [ ] `session-service.js` 수정
- [ ] `createSession(user, authSettings)` 시그니처 변경
- [ ] `invalidateByUserId(userId)` 추가
- [ ] `refreshSession(token, authSettings)` 추가
- [ ] 기존 `findApiKeyConfig()` 함수 유지
- [ ] 검증: 새 시그니처로 세션 생성/검증/무효화 동작

### 2.5 로그인 페이지
- [ ] `src/views/login.ejs` 생성 (이메일, 패스워드, 로그인 버튼)
- [ ] `app.js`에 `GET /login` 라우트 추가
- [ ] 검증: /login 접속 시 폼 표시

### 2.6 로그인 API 엔드포인트
- [ ] `src/controllers/auth-controller.js` 생성
- [ ] `src/routes/auth-api.js` 생성, `/api/auth` 마운트
- [ ] `POST /api/auth/login` 구현 (인증, 세션 생성, 쿠키 설정)
- [ ] 검증: 정상 로그인, 잘못된 패스워드, 비활성 계정, 잠금 계정

### 2.7 로그아웃 API
- [ ] `POST /api/auth/logout` 구현
- [ ] 검증: 로그아웃 후 세션 토큰 무효화

### 2.8 세션 조회/갱신 API
- [ ] `GET /api/auth/session` 구현
- [ ] `POST /api/auth/session/refresh` 구현
- [ ] 검증: 세션 조회 + 갱신 동작

### 2.9 app.js 통합
- [ ] Setup Guard 미들웨어 마운트
- [ ] `/api/auth` 라우터 마운트
- [ ] `/setup`, `/login` 페이지 라우트 추가
- [ ] 서버 시작 시 Store 초기화
- [ ] 검증: 서버 시작 -> Setup Wizard -> 슈퍼유저 생성 -> 로그인 -> /admin 접속

## 테스트 결과

| 테스트 | 유형 | 결과 | 비고 |
|--------|------|------|------|
| 서버 처음 시작 시 `/` 접속 -> `/setup` 리다이렉트 | 정상 | [ ] | - |
| Setup 완료 후 올바른 이메일+패스워드 로그인 -> 세션 생성 | 정상 | [ ] | - |
| 슈퍼유저 존재 시 `POST /api/auth/setup` 재호출 -> 403 | 예외 | [ ] | - |
| 존재하지 않는 이메일로 로그인 -> 401 (이메일 존재 여부 노출 안 함) | 예외 | [ ] | - |
| 연속 5회 잘못된 패스워드 후 6번째 시도 -> 429 | 경계 | [ ] | - |

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
| 기존 `/admin` 페이지 접근 가능 (아직 기존 API Key 방식 유지) | [ ] |
| 기존 API 엔드포인트 정상 동작 (`/api/tree`, `/api/raw` 등) | [ ] |
| 기존 MCP 기능 정상 동작 | [ ] |
| 기존 `POST /api/admin/auth` (API Key 로그인)이 아직 동작 | [ ] |

## 이슈

| # | 이슈 | 심각도 | 해결 |
|---|------|--------|------|
| - | - | - | - |
