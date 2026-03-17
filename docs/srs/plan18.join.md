# SRS: DocLight Step 18 — 회원가입 모드 확장 및 활동 로그 강화

## 메타데이터
- **버전**: step18
- **생성일**: 2026-03-11
- **이전 버전**: docs/plan/plan.step17.user.md (Step 17: 사용자 인증/관리 시스템)
- **평가 라운드**: 초안

---

## 1. 개요

### 1.1 목적

Step 17에서 구현된 사용자 인증/관리 시스템을 확장하여:
1. **회원가입 모드 이원화** — 관리자 승인 기반 가입과 사용자 직접 가입(self-registration) 중 선택 가능
2. **활동 로그 강화** — 사용자 행동(로그인/로그아웃, 문서 열람/업로드/삭제, MCP 사용) 전체를 `.log` 파일에 기록

### 1.2 범위

| 포함 | 제외 |
|------|------|
| 가입 모드 설정 옵션 (`config.json5`) | OAuth2/소셜 로그인 |
| 직접 가입 시 기본 그룹 자동 배정 | 사용자 프로필 이미지 |
| 이메일 도메인 제한 (양 모드 공통) | 로그 대시보드 UI |
| 가입 폼 UI (이메일, 패스워드, 패스워드 확인) | 로그 실시간 스트리밍 |
| 활동 로그 기록 (파일 기반 `.log`) | 외부 로그 수집 시스템 연동 |

### 1.3 이전 버전 대비 변경사항

| 항목 | Step 17 (현재) | Step 18 (변경) |
|------|---------------|---------------|
| 가입 모드 | 승인 기반만 지원 (`pending_verification → pending_approval → approved`) | `approval` (기존) + `self` (직접 가입) 모드 선택 가능 |
| 가입 설정 | `auth.allowSignup`, `auth.allowedEmailDomains` | + `auth.signupMode`, `auth.selfSignup.defaultGroup` |
| 로깅 | request-logger (method, path, status, duration, IP) | + 활동 로그: 인증, 문서, MCP, 관리 행위 전체 |

---

## 2. 기능 요구사항

### FR-18-001: 회원가입 모드 설정

- **설명**: `config.json5`의 `auth` 섹션에 가입 모드 옵션을 추가하여 관리자가 선택 가능
- **입력**: `config.json5` 설정값
  ```json5
  auth: {
    allowSignup: true,
    signupMode: "approval",  // "approval" | "self"
    allowedEmailDomains: [],
    selfSignup: {
      defaultGroupName: "Viewer"  // 직접 가입 시 배정될 기본 그룹명
    }
  }
  ```
- **처리**:
  1. `signupMode`가 없거나 유효하지 않으면 기본값 `"approval"` 적용
  2. `allowSignup: false`이면 `signupMode`와 무관하게 가입 비활성화
  3. `selfSignup.defaultGroupName`이 없으면 기본값 `"Viewer"` 적용
  4. 서버 시작 시 `defaultGroupName`에 해당하는 그룹 존재 여부 검증 → 없으면 경고 로그 + `"Viewer"` 폴백
- **출력**: config-loader에서 정규화된 설정 객체
- **예외**:
  - `signupMode`에 `"approval"`, `"self"` 외 값 → 경고 로그 + `"approval"` 폴백
- **우선순위**: P0

### FR-18-002: 직접 가입 (Self-Registration) 흐름

- **설명**: `signupMode: "self"`일 때 사용자가 가입 폼 제출만으로 즉시 계정 생성
- **입력**: POST `/api/auth/signup` — `{ email, password, passwordConfirm }`
- **처리**:
  1. 이메일 형식 검증 (기존 regex 재사용)
  2. 이메일 도메인 제한 검사 (`allowedEmailDomains` — 빈 배열이면 모든 도메인 허용)
  3. 패스워드 검증: 최소 8자, `password === passwordConfirm`
  4. 중복 이메일 검사 (userStore + registrationStore)
  5. 패스워드 bcrypt 해싱 (cost 12)
  6. **userStore에 즉시 사용자 생성** (승인 대기 없음)
     - `groupId`: `selfSignup.defaultGroupName`에 해당하는 그룹 ID (기본 Viewer)
     - `status`: `"active"`
  7. **세션 즉시 생성** → 로그인 상태로 응답
  8. 활동 로그 기록: `[SIGNUP] self-registration, email={email}, group={groupName}`
