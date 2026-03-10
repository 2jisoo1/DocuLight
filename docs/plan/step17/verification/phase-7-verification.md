# Phase 7 검증 보고서

## 완료 체크리스트

### 7.1 의존성 추가
- [ ] `package.json`에 `nodemailer` 추가
- [ ] `npm install nodemailer`
- [ ] 검증: `require('nodemailer')` 정상 로드

### 7.2 이메일 서비스
- [ ] `src/services/email-service.js` 생성
- [ ] `initialize(emailConfig)`: nodemailer transporter 생성
- [ ] `isConfigured()`: 이메일 설정 유무 반환
- [ ] `sendVerificationEmail(email, token, baseUrl)`: 인증 이메일 발송
- [ ] `sendApprovalEmail(email, loginUrl)`: 승인 알림 이메일
- [ ] `sendRejectionEmail(email)`: 거절 알림 이메일
- [ ] `verify()`: SMTP 연결 테스트
- [ ] 에러 처리: 발송 실패 시 1회 재시도
- [ ] 검증: SMTP 연결 + 이메일 발송 동작

### 7.3 가입 요청 API
- [ ] `POST /api/auth/signup` 구현
- [ ] allowSignup 확인, 이메일/도메인 검증, 중복 확인
- [ ] 거절/만료된 요청 재요청 가능
- [ ] RegistrationStore 생성 + 인증 이메일 발송
- [ ] 검증: 정상 가입 요청 + 도메인 제한 + 중복 이메일

### 7.4 이메일 인증 API
- [ ] `GET /api/auth/verify/:token` 구현
- [ ] 토큰 조회, 만료 확인, 상태 변경
- [ ] `src/views/verify.ejs` 생성
- [ ] `app.js`에 `GET /verify/:token` 라우트 추가
- [ ] 검증: 유효한 토큰 -> 인증 성공, 만료 토큰 -> 실패

### 7.5 가입 대기 관리 API (슈퍼유저)
- [ ] `GET /api/admin/registrations` -- 가입 대기 목록
- [ ] `POST /api/admin/registrations/:id/approve` -- 승인 (계정 생성 + 메일)
- [ ] `POST /api/admin/registrations/:id/reject` -- 거절 (메일 발송)
- [ ] `admin-api.js`에 라우트 등록
- [ ] 검증: 승인 -> 계정 생성 + 메일 발송, 거절 -> 메일 발송

### 7.6 가입 대기 자동 정리
- [ ] 세션 cleanup 타이머에 `RegistrationStore.cleanup()` 추가
- [ ] 정리 정책: pending_verification 7일, approved/rejected 30일, expired 7일
- [ ] 검증: 만료된 레코드 자동 삭제

### 7.7 가입 요청 UI
- [ ] `login.ejs`에 "가입 요청" 버튼 추가 (조건부 표시)
- [ ] `src/views/signup.ejs` 생성
- [ ] `app.js`에 `GET /signup` 라우트 추가
- [ ] 검증: 가입 요청 UI -> API 호출 -> 인증 이메일 수신

### 7.8 Admin UI -- 가입 대기 탭
- [ ] 대기 목록 테이블 (이메일, 메시지, 요청일, 인증일)
- [ ] "승인" 버튼 -> 그룹 선택 모달, "거절" 버튼 -> 확인 다이얼로그
- [ ] 검증: 승인/거절 UI 동작

## 테스트 결과

| 테스트 | 유형 | 결과 | 비고 |
|--------|------|------|------|
| allowSignup=true, 이메일 서버 설정 -> 가입 요청 -> 인증 -> 승인 -> 로그인 | 정상 | [ ] | - |
| allowedEmailDomains=["company.com"], user@other.com -> 400 | 예외 | [ ] | - |
| 이메일 서버 미설정 시 "가입 요청" 버튼 숨김 | 예외 | [ ] | - |
| 인증 토큰 24시간 경과 후 클릭 -> 410 `VERIFICATION_TOKEN_EXPIRED` | 경계 | [ ] | - |

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
| 기존 로그인 기능 정상 | [ ] |
| 기존 admin 기능 정상 | [ ] |
| 이메일 서버 미설정 시 서버 시작 정상 (가입 기능만 비활성) | [ ] |

## 이슈

| # | 이슈 | 심각도 | 해결 |
|---|------|--------|------|
| - | - | - | - |
