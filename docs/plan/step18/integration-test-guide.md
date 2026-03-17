# Step 18: 통합 테스트 가이드

## 테스트 환경 설정

```json5
// test-config.json5
{
  port: 30001,
  docsRoot: "./test-source",
  auth: {
    requireReadLogin: true,
    allowSignup: true,
    signupMode: "self",
    allowedEmailDomains: ["test.com"],
    selfSignup: { defaultGroupName: "Viewer" },
    sessionTimeout: 60000
  },
  log: { dir: "./logs", level: "info" }
}
```

---

## E2E 시나리오

### E2E-01: 직접 가입 → 문서 열람 → 로그 확인 (CRITICAL)

```
1. GET /signup → 가입 폼 렌더링 확인 (signupMode=self 안내 텍스트)
2. POST /api/auth/signup { email: "e2e@test.com", password: "TestPass1", passwordConfirm: "TestPass1" }
   → 200, { success: true, mode: "self", session: {...} }
   → Set-Cookie: doclight_session=...
3. GET / → 메인 페이지 정상 렌더링 (로그인 상태)
4. GET /doc/test-doc → 문서 열람 정상
5. 로그 파일 확인:
   - [AUTH] SIGNUP_SELF email=e2e@test.com
   - [DOC] VIEW path=/test-doc user=e2e@test.com
```

### E2E-02: 승인 기반 가입 흐름 (CRITICAL)

```
1. config 변경: signupMode: "approval"
2. POST /api/auth/signup { email: "approve@test.com", ... }
   → 200, { success: true, emailSent: false, ... } (SMTP 미설정 시)
3. 관리자 로그인 → 가입 요청 목록 확인 → 승인
4. 로그 파일 확인:
   - [AUTH] SIGNUP_REQUEST email=approve@test.com
   - [AUTH] SIGNUP_APPROVED email=approve@test.com by=admin@...
```

### E2E-03: 도메인 제한 + 직접 가입 거부 (HIGH)

```
1. config: signupMode: "self", allowedEmailDomains: ["test.com"]
2. POST /api/auth/signup { email: "user@other.com", ... }
   → 400, { error: { code: "EMAIL_DOMAIN_NOT_ALLOWED" } }
3. POST /api/auth/signup { email: "user@test.com", ... }
   → 200, 가입 성공
```

### E2E-04: MCP 활동 로그 (HIGH)

```
1. POST /mcp (X-API-Key: valid-key)
   { jsonrpc: "2.0", method: "tools/call", params: { name: "read_document", arguments: { path: "/test.md" } } }
   → 정상 응답
2. 로그 파일 확인:
   - [MCP] TOOL=read_document user=apikey(...)  ip=... args={...}
```

### E2E-05: 관리 행위 로그 (HIGH)

```
1. 관리자 로그인
2. 사용자 생성 API 호출
3. 그룹 수정 API 호출
4. 설정 변경 API 호출
5. 로그 파일 확인:
   - [ADMIN] USER_CREATE ...
   - [ADMIN] GROUP_UPDATE ...
   - [ADMIN] SETTINGS_UPDATE ...
```

### E2E-06: allowSignup: false 시 가입 차단 (MEDIUM)

```
1. config: allowSignup: false
2. GET /signup → 로그인 페이지로 리다이렉트
3. POST /api/auth/signup → 400/403 에러
```

---

## 컴포넌트 통합 매트릭스

| 컴포넌트 A | 컴포넌트 B | 통합 포인트 | 테스트 |
|-----------|-----------|-----------|--------|
| config-loader | auth-controller | signupMode 전달 | E2E-01, E2E-02 |
| config-loader | auth-settings-store | 설정 읽기/쓰기 | E2E-05 |
| auth-controller | userStore | 직접 가입 시 사용자 생성 | E2E-01 |
| auth-controller | groupStore | defaultGroupName 조회 | E2E-01 |
| auth-controller | sessionService | 직접 가입 시 세션 생성 | E2E-01 |
| auth-controller | activity-logger | 인증 이벤트 기록 | E2E-01, E2E-02 |
| api.js routes | activity-logger | 문서 이벤트 기록 | E2E-01 |
| mcp.js routes | activity-logger | MCP 이벤트 기록 | E2E-04 |
| admin-api.js | activity-logger | 관리 이벤트 기록 | E2E-05 |
| signup.ejs | auth-controller | 모드별 폼 렌더링 | E2E-01, E2E-02 |

---

## 요구사항 추적 매트릭스

| 요구사항 | E2E 시나리오 |
|---------|-------------|
| FR-18-001 (가입 모드 설정) | E2E-01, E2E-02 |
| FR-18-002 (직접 가입) | E2E-01, E2E-03 |
| FR-18-003 (승인 기반 유지) | E2E-02 |
| FR-18-004 (가입 폼 UI) | E2E-01, E2E-06 |
| FR-18-005 (인증 로그) | E2E-01, E2E-02 |
| FR-18-006 (문서 로그) | E2E-01 |
| FR-18-007 (MCP 로그) | E2E-04 |
| FR-18-008 (관리 로그) | E2E-05 |