- **출력**:
  ```json
  {
    "success": true,
    "mode": "self",
    "session": { "token": "...", "permissions": ["read"], "expiresAt": "..." }
  }
  ```
- **예외**:
  | 조건 | HTTP | 에러 코드 |
  |------|------|----------|
  | 이메일 형식 오류 | 400 | `INVALID_EMAIL` |
  | 도메인 제한 위반 | 400 | `EMAIL_DOMAIN_NOT_ALLOWED` |
  | 패스워드 불일치 | 400 | `PASSWORD_MISMATCH` |
  | 패스워드 8자 미만 | 400 | `PASSWORD_TOO_SHORT` |
  | 이메일 중복 | 409 | `EMAIL_ALREADY_EXISTS` |
- **우선순위**: P0

### FR-18-003: 승인 기반 가입 (Approval) 흐름 유지

- **설명**: `signupMode: "approval"`일 때 기존 Step 17 흐름 유지
- **처리**: 기존 로직 그대로 — `pending_verification → pending_approval → approved`
- **변경점**: 없음 (기존 코드 보존)
- **우선순위**: P0

### FR-18-004: 가입 폼 UI

- **설명**: `/signup` 페이지에 가입 모드에 따른 UI 분기
- **입력**: GET `/signup` 요청
- **처리**:
  1. 서버에서 현재 `signupMode`를 EJS 변수로 전달
  2. 공통 필드: 이메일, 패스워드, 패스워드 확인
  3. `approval` 모드: 기존 UI 유지 (가입 요청 전송 → 승인 대기 메시지)
  4. `self` 모드: 가입 완료 시 즉시 메인 페이지로 리다이렉트
  5. 클라이언트 유효성 검사:
     - 이메일 형식 실시간 검증
     - 패스워드 최소 8자 안내
     - 패스워드 확인 일치 여부 실시간 표시
- **출력**: 렌더링된 HTML 폼
- **예외**:
  - `allowSignup: false` → 가입 페이지 접근 시 로그인 페이지로 리다이렉트 + 안내 메시지
- **우선순위**: P0

### FR-18-005: 활동 로그 — 인증 이벤트

- **설명**: 로그인/로그아웃/가입 등 인증 관련 이벤트를 `.log` 파일에 기록
- **입력**: 인증 관련 API 호출
- **처리**: 아래 이벤트를 로그 파일에 기록

  | 이벤트 | 로그 형식 |
  |--------|----------|
  | 로그인 성공 | `[AUTH] LOGIN email={email} ip={ip}` |
  | 로그인 실패 | `[AUTH] LOGIN_FAILED email={email} ip={ip} reason={reason}` |
  | 로그아웃 | `[AUTH] LOGOUT email={email} ip={ip}` |
  | 가입 (self) | `[AUTH] SIGNUP_SELF email={email} ip={ip} group={group}` |
  | 가입 요청 (approval) | `[AUTH] SIGNUP_REQUEST email={email} ip={ip}` |
  | 가입 승인 | `[AUTH] SIGNUP_APPROVED email={email} by={adminEmail}` |
  | 가입 거부 | `[AUTH] SIGNUP_REJECTED email={email} by={adminEmail}` |
  | 세션 만료 | `[AUTH] SESSION_EXPIRED email={email}` |
  | 계정 잠금 | `[AUTH] ACCOUNT_LOCKED email={email} ip={ip}` |

- **출력**: `logs/DocuLight-YYYYMMDD.log` 파일에 추가 기록
- **우선순위**: P0

### FR-18-006: 활동 로그 — 문서 이벤트

