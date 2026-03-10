# Step 17: 통합 테스트 가이드

## 목적

전체 사용자 관리 시스템의 E2E(End-to-End) 테스트 시나리오를 정의한다. 모든 Phase 완료 후 시스템 전체의 정합성을 검증한다.

---

## E2E 시나리오 1: 최초 설정 → 슈퍼유저 사용 (CRITICAL)

### Given
- 서버가 처음 시작됨 (data/ 비어있음)
- config.json5에 dataDir, email 설정 있음

### When-Then 흐름
1. `GET /` → 302 `/setup`
2. `GET /admin` → 302 `/setup`
3. `GET /api/tree` → 302 `/setup`
4. `GET /setup` → Setup Wizard 페이지 렌더링
5. `POST /api/auth/setup` (email, password) → 201
6. `GET /` → 정상 메인 페이지 (Setup Guard 통과)
7. `GET /admin` → 302 `/login`
8. `POST /api/auth/login` (email, password) → 200 + 세션 쿠키
9. `GET /api/admin/users` → 200 (사용자 1명)
10. `GET /api/admin/groups` → 200 (기본 3개 그룹)
11. `GET /api/auth/me` → 200 (슈퍼유저 정보)

### 검증 포인트
- [ ] data/users.json 생성됨
- [ ] data/groups.json 생성됨 (3개 기본 그룹)
- [ ] data/auth-settings.json 생성됨
- [ ] 세션 쿠키: httpOnly, SameSite=Strict

---

## E2E 시나리오 2: 사용자 관리 + 권한 검증 (CRITICAL)

### Given
- 슈퍼유저로 로그인 상태

### When-Then 흐름
1. `POST /api/admin/users` (Editor 그룹) → 200 + user-key 반환
2. 슈퍼유저 로그아웃
3. Editor user-key로 `GET /api/tree` (requireReadLogin=false) → 200
4. Editor user-key로 `POST /api/upload` → 200 (write 권한 있음)
5. Editor로 `/admin` 로그인 → 파일 관리 탭 + 내 정보 탭만 표시
6. Editor가 `GET /api/admin/users` 시도 → 403 (superuser 필요)
7. Viewer 사용자 생성 → Viewer user-key로 `POST /api/upload` → 403

### 검증 포인트
- [ ] Editor: write + read 권한 동작
- [ ] Editor: superuser 기능 접근 차단
- [ ] Viewer: read만 가능, write 차단
- [ ] user-key 인증과 세션 인증이 올바른 권한 반환

---

## E2E 시나리오 3: 가입 워크플로우 (HIGH)

### Given
- 슈퍼유저 존재, 이메일 서버 설정됨, allowSignup=true

### When-Then 흐름
1. `GET /login` → 가입 요청 버튼 표시됨
2. `POST /api/auth/signup` (email, password, message) → 200
3. 인증 이메일 수신 → 인증 링크 클릭
4. `GET /api/auth/verify/:token` → 인증 성공 페이지
5. 슈퍼유저로 로그인 → `GET /api/admin/registrations` → 대기 1건
6. `POST /api/admin/registrations/:id/approve` (groupId: Editor) → 200
7. 승인 메일 수신
8. 가입 사용자로 로그인 → 성공

### 검증 포인트
- [ ] 가입 요청 → 인증 이메일 발송
- [ ] 인증 완료 → pending_approval 상태
- [ ] 승인 → 계정 생성 + user-key 발급 + 알림 메일
- [ ] 거절 시 알림 메일 + 재가입 가능

---

## E2E 시나리오 4: requireReadLogin 전환 (HIGH)

### Given
- requireReadLogin = false, 사용자 존재

### When-Then 흐름
1. `GET /api/tree` (인증 없음) → 200
2. 슈퍼유저가 requireReadLogin = true로 변경
3. `GET /api/tree` (인증 없음) → 401
4. `GET /api/tree` (user-key 헤더) → 200
5. 브라우저에서 `/doc/readme` → 302 `/login`

### 검증 포인트
- [ ] 설정 변경 즉시 반영
- [ ] API와 웹 모두 인증 요구
- [ ] MCP 읽기 도구도 인증 요구

---

## E2E 시나리오 5: 브루트포스 + Rate Limiting (HIGH)

### Given
- 사용자 존재

### When-Then 흐름
1. 잘못된 패스워드로 5회 로그인 시도 → 각각 401
2. 6번째 시도 (올바른 패스워드) → 429 `TOO_MANY_ATTEMPTS`
3. 15분 대기 후 → 잠금 해제, 올바른 패스워드로 로그인 성공
4. 동일 IP에서 11번째 로그인 시도 → 429 (Rate Limit)
5. 슈퍼유저가 잠금 해제 → 즉시 로그인 가능

### 검증 포인트
- [ ] 계정 잠금과 Rate Limiting 독립 동작
- [ ] 슈퍼유저 수동 잠금 해제 동작

---

## E2E 시나리오 6: 마이그레이션 (MEDIUM)

### Given
- 기존 config.json5에 apiKey/apiKeys 있음, users.json 없음

### When-Then 흐름
1. 서버 시작 → 폐기 경고 출력
2. `/setup` 접근 → Setup Wizard 표시
3. 기존 API Key로 마이그레이션 (선택적)
4. 슈퍼유저 생성 완료
5. 기존 `POST /api/admin/auth` → 410 + 안내 메시지
6. 새 `POST /api/auth/login` → 정상

### 검증 포인트
- [ ] 기존 config로 서버 시작 가능
- [ ] 폐기 엔드포인트에 안내 메시지
- [ ] 마이그레이션 후 새 시스템으로 동작

---

## 컴포넌트 통합 매트릭스

| 컴포넌트 A | 컴포넌트 B | 통합 포인트 | 검증 방법 |
|-----------|-----------|-----------|----------|
| Setup Guard | UserStore | getUserCount() | E2E 시나리오 1 |
| auth.js | UserStore | findByUserKeyHash() | E2E 시나리오 2 |
| admin-auth.js | SessionService | validateSession() | E2E 시나리오 2 |
| SessionService | AuthSettingsStore | sessionTimeout | E2E 시나리오 4 |
| SignupService | EmailService | sendVerificationEmail() | E2E 시나리오 3 |
| SignupService | RegistrationStore | create/update | E2E 시나리오 3 |
| AdminGroupController | GroupStore | CRUD | E2E 시나리오 2 |
| AdminUserController | UserStore | CRUD + 인덱스 | E2E 시나리오 2 |
| RateLimiter | auth-controller | login | E2E 시나리오 5 |
| conditional-auth | AuthSettingsStore | requireReadLogin | E2E 시나리오 4 |

---

## 테스트 도구

| 도구 | 용도 |
|------|------|
| cURL | API 엔드포인트 테스트 |
| Playwright | 브라우저 E2E 테스트 (UI 동작) |
| nodemailer test account | 이메일 발송 테스트 (ethereal.email) |

## 요구사항 추적 매트릭스

| SRS 요구사항 | 검증 시나리오 |
|-------------|-------------|
| FR-17-001 Setup Wizard | 시나리오 1 |
| FR-17-002 로그인/로그아웃 | 시나리오 1, 2 |
| FR-17-003 로그인 판단 | 시나리오 4 |
| FR-17-004 그룹 관리 | 시나리오 2 |
| FR-17-005 사용자 관리 | 시나리오 2 |
| FR-17-006 user-key | 시나리오 2 |
| FR-17-007 가입 워크플로우 | 시나리오 3 |
| FR-17-008 이메일 서비스 | 시나리오 3 |
| FR-17-009 인증 설정 | 시나리오 4 |
| FR-17-012 CLI 리셋 | 시나리오 6 |
| NFR-17-003 브루트포스 | 시나리오 5 |
| NFR-17-007 Rate Limiting | 시나리오 5 |
| NFR-17-009 호환성 | 시나리오 6 |