- **설명**: 문서 열람/업로드/삭제 행위를 `.log` 파일에 기록
- **입력**: 문서 관련 API 호출 및 페이지 렌더링
- **처리**:

  | 이벤트 | 로그 형식 |
  |--------|----------|
  | 문서 열람 (웹) | `[DOC] VIEW path={docPath} user={email\|anonymous} ip={ip}` |
  | 문서 열람 (API) | `[DOC] API_READ path={docPath} user={email\|apiKeyName} ip={ip}` |
  | 문서 생성 | `[DOC] CREATE path={docPath} user={email\|apiKeyName} ip={ip} size={bytes}` |
  | 문서 수정 | `[DOC] UPDATE path={docPath} user={email\|apiKeyName} ip={ip} size={bytes}` |
  | 문서 삭제 | `[DOC] DELETE path={docPath} user={email\|apiKeyName} ip={ip}` |
  | 디렉토리 생성 | `[DOC] MKDIR path={dirPath} user={email\|apiKeyName} ip={ip}` |
  | 파일 업로드 | `[DOC] UPLOAD path={docPath} user={email\|apiKeyName} ip={ip} size={bytes}` |

- **출력**: 동일 로그 파일에 기록
- **우선순위**: P0

### FR-18-007: 활동 로그 — MCP 이벤트

- **설명**: MCP(Model Context Protocol) 도구 호출을 `.log` 파일에 기록
- **입력**: POST `/mcp` JSON-RPC 요청
- **처리**:

  | 이벤트 | 로그 형식 |
  |--------|----------|
  | 도구 호출 | `[MCP] TOOL={toolName} user={email\|apiKeyName} ip={ip} args={JSON요약}` |
  | 도구 에러 | `[MCP] TOOL={toolName} ERROR user={email\|apiKeyName} ip={ip} error={message}` |
  | 초기화 | `[MCP] INITIALIZE ip={ip}` |
  | 인증 실패 | `[MCP] AUTH_FAILED ip={ip} tool={toolName}` |

  현재 MCP 도구 목록 (전체 기록 대상):
  - `list_documents`, `list_full_tree`, `read_document`
  - `create_document`, `delete_document`
  - `DocuLight_get_config`, `DocuLight_search`, `query_document`
  - `summarize_document`, `DocuLight_smart_search`

- **출력**: 동일 로그 파일에 기록
- **우선순위**: P0

### FR-18-008: 활동 로그 — 관리 이벤트

- **설명**: 관리자 행위(사용자/그룹 관리, 설정 변경)를 `.log` 파일에 기록
- **입력**: Admin API 호출
- **처리**:

  | 이벤트 | 로그 형식 |
  |--------|----------|
  | 사용자 생성 | `[ADMIN] USER_CREATE email={email} group={group} by={adminEmail}` |
  | 사용자 수정 | `[ADMIN] USER_UPDATE email={email} changes={fields} by={adminEmail}` |
  | 사용자 삭제 | `[ADMIN] USER_DELETE email={email} by={adminEmail}` |
  | 그룹 생성 | `[ADMIN] GROUP_CREATE name={name} by={adminEmail}` |
  | 그룹 수정 | `[ADMIN] GROUP_UPDATE name={name} changes={fields} by={adminEmail}` |
  | 그룹 삭제 | `[ADMIN] GROUP_DELETE name={name} by={adminEmail}` |
  | 설정 변경 | `[ADMIN] SETTINGS_UPDATE section={section} changes={fields} by={adminEmail}` |
  | 관리자 로그인 | `[ADMIN] LOGIN ip={ip} method={apiKey\|session}` |

- **출력**: 동일 로그 파일에 기록
- **우선순위**: P1

---

## 3. 비기능 요구사항

### NFR-18-001: 로그 성능

- 로그 기록은 비동기(async)로 수행하여 요청 응답 시간에 영향 없음
- 로그 파일 I/O는 append 모드 사용 (전체 파일 재작성 금지)
- 로그 버퍼링: 즉시 flush 또는 최대 1초 이내 flush

### NFR-18-002: 로그 보존 정책

- 기존 `config.log.maxDays` 설정 재사용 (기본 30일)
- 날짜별 로그 파일 분리: `DocuLight-YYYYMMDD.log`
- 보존 기간 초과 로그 자동 삭제 (기존 cleanup 로직 활용)

### NFR-18-003: 로그 포맷 일관성

- 모든 로그 라인 형식: `[YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] [CATEGORY] MESSAGE`
- 예시: `[2026-03-11 14:30:22.456] [INFO] [AUTH] LOGIN email=user@example.com ip=192.168.1.1`
- 기존 request-logger 출력과 동일 파일에 통합

### NFR-18-004: 보안

- 로그에 패스워드, 세션 토큰, API 키 원문 기록 금지
- API 키는 앞 8자만 마스킹 표시: `key=a1b2c3d4...`
- 이메일은 전체 기록 (감사 추적 목적)

### NFR-18-005: 하위 호환성

- `signupMode` 미설정 시 기존 동작 유지 (`"approval"`)
- 기존 `allowSignup`, `allowedEmailDomains` 설정은 양 모드에서 동일하게 작동
- 기존 로그 형식은 유지되며 활동 로그가 추가로 기록됨

---

## 4. 데이터 요구사항

### DR-18-001: config.json5 auth 섹션 확장

```json5
auth: {
  requireReadLogin: false,       // 기존
  sessionTimeout: 3600000,       // 기존
  allowSignup: true,             // 기존
  allowedEmailDomains: [],       // 기존 — 양 모드 공통 적용
  signupMode: "approval",        // 신규: "approval" | "self"
  selfSignup: {                  // 신규
    defaultGroupName: "Viewer"   // 직접 가입 시 배정 그룹명
  }
}
```

### DR-18-002: 로그 파일 구조

- **경로**: `{config.log.dir}/DocuLight-YYYYMMDD.log`
- **인코딩**: UTF-8
- **라인 형식**: `[timestamp] [level] [category] message`
- **카테고리**: `AUTH`, `DOC`, `MCP`, `ADMIN`, `HTTP` (기존 request 로그)
- **회전**: 날짜별 자동 분리 (기존 logger 메커니즘 활용)

---

## 5. 인터페이스 요구사항

### IR-18-001: 설정 변경 API 확장

관리자 설정 페이지(`/admin`)에서 가입 모드 변경 가능:

- **엔드포인트**: 기존 auth settings API 재사용
- **필드 추가**: `signupMode`, `selfSignup.defaultGroupName`
- **UI**: 관리 패널 > 인증 설정 탭에 라디오 버튼 또는 select 추가

### IR-18-002: 가입 페이지 URL

- `GET /signup` — 가입 폼 렌더링
- `POST /api/auth/signup` — 가입 처리 (기존 엔드포인트 재사용, 모드에 따라 분기)
- 쿼리 파라미터: `?verified=true`, `?error=...` (기존 유지)

---

## 6. 제약사항

| 항목 | 제약 |
|------|------|
| 런타임 | Node.js (Express 기반) |
| 데이터 저장 | JSON 파일 기반 (RDBMS 없음) |
| 로그 저장 | 파일 시스템 `.log` 파일 (외부 수집 시스템 없음) |
| 기존 API | 하위 호환성 유지 필수 |
| 인증 | 세션 기반 (JWT 없음) |
| 비밀번호 | bcrypt cost 12 |

---

## 7. 인수 조건

### AC-18-001: 직접 가입 모드 동작

- **Given**: `config.json5`에 `auth.signupMode: "self"`, `auth.allowSignup: true`
- **When**: 사용자가 `/signup`에서 이메일, 패스워드, 패스워드 확인을 입력하고 제출
- **Then**:
  - 즉시 계정 생성 (userStore에 저장)
  - Viewer 그룹으로 배정
  - 자동 로그인 (세션 생성)
  - 메인 페이지로 리다이렉트
  - 활동 로그에 `[AUTH] SIGNUP_SELF` 기록

### AC-18-002: 승인 기반 가입 모드 동작

- **Given**: `config.json5`에 `auth.signupMode: "approval"` (또는 미설정)
- **When**: 사용자가 `/signup`에서 가입 폼 제출
- **Then**: 기존 Step 17 흐름 유지 (이메일 인증 → 관리자 승인 대기)

### AC-18-003: 이메일 도메인 제한 (직접 가입)

- **Given**: `auth.signupMode: "self"`, `auth.allowedEmailDomains: ["company.com"]`
- **When**: `user@other.com`으로 가입 시도
- **Then**: HTTP 400, `EMAIL_DOMAIN_NOT_ALLOWED` 에러

### AC-18-004: 로그인 활동 로그

- **Given**: 서버 실행 중
- **When**: 사용자가 로그인 성공
- **Then**: `logs/DocuLight-YYYYMMDD.log`에 `[AUTH] LOGIN email=... ip=...` 기록 확인

### AC-18-005: 문서 열람 활동 로그

- **Given**: 사용자가 로그인한 상태
- **When**: `/doc/guide/setup` 페이지 접속
- **Then**: 로그에 `[DOC] VIEW path=/guide/setup user=email ip=...` 기록

### AC-18-006: MCP 도구 활동 로그

- **Given**: MCP 클라이언트가 API 키로 인증
- **When**: `read_document` 도구 호출
- **Then**: 로그에 `[MCP] TOOL=read_document user=keyName ip=... args={path:...}` 기록

### AC-18-007: 관리 행위 활동 로그

- **Given**: 슈퍼유저가 관리 패널에서 작업
- **When**: 새 사용자 생성
- **Then**: 로그에 `[ADMIN] USER_CREATE email=... group=... by=adminEmail` 기록

### AC-18-008: 가입 비활성화

- **Given**: `auth.allowSignup: false`
- **When**: `/signup` 페이지 접근
- **Then**: 로그인 페이지로 리다이렉트, 가입 불가 안내 표시

---

## 구현 파일 영향 분석

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `src/utils/config-loader.js` | 수정 | `signupMode`, `selfSignup` 기본값 정규화 |
| `src/stores/auth-settings-store.js` | 수정 | 새 설정 필드 읽기/쓰기 |
| `src/controllers/auth-controller.js` | 수정 | `signup()` 함수에 모드 분기 추가 |
| `src/views/signup.ejs` | 수정 | 모드별 UI 분기, 직접 가입 시 자동 리다이렉트 |
| `config.example.json5` | 수정 | 새 설정 예시 추가 |
| `src/utils/activity-logger.js` | **신규** | 활동 로그 모듈 (카테고리별 로그 함수) |
| `src/middleware/activity-logger.js` | **신규** | Express 미들웨어 — 요청별 활동 자동 기록 |
| `src/routes/api.js` | 수정 | 문서 API에 활동 로그 호출 추가 |
| `src/routes/mcp.js` | 수정 | MCP 도구 호출에 활동 로그 추가 |
| `src/routes/admin-api.js` | 수정 | 관리 API에 활동 로그 추가 |
| `src/controllers/admin/admin-auth-settings-controller.js` | 수정 | 새 설정 필드 노출 |
| `public/js/admin.js` | 수정 | 인증 설정 UI에 가입 모드 옵션 추가 |

---

## 부록: 평가 결과

### 전문가 평가 요약 (초안)

| 기준 | 기술 아키텍트 | QA 전문가 | 비즈니스 분석가 |
|------|:----------:|:-------:|:------------:|
| 요구사항 완전성 | A | A | A+ |
| 구현 명확성 | A+ | A | A |
| 이전 버전 일관성 | A+ | A+ | A+ |
| 보안 적합성 | A | A+ | A |
| 테스트 가능성 | A | A+ | A |
| 확장성 | A+ | A | A |
| 사용자 경험 | A | A | A+ |

### 개선 포인트 (다음 라운드)
- 직접 가입 시 이메일 인증 선택 옵션 고려 (현재는 인증 없이 즉시 생성)
- 로그 검색/필터 API 추가 여부 (현재 범위 외)
- 대량 가입 방지를 위한 CAPTCHA 또는 rate-limit 강화 고려
