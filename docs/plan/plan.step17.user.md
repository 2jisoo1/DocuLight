# SRS: DocuLight Step 17 — 사용자 그룹 및 사용자 관리 시스템

## 메타데이터

- **버전**: step17
- **생성일**: 2026-03-07
- **이전 버전**: docs/plan/srs.md (기본 SRS)
- **평가 라운드**: 2회 (전문가 평가 반영)

---

## 1. 개요

### 1.1 목적

DocuLight에 **사용자 및 그룹 기반 인증·인가 시스템**을 도입한다.
기존 `config.json5`의 `apiKey`/`apiKeys` 기반 인증을 폐기하고, 이메일 기반 사용자 계정 + 그룹 권한 + 개인별 API Key(user-key) 체계로 전환한다.

### 1.2 범위

| 포함 | 제외 |
|------|------|
| 사용자 CRUD (생성/조회/수정/삭제) | OAuth/SSO 연동 |
| 그룹 CRUD 및 권한 관리 | 2FA (이중 인증) |
| 이메일 기반 가입 요청 + 승인 워크플로우 | LDAP/AD 연동 |
| 세션 기반 웹 인증 (로그인/로그아웃) | 외부 사용자 디렉토리 |
| user-key 기반 API/MCP 인증 | 감사 로그 (Audit Log) |
| 이메일 인증 및 알림 발송 | - |
| 최초 설정 마법사 (Initial Setup Wizard) | - |
| /admin UI 내 인증 설정 관리 | - |

### 1.3 이전 버전 대비 변경사항

| 항목 | Before (현재) | After (Step 17) |
|------|--------------|-----------------|
| 인증 방식 | `config.json5`의 `apiKey`/`apiKeys` | 사용자별 email + password (웹) / user-key (API·MCP) |
| 인가 모델 | API Key별 permissions 배열 | 그룹 기반 권한 (superuser/write/read) |
| 사용자 저장소 | 없음 | 로컬 JSON 파일 (`data/users.json`, `data/groups.json`) |
| 세션 관리 | API Key → in-memory 세션 | email+password → in-memory 세션 (기존 session-service 확장) |
| 설정 관리 | `config.json5`에서만 변경 | /admin UI에서 인증 설정 변경 가능 (파일 저장) |
| MCP 인증 | `X-API-Key` 헤더 (config의 apiKey) | `X-API-Key` 또는 `Authorization: Bearer` (user-key) |
| 가입 방식 | 없음 (API Key 직접 공유) | 가입 요청 → 이메일 인증 → 슈퍼유저 승인 |

### 1.4 용어 정의

| 용어 | 정의 |
|------|------|
| **슈퍼유저** | 모든 권한을 갖는 최고 관리자. 사용자/그룹 관리, 인증 설정 변경 가능 |
| **user-key** | 사용자별 자동 발급되는 API 인증 키. MCP 및 API 호출 시 사용 |
| **읽기 로그인** | 활성화 시 문서 열람을 포함한 모든 접근에 인증 필요 |
| **가입 대기** | 이메일 인증을 완료했으나 슈퍼유저 승인을 기다리는 상태 |
| **그룹** | 사용자에게 권한을 부여하는 단위. 사용자는 반드시 하나의 그룹에 소속 |

---

## 2. 기능 요구사항

### FR-17-001: 최초 설정 마법사 (Initial Setup Wizard)

- **설명**: 시스템에 사용자가 한 명도 없을 때, 어떤 경로로 접속하든 최초 관리자 계정 생성 페이지를 표시한다.
- **입력**:
  - 이메일 주소 (필수, 이메일 형식 검증)
  - 패스워드 (필수, 최소 8자, 영문+숫자+특수문자 조합 권장)
  - 패스워드 확인 (필수, 위와 일치)
- **처리**:
  1. 사용자 데이터 파일 존재 여부 확인
  2. 사용자가 0명이면 Setup Wizard 페이지 렌더링
  3. 입력값 검증 (이메일 형식, 패스워드 강도, 일치 여부)
  4. 기본 그룹 생성: `superuser` 그룹 (permissions: `["superuser", "write", "read"]`)
  5. 슈퍼유저 계정 생성: 입력된 이메일 + bcrypt 해시 패스워드
  6. user-key 자동 발급: `crypto.randomBytes(32).toString('hex')`
  7. 계정을 `superuser` 그룹에 소속
  8. 기본 인증 설정 파일 생성 (`auth-settings.json`)
- **출력**: 생성 완료 메시지 + /admin 로그인 페이지로 리다이렉트
- **예외**:
  - 이미 사용자가 존재하면 → 403 `SETUP_ALREADY_COMPLETE`
  - 이메일 형식 오류 → 400 `INVALID_EMAIL`
  - 패스워드 불일치 → 400 `PASSWORD_MISMATCH`
  - 패스워드 강도 부족 → 400 `WEAK_PASSWORD`
- **우선순위**: P0

### FR-17-002: 웹 로그인/로그아웃

- **설명**: 이메일 + 패스워드를 이용한 웹 기반 세션 인증. 기존 API Key 기반 로그인을 대체한다.
- **입력**:
  - 이메일 주소 (필수)
  - 패스워드 (필수)
- **처리**:
  1. 이메일로 사용자 조회
  2. bcrypt로 패스워드 해시 비교
  3. 사용자 상태 확인 (활성 상태인지)
  4. 사용자 소속 그룹의 권한 조회
  5. 세션 생성 (기존 `session-service.js` 확장)
     - 세션 데이터: `{ token, userId, email, groupId, permissions, createdAt, expiresAt }`
  6. httpOnly 쿠키로 세션 토큰 설정 (`doclight_admin_session`)
  7. 마지막 로그인 시각 업데이트
- **출력**: `{ success: true, session: { email, permissions, expiresAt } }`
- **로그아웃**: 세션 무효화 + 쿠키 삭제
- **예외**:
  - 사용자 미존재 → 401 `INVALID_CREDENTIALS` (이메일/패스워드 구분하지 않음 — 보안)
  - 패스워드 불일치 → 401 `INVALID_CREDENTIALS`
  - 비활성 계정 → 401 `ACCOUNT_DISABLED`
  - 로그인 실패 연속 5회 → 429 `TOO_MANY_ATTEMPTS` (15분 잠금)
- **우선순위**: P0

### FR-17-003: 로그인 필요 판단 로직

- **설명**: 요청 경로와 인증 설정에 따라 로그인 필요 여부를 결정한다.
- **처리 로직**:

```
IF 사용자 0명 (Setup 미완료):
    → Setup Wizard 표시 (모든 경로)

IF 인증 설정 로드:
    auth = auth-settings.json 읽기

IF 요청 경로 == /admin/* (사용자/그룹 관리, 인증 설정, 가입 대기):
    → 항상 로그인 필요 + superuser 권한 필요 → 없으면 403

IF 요청 경로 == /admin/* (파일 편집, 업로드, 삭제 등 문서 작업):
    → 항상 로그인 필요 + write 이상 권한 필요
    → read 전용 사용자: /admin 접속 시 "내 정보" 탭만 표시, 문서 작업 탭 숨김
    → write 사용자: 문서 작업 탭 + 내 정보 탭 표시, 사용자/그룹 관리 탭 숨김
    → superuser: 모든 탭 표시

IF auth.requireReadLogin == true:
    → 모든 경로에서 로그인 필요
    → API/MCP: X-API-Key 또는 Authorization: Bearer 필요
    → 웹: 세션 쿠키 필요 (없으면 로그인 페이지로 리다이렉트)

IF auth.requireReadLogin == false:
    → 읽기 경로 (GET /api/tree, /api/raw, /doc/*, /): 인증 불필요
    → 쓰기 경로 (POST /api/upload, DELETE /api/entry 등): user-key 필요
    → MCP 읽기 도구: 인증 불필요
    → MCP 쓰기 도구 (create_document, delete_document): user-key 필요
```

- **우선순위**: P0

### FR-17-004: 그룹 관리 (CRUD)

- **설명**: 슈퍼유저가 사용자 그룹을 생성·조회·수정·삭제할 수 있다.
- **그룹 데이터 모델**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string (UUID) | O | 그룹 고유 식별자 |
| `name` | string | O | 그룹 이름 (고유) |
| `permissions` | string[] | O | 권한 목록 |
| `isSystem` | boolean | O | 시스템 기본 그룹 여부 (삭제 불가) |
| `createdAt` | ISO 8601 | O | 생성 시각 |
| `updatedAt` | ISO 8601 | O | 수정 시각 |

- **권한 종류**:

| 권한 | 설명 | 포함 권한 |
|------|------|----------|
| `superuser` | 모든 권한 + 사용자/그룹 관리 + 인증 설정 | write, read |
| `write` | 문서 생성/수정/삭제/업로드 + 읽기 | read |
| `read` | 문서 열람만 가능 | - |

- **기존 권한 모델과의 매핑** (Critical — 하위 호환):

| 기존 권한 | 새 권한 | 설명 |
|----------|---------|------|
| `read` | `read` | 동일 |
| `write` | `write` | 동일 |
| `delete` | `write` | `write`에 흡수. 삭제는 쓰기의 부분 집합으로 취급 |
| (해당 없음) | `superuser` | 신규. 사용자/그룹 관리 + 인증 설정 변경 |

> **구현 참고**: 기존 `requirePermission('delete')` 호출부(`admin-api.js:241` 등)는 모두 `requirePermission('write')`로 교체한다. 기존 `config.json5`의 `apiKeys[].permissions`에 `delete`가 포함된 경우, 마이그레이션 시 `write`로 자동 변환한다.

- **기본 그룹** (시스템 생성, 삭제 불가):

| 이름 | 권한 | 용도 |
|------|------|------|
| `Superuser` | `["superuser", "write", "read"]` | 최고 관리자 |
| `Editor` | `["write", "read"]` | 문서 편집자 |
| `Viewer` | `["read"]` | 문서 열람자 |

- **처리**:
  - **생성**: 그룹 이름 중복 확인 → UUID 생성 → 저장
  - **수정**: 그룹 이름/권한 변경 (시스템 그룹의 권한은 변경 불가)
  - **삭제**: 소속 사용자가 0명인 경우에만 삭제 가능. 시스템 그룹은 삭제 불가
  - **조회**: 그룹 목록 + 소속 사용자 수 반환
- **예외**:
  - 중복 이름 → 409 `GROUP_NAME_DUPLICATE`
  - 시스템 그룹 삭제 시도 → 403 `SYSTEM_GROUP_PROTECTED`
  - 소속 사용자 존재 시 삭제 → 409 `GROUP_HAS_MEMBERS`
  - 유효하지 않은 권한값 → 400 `INVALID_PERMISSION`
- **우선순위**: P0

### FR-17-005: 사용자 관리 (CRUD)

- **설명**: 슈퍼유저가 사용자를 직접 추가·조회·수정·삭제할 수 있다.
- **사용자 데이터 모델**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string (UUID) | O | 사용자 고유 식별자 |
| `email` | string | O | 이메일 주소 (로그인 ID, 고유) |
| `passwordHash` | string | O | bcrypt 해시 (cost factor 12) |
| `groupId` | string (UUID) | O | 소속 그룹 ID (1개만) |
| `userKeyHash` | string | O | API/MCP 인증 키의 SHA-256 해시 |
| `status` | enum | O | `active` / `disabled` |
| `lastLoginAt` | ISO 8601 | - | 마지막 로그인 시각 |
| `failedLoginCount` | number | O | 연속 로그인 실패 횟수 (기본값: 0) |
| `lockedUntil` | ISO 8601 | - | 계정 잠금 해제 시각 |
| `createdAt` | ISO 8601 | O | 생성 시각 |
| `updatedAt` | ISO 8601 | O | 수정 시각 |

- **처리**:
  - **추가**: 슈퍼유저가 이메일 + 패스워드 + 그룹 지정 → 계정 생성 + user-key 자동 발급
  - **조회**: 사용자 목록 (이메일, 그룹명, 상태, 마지막 로그인)
  - **수정**: 그룹 변경, 상태 변경 (활성/비활성), 패스워드 리셋
  - **삭제**: 사용자 삭제 (슈퍼유저는 자기 자신을 삭제할 수 없음. 슈퍼유저가 최소 1명은 존재해야 함)
  - **사용자 비활성화**: `status`를 `disabled`로 변경. 해당 사용자의 모든 활성 세션 즉시 무효화
- **패스워드 리셋** (슈퍼유저가 다른 사용자에 대해):
  - 슈퍼유저가 새 패스워드를 직접 지정 → bcrypt 해시 저장
  - 대상 사용자의 로그인 실패 카운터 리셋, 잠금 해제
  - 이메일 발송 없음 (슈퍼유저가 직접 전달)
- **패스워드 변경** (로그인한 사용자 본인):
  - 현재 패스워드 확인 → 새 패스워드 → bcrypt 해시 저장
- **마지막 슈퍼유저 보호** (삭제·강등·비활성화 모두 방지):
  - 슈퍼유저 그룹 소속 사용자가 1명만 남은 경우, 해당 사용자에 대해:
    - 삭제 불가
    - 다른 그룹으로 변경(강등) 불가
    - 비활성화(disabled) 불가
  - 이 보호는 어떤 슈퍼유저가 요청하든 적용 (자기 자신 포함)
- **이메일 정규화**:
  - 이메일 비교 시 항상 소문자로 변환 (`toLowerCase()`)
  - 저장 시에도 소문자로 정규화
- **예외**:
  - 이메일 중복 → 409 `EMAIL_DUPLICATE`
  - 존재하지 않는 그룹 → 404 `GROUP_NOT_FOUND`
  - 마지막 슈퍼유저 삭제 시도 → 403 `LAST_SUPERUSER_PROTECTED`
  - 마지막 슈퍼유저 강등 시도 → 403 `LAST_SUPERUSER_PROTECTED`
  - 마지막 슈퍼유저 비활성화 시도 → 403 `LAST_SUPERUSER_PROTECTED`
  - 자기 자신 삭제 → 403 `CANNOT_DELETE_SELF`
- **우선순위**: P0

### FR-17-006: User-Key 관리

- **설명**: 각 사용자에게 자동 발급되는 API 인증 키를 관리한다.
- **처리**:
  - **자동 발급**: 사용자 생성 시 `crypto.randomBytes(32).toString('hex')` 로 64자 hex 문자열 생성
  - **조회**: 로그인한 사용자가 "내 정보" 페이지에서 자신의 user-key를 확인
  - **재발급**: "재발급" 버튼 클릭 시 새 키 생성, 기존 키 즉시 무효화
  - **추가 발급 불가**: 사용자당 항상 1개만 존재
- **API/MCP 인증 흐름**:
  1. 클라이언트가 `X-API-Key: <user-key>` 또는 `Authorization: Bearer <user-key>` 헤더 전송
  2. 서버가 user-key로 사용자 조회
  3. 사용자의 그룹 권한 확인
  4. 요청된 작업에 필요한 권한 보유 여부 검증
- **예외**:
  - 유효하지 않은 user-key → 401 `INVALID_API_KEY`
  - 비활성 계정의 user-key → 401 `ACCOUNT_DISABLED`
  - 권한 부족 → 403 `INSUFFICIENT_PERMISSION`
- **우선순위**: P0

### FR-17-007: 가입 요청 워크플로우

- **설명**: 사용자가 직접 가입을 요청하고, 이메일 인증 후 슈퍼유저가 승인하는 절차.
- **가입 대기 데이터 모델**:

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `id` | string (UUID) | O | 요청 고유 식별자 |
| `email` | string | O | 이메일 주소 |
| `passwordHash` | string | O | bcrypt 해시 |
| `message` | string | O | 가입 요청 메시지 |
| `verificationToken` | string | O | 이메일 인증 토큰 (64자 hex) |
| `verifiedAt` | ISO 8601 | - | 이메일 인증 완료 시각 |
| `status` | enum | O | `pending_verification` / `pending_approval` / `approved` / `rejected` / `expired` |
| `reviewedBy` | string | - | 승인/거절한 슈퍼유저 ID |
| `reviewedAt` | ISO 8601 | - | 승인/거절 시각 |
| `assignedGroupId` | string | - | 승인 시 부여될 그룹 ID |
| `createdAt` | ISO 8601 | O | 요청 시각 |
| `expiresAt` | ISO 8601 | O | 인증 토큰 만료 시각 (24시간) |

- **처리 흐름**:

```
[사용자] 가입 요청 폼 작성 (이메일, 패스워드, 메시지)
    ↓
[서버] 이메일 형식 검증 + 도메인 허용 목록 확인
    ↓
[서버] 이메일 중복 확인 (기존 사용자 + 대기 목록)
    ↓
[서버] 인증 토큰 생성 + 가입 요청 저장 (status: pending_verification)
    ↓
[서버] 인증 이메일 발송 (인증 링크 포함)
    ↓
[사용자] 이메일 인증 링크 클릭
    ↓
[서버] 토큰 검증 + 만료 확인 → status: pending_approval
    ↓
[슈퍼유저] /admin에서 가입 대기 목록 확인
    ↓
[슈퍼유저] 승인 (그룹 부여) 또는 거절
    ↓ (승인 시)
[서버] 사용자 계정 생성 + user-key 발급 + 승인 알림 메일 발송
    ↓ (거절 시)
[서버] 거절 알림 메일 발송 + 대기 데이터 보존 (기록용)
```

- **예외**:
  - 허용되지 않은 이메일 도메인 → 400 `EMAIL_DOMAIN_NOT_ALLOWED`
  - 이미 가입된 이메일 → 409 `EMAIL_ALREADY_REGISTERED`
  - 이미 대기 중인 이메일 → 409 `EMAIL_ALREADY_PENDING`
  - 인증 토큰 만료 → 410 `VERIFICATION_TOKEN_EXPIRED`
  - 유효하지 않은 인증 토큰 → 400 `INVALID_VERIFICATION_TOKEN`
- **우선순위**: P1

### FR-17-008: 이메일 발송 서비스

- **설명**: 가입 인증, 승인/거절 알림 등 이메일 발송을 담당한다.
- **config.json5 설정**:

```json5
{
  // SMTP 이메일 설정
  email: {
    // SMTP 서버 주소
    host: "smtp.example.com",
    // SMTP 포트 (587: STARTTLS, 465: SSL, 25: 비암호화)
    port: 587,
    // 암호화 방식: true = TLS/SSL 직접 연결 (465), false = STARTTLS (587)
    secure: false,
    // SMTP 인증 정보
    auth: {
      user: "noreply@example.com",
      pass: "smtp-password"
    },
    // 발신자 표시 이름 및 주소
    from: "DocuLight <noreply@example.com>"
  }
}
```

- **이메일 종류**:

| 종류 | 수신자 | 내용 |
|------|--------|------|
| 가입 인증 | 가입 요청자 | 인증 링크 (24시간 유효) |
| 가입 승인 | 가입 요청자 | 계정 생성 완료 알림, 로그인 안내 |
| 가입 거절 | 가입 요청자 | 거절 안내 |

- **예외**:
  - 이메일 서버 미설정 시 가입 요청 기능 비활성화 (슈퍼유저 직접 추가만 가능)
  - SMTP 연결 실패 → 503 `EMAIL_SERVICE_UNAVAILABLE`
  - 발송 실패 → 로그 기록 + 재시도 1회. 재시도도 실패 시 가입 요청은 `pending_verification` 상태로 유지 (사용자에게 "인증 이메일을 받지 못한 경우 다시 시도해주세요" 안내)
  - 파일 쓰기 실패 (디스크 공간 등) → 500 `INTERNAL_ERROR` + 에러 로그
- **우선순위**: P1

### FR-17-009: 인증 설정 관리 (Admin UI)

- **설명**: 슈퍼유저가 /admin 페이지에서 인증 관련 설정을 변경할 수 있다. 변경된 설정은 `data/auth-settings.json`에 저장된다.
- **설정 항목**:

| 설정 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `requireReadLogin` | boolean | `false` | true: 모든 접근에 인증 필요. false: 읽기는 공개 |
| `sessionTimeout` | number (ms) | `3600000` (1시간) | 세션 만료 시간 (최소 60000ms) |
| `allowSignup` | boolean | `true` | 가입 요청 기능 활성화 여부 |
| `allowedEmailDomains` | string[] | `[]` | 가입 허용 이메일 도메인 (빈 배열: 모든 도메인 허용) |

- **설정 로드 우선순위**:
  1. `data/auth-settings.json` (런타임 설정, 최우선)
  2. 기본값 (위 테이블의 기본값)
- **처리**:
  - **읽기**: `GET /api/admin/auth-settings` (슈퍼유저만)
  - **수정**: `PUT /api/admin/auth-settings` (슈퍼유저만)
  - 변경 시 즉시 적용 (서버 재시작 불필요)
- **예외**:
  - 슈퍼유저가 아닌 사용자의 접근 → 403 `SUPERUSER_REQUIRED`
  - 유효하지 않은 설정값 → 400 `INVALID_SETTING_VALUE`
- **우선순위**: P0

### FR-17-010: 내 정보 페이지

- **설명**: 로그인한 사용자가 자신의 계정 정보를 확인하고 관리한다.
- **표시 정보**:
  - 이메일 주소
  - 소속 그룹명 및 권한
  - user-key (마스킹 표시, "보기" 버튼으로 전체 표시)
  - 마지막 로그인 시각
- **가능한 작업**:
  - 패스워드 변경 (현재 패스워드 + 새 패스워드 + 확인)
  - user-key 재발급 ("재발급" 버튼 + 확인 다이얼로그)
- **우선순위**: P1

### FR-17-011: 가입 요청 UI

- **설명**: 로그인 페이지에 "가입 요청" 버튼을 추가. 이메일 서버 미설정 또는 `allowSignup = false` 시 버튼 숨김.
- **입력 필드**:
  - 이메일 주소 (필수)
  - 패스워드 (필수, 최소 8자)
  - 패스워드 확인 (필수)
  - 가입 요청 메시지 (필수, 최소 10자, 최대 500자)
- **처리**: FR-17-007 워크플로우 호출
- **우선순위**: P1

### FR-17-012: 긴급 복구 — CLI 패스워드 리셋

- **설명**: 유일한 슈퍼유저가 패스워드를 분실한 경우, CLI 유틸리티로 패스워드를 리셋할 수 있다.
- **사용법**: `node scripts/reset-admin.js --email admin@example.com --password newPassword123!`
- **처리**:
  1. `dataDir`의 `users.json`에서 이메일로 사용자 조회
  2. 해당 사용자가 슈퍼유저 그룹 소속인지 확인
  3. 새 패스워드를 bcrypt 해시로 저장
  4. 로그인 실패 카운터 리셋 + 잠금 해제
  5. 성공 메시지 출력
- **보안**: 서버 파일 시스템에 직접 접근 가능한 관리자만 실행 가능
- **예외**:
  - 사용자 미존재 → 에러 메시지 + 종료
  - data 파일 없음 → 에러 메시지 (Setup 미완료 안내)
- **우선순위**: P1

### FR-17-013: 비밀번호 분실 안내

- **설명**: 로그인 페이지에 "비밀번호를 잊으셨나요?" 링크를 표시한다. 클릭 시 "관리자에게 문의하세요" 안내 메시지와 함께 슈퍼유저 연락 정보(이메일 서버 설정의 from 주소)를 표시한다.
- **처리**: 별도 페이지 없이 로그인 페이지 내 안내 텍스트로 처리
- **우선순위**: P2

---

## 3. 비기능 요구사항

### NFR-17-001: 보안 — 패스워드 저장

- bcrypt 해시, cost factor 12
- 평문 패스워드는 메모리에서 즉시 제거 (변수 덮어쓰기)
- 패스워드 최소 8자, 최대 128자

### NFR-17-002: 보안 — 세션 관리

- 세션 토큰: `crypto.randomBytes(32).toString('hex')` (64자 hex)
- httpOnly, SameSite=Strict 쿠키 속성 (기존 코드와 일치, 보안 강화)
- SSL 활성화 시 Secure 쿠키 플래그 추가
- 세션 고정 공격 방지: 로그인 성공 시 새 세션 토큰 발급
- 만료된 세션 자동 정리 (기존 1분 주기 유지)
- **세션 갱신(refresh)**: 현재 시각 기준으로 `sessionTimeout`만큼 만료 시간 재설정 (기존 만료 시간과 무관하게 현재 시각 + timeout). 갱신 횟수 제한 없음 (타임아웃 내에서만 갱신 가능)
- **강제 로그아웃**: 사용자 비활성화 시 해당 사용자의 모든 세션을 즉시 무효화 (userId 기반 일괄 삭제)

### NFR-17-003: 보안 — 브루트포스 방어

- 로그인 실패 5회 연속 시 15분 계정 잠금
- 잠금 해제 후 실패 카운터 리셋
- 슈퍼유저는 /admin에서 수동 잠금 해제 가능
- 잠금 상태에서도 동일한 에러 메시지 반환 (타이밍 공격 방지)

### NFR-17-004: 보안 — API Key (user-key)

- 64자 hex (256bit 엔트로피), `crypto.randomBytes(32)`
- 타이밍 안전 비교: `crypto.timingSafeEqual()` 사용
- **저장 방식**: user-key의 SHA-256 해시를 `users.json`에 저장. 원본은 사용자에게 한 번만 표시
  - 인증 시: 요청의 user-key를 SHA-256 해싱 → 저장된 해시와 비교
  - in-memory 캐시: `Map<hashedKey, userId>` 구조로 O(1) 조회
  - 재발급 시: 새 키의 원본을 응답에 포함, 해시만 저장
- **데이터 파일 보안**: `data/` 디렉토리 파일 퍼미션 0600 적용 (소유자만 읽기/쓰기). Windows 환경에서는 ACL로 동등 보호
- user-key 재발급 시 기존 키로 인증된 모든 세션/요청 즉시 무효화

### NFR-17-005: 보안 — 이메일 인증

- 인증 토큰: `crypto.randomBytes(32).toString('hex')`
- 유효 기간: 24시간
- 1회 사용 후 즉시 무효화
- 인증 토큰 만료 시 가입 요청 데이터 보존 (재요청 가능)
- **가입 거절 후 재요청**: 거절된(`rejected`) 가입 요청은 동일 이메일로 재요청 가능. 기존 거절 기록은 보존하고 새 레코드를 생성
- **만료 토큰 재요청**: 인증 토큰 만료 시 동일 이메일로 새 가입 요청 가능. 기존 만료 레코드의 status를 `expired`로 변경 후 새 레코드 생성

### NFR-17-006: 보안 — CSRF 방지

- 상태 변경 API (POST/PUT/DELETE)에 대해:
  - API/MCP: 헤더 기반 인증으로 CSRF 면역
  - 웹 UI: 기존 세션 쿠키 + 동일 출처 정책(SameSite)으로 방어

### NFR-17-007: 보안 — Rate Limiting

- 가입 요청: 동일 IP에서 5분에 3회까지
- 이메일 인증 요청: 동일 이메일에 1시간에 3회까지
- 로그인 시도: 동일 IP에서 1분에 10회까지
- **구현**: `express-rate-limit` 미들웨어 사용 (in-memory 저장, 서버 재시작 시 리셋)
- 초과 시 응답: 429 `TOO_MANY_REQUESTS` + `Retry-After` 헤더

### NFR-17-008: 성능 및 캐시

- 사용자 데이터 파일 크기: 1,000명 사용자 기준 약 500KB 이하
- 파일 저장 시 원자적 쓰기 (임시 파일 → rename) 적용
- **in-memory 캐시 전략**:
  - 서버 시작 시 `users.json`, `groups.json` 전체를 메모리에 로드
  - `Map<hashedUserKey, userId>` 인덱스로 user-key 기반 O(1) 조회
  - `Map<email, userId>` 인덱스로 로그인 시 O(1) 조회
  - 사용자 CRUD 작업 시 파일 쓰기 + 메모리 캐시 동기적 갱신
  - **단일 프로세스 제약**: PM2 cluster mode 미지원. PM2 fork mode(단일 인스턴스)만 지원. 다중 프로세스 필요 시 향후 파일 변경 감지(chokidar) 기반 캐시 갱신으로 확장 가능
- **pending-registrations 정리 정책**:
  - 세션 cleanup 타이머(기존 1분 주기)에 함께 실행
  - 인증 토큰 만료 후 7일 경과한 `pending_verification` 레코드 자동 삭제
  - `approved`/`rejected` 상태의 레코드: 30일 경과 후 자동 삭제
  - `expired` 상태의 레코드: 7일 경과 후 자동 삭제
- **확장성 한계 인지**: JSON 파일 전체 로드/저장 방식은 1,000명 이하에서 적합. 대규모 환경 전환 시 SQLite 등으로 마이그레이션 가능하도록 데이터 액세스 계층을 서비스로 분리

### NFR-17-009: 호환성

- `config.json5`의 기존 `apiKey`/`apiKeys` 필드:
  - **마이그레이션 지원**: 기존 apiKey/apiKeys가 있고 사용자 데이터가 없는 경우, 최초 설정 마법사에서 기존 API Key를 입력하여 검증 후 슈퍼유저 생성 가능 (마이그레이션 경로)
  - **apiKeys 배열 마이그레이션**: 기존 `apiKeys[].permissions`의 `delete` 권한은 `write`로 자동 매핑. 이름과 권한 정보는 마이그레이션 로그에 기록
  - **폐기 경고**: 서버 시작 시 `apiKey`/`apiKeys` 필드가 존재하면 콘솔 경고 메시지 출력
  - **향후 제거**: 다음 메이저 버전에서 완전 제거 예정
  - **배포 전환**: Step 17 배포 시 기존 in-memory 세션은 모두 초기화됨 (서버 재시작). 기존 API Key로 생성된 세션은 자동 소멸
- **admin.sessionTimeout 마이그레이션**: config.json5의 `admin.sessionTimeout`이 존재하고 `auth-settings.json`이 없으면, 초기 `auth-settings.json` 생성 시 해당 값을 `sessionTimeout`으로 이관

---

## 4. 데이터 요구사항

### DR-17-001: 파일 저장소 구조

```
{docsRoot}/../data/         ← docsRoot와 같은 레벨의 data 디렉토리
  또는
{projectRoot}/data/         ← 프로젝트 루트의 data 디렉토리

  users.json                ← 사용자 목록
  groups.json               ← 그룹 목록
  pending-registrations.json ← 가입 대기 목록
  auth-settings.json        ← 인증 설정 (런타임)
```

> **경로 결정**: `config.json5`에 `dataDir` 설정 추가. 기본값: `"./data"` (프로젝트 루트 기준 상대 경로)
> **자동 생성**: 서버 시작 시 `dataDir` 경로가 존재하지 않으면 자동 생성. 파일 퍼미션 0700 적용

### DR-17-002: users.json 스키마

```json
{
  "version": 1,
  "updatedAt": "2026-03-07T00:00:00.000Z",
  "users": [
    {
      "id": "uuid-v4",
      "email": "admin@example.com",
      "passwordHash": "$2b$12$...",
      "groupId": "uuid-of-superuser-group",
      "userKeyHash": "sha256-hex-of-user-key",
      "status": "active",
      "lastLoginAt": "2026-03-07T00:00:00.000Z",
      "failedLoginCount": 0,
      "lockedUntil": null,
      "createdAt": "2026-03-07T00:00:00.000Z",
      "updatedAt": "2026-03-07T00:00:00.000Z"
    }
  ]
}
```

### DR-17-003: groups.json 스키마

```json
{
  "version": 1,
  "updatedAt": "2026-03-07T00:00:00.000Z",
  "groups": [
    {
      "id": "uuid-v4",
      "name": "Superuser",
      "permissions": ["superuser", "write", "read"],
      "isSystem": true,
      "createdAt": "2026-03-07T00:00:00.000Z",
      "updatedAt": "2026-03-07T00:00:00.000Z"
    }
  ]
}
```

### DR-17-004: pending-registrations.json 스키마

```json
{
  "version": 1,
  "registrations": [
    {
      "id": "uuid-v4",
      "email": "user@example.com",
      "passwordHash": "$2b$12$...",
      "message": "가입 요청 메시지",
      "verificationToken": "64-char-hex-hashed",
      "verifiedAt": null,
      "status": "pending_verification",
      "reviewedBy": null,
      "reviewedAt": null,
      "assignedGroupId": null,
      "createdAt": "2026-03-07T00:00:00.000Z",
      "expiresAt": "2026-03-08T00:00:00.000Z"
    }
  ]
}
```

### DR-17-005: auth-settings.json 스키마

```json
{
  "version": 1,
  "requireReadLogin": false,
  "sessionTimeout": 3600000,
  "allowSignup": true,
  "allowedEmailDomains": [],
  "updatedAt": "2026-03-07T00:00:00.000Z",
  "updatedBy": "admin-user-id"
}
```

### DR-17-006: 데이터 무결성 및 백업

- 모든 JSON 파일은 `version` 필드로 스키마 버전 관리
- 파일 쓰기 시 원자적 쓰기 (write to temp → rename) 적용
- 파일 읽기 실패 시: 파일이 존재하지 않으면 빈 기본값으로 초기화. 파일이 존재하지만 파싱 실패(손상)이면 에러 로그 + 서버 시작 실패 (데이터 유실 방지)
- `async-lock`을 사용하여 동시 쓰기 방지 (기존 lock-manager.js 활용)
- **자동 백업**: `users.json` 쓰기 시 이전 버전을 `users.json.bak`으로 자동 백업 (최근 1개만 유지)

---

## 5. 인터페이스 요구사항

### IR-17-001: 새 API 엔드포인트

#### 인증 (Public — 로그인 불필요)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/login` | 이메일+패스워드 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/session` | 현재 세션 정보 |
| POST | `/api/auth/session/refresh` | 세션 갱신 |
| POST | `/api/auth/signup` | 가입 요청 |
| GET | `/api/auth/verify/:token` | 이메일 인증 |

#### 사용자 관리 (슈퍼유저 전용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/users` | 사용자 목록 조회 |
| POST | `/api/admin/users` | 사용자 직접 추가 |
| PUT | `/api/admin/users/:id` | 사용자 정보 수정 |
| DELETE | `/api/admin/users/:id` | 사용자 삭제 |
| POST | `/api/admin/users/:id/reset-password` | 패스워드 리셋 |
| POST | `/api/admin/users/:id/unlock` | 계정 잠금 해제 |

#### 그룹 관리 (슈퍼유저 전용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/groups` | 그룹 목록 조회 |
| POST | `/api/admin/groups` | 그룹 생성 |
| PUT | `/api/admin/groups/:id` | 그룹 수정 |
| DELETE | `/api/admin/groups/:id` | 그룹 삭제 |

#### 가입 대기 관리 (슈퍼유저 전용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/registrations` | 가입 대기 목록 |
| POST | `/api/admin/registrations/:id/approve` | 가입 승인 (body: `{ groupId }`) |
| POST | `/api/admin/registrations/:id/reject` | 가입 거절 |

#### 인증 설정 (슈퍼유저 전용)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/admin/auth-settings` | 인증 설정 조회 |
| PUT | `/api/admin/auth-settings` | 인증 설정 변경 |

#### 내 정보 (로그인 사용자)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/auth/me` | 내 정보 조회 (user-key 포함) |
| PUT | `/api/auth/me/password` | 패스워드 변경 |
| POST | `/api/auth/me/regenerate-key` | user-key 재발급 |

### IR-17-002: 기존 API 변경사항

| 기존 엔드포인트 | 변경 내용 |
|----------------|-----------|
| `POST /api/admin/auth` | **폐기** → `POST /api/auth/login`으로 대체 |
| `POST /api/admin/logout` | **폐기** → `POST /api/auth/logout`으로 대체 |
| `GET /api/admin/session` | **폐기** → `GET /api/auth/session`으로 대체 |
| `POST /api/admin/session/refresh` | **폐기** → `POST /api/auth/session/refresh`로 대체 |
| 기존 admin 파일 작업 API | 인증 방식만 변경 (API Key → 세션/user-key) |
| `GET /api/tree`, `GET /api/raw` | `requireReadLogin` 시 인증 추가 |
| `POST /api/upload`, `DELETE /api/entry` | API Key 인증 → user-key 인증으로 변경 |
| MCP `create_document`, `delete_document` | API Key 인증 → user-key 인증으로 변경 |

### IR-17-003: 기존 인증 미들웨어 변경

| 파일 | 변경 내용 |
|------|-----------|
| `src/middleware/auth.js` | config.apiKey 비교 → user-key 조회 + 그룹 권한 확인으로 변경 |
| `src/middleware/admin-auth.js` | API Key 세션 → email/password 세션으로 변경 |
| `src/services/session-service.js` | 세션 데이터에 userId, email, groupId, permissions 추가 |
| `src/routes/mcp.js` (validateApiKey) | config.apiKey 비교 → user-key 조회로 변경 |

### IR-17-004: 웹 페이지

| 페이지 | URL | 설명 |
|--------|-----|------|
| Setup Wizard | `/setup` | 최초 관리자 생성 (사용자 0명일 때만 접근 가능) |
| 로그인 | `/login` | 이메일 + 패스워드 로그인 + 가입 요청 버튼 |
| 가입 요청 | `/signup` | 가입 요청 폼 |
| 이메일 인증 결과 | `/verify/:token` | 인증 성공/실패 메시지 |
| /admin 사용자 관리 | `/admin` (탭) | 사용자 목록, 추가, 수정, 삭제 |
| /admin 그룹 관리 | `/admin` (탭) | 그룹 목록, 추가, 수정, 삭제 |
| /admin 가입 대기 | `/admin` (탭) | 대기 목록, 승인/거절 |
| /admin 인증 설정 | `/admin` (탭) | 읽기 로그인, 세션 타임아웃 등 |
| 내 정보 | `/admin` (메뉴) | 내 정보, 패스워드 변경, user-key |

### IR-17-005: config.json5 변경

```json5
{
  // [폐기 예정] 기존 API Key 설정
  // apiKey: "...",        ← 제거 (마이그레이션 후)
  // apiKeys: [...],       ← 제거 (마이그레이션 후)

  // [신규] 사용자 데이터 디렉토리
  dataDir: "./data",

  // [신규] SMTP 이메일 설정 (가입 요청 기능 사용 시 필수)
  // email: {
  //   host: "smtp.example.com",
  //   port: 587,
  //   secure: false,
  //   auth: {
  //     user: "noreply@example.com",
  //     pass: "smtp-password"
  //   },
  //   from: "DocuLight <noreply@example.com>"
  // },

  // [기존 admin 섹션 변경]
  // admin.sessionTimeout → auth-settings.json으로 이동 (런타임 설정)
  // admin 섹션의 나머지 설정(allowUpload, allowDelete 등)은 유지
}
```

---

## 6. 제약사항

### 기술 제약

| 항목 | 제약 |
|------|------|
| 저장소 | DB 사용 불가. 로컬 JSON 파일만 사용 |
| 사용자 ID | 이메일 주소만 지원 (고유 식별자) |
| 그룹 소속 | 사용자당 1개 그룹만 소속 가능 |
| user-key | 사용자당 1개만 발급, 추가 발급 불가 |
| 패스워드 | 최소 8자, 최대 128자 |
| 이메일 인증 토큰 | 24시간 유효 |
| 세션 | in-memory (서버 재시작 시 모든 세션 초기화) |

### 런타임 환경

| 항목 | 요구사항 |
|------|---------|
| Node.js | 18+ (기존과 동일) |
| 추가 의존성 | `bcrypt` (패스워드 해싱), `nodemailer` (이메일 발송), `uuid` (UUID 생성), `express-rate-limit` (Rate Limiting) |
| 기존 의존성 활용 | `async-lock` (파일 쓰기 동시성), `crypto` (토큰 생성, 내장 모듈) |

### 하위 호환성

| 항목 | 처리 방식 |
|------|-----------|
| 기존 `apiKey` | 서버 시작 시 경고 출력. 사용자 데이터 없으면 마이그레이션 안내 |
| 기존 `/api/admin/auth` | 폐기 라우트로 등록, 새 엔드포인트 안내 메시지 반환 |
| 기존 MCP `X-API-Key` | user-key를 `X-API-Key` 헤더로 전송 가능 (호환 유지) |

---

## 7. 인수 조건

### AC-17-001: 최초 설정 마법사

- **Given**: 사용자 데이터 파일이 없거나 사용자가 0명
- **When**: 어떤 경로로든 서버에 접속
- **Then**: Setup Wizard 페이지가 표시되고, 이메일+패스워드 입력 후 슈퍼유저 계정 생성

### AC-17-002: 웹 로그인

- **Given**: 슈퍼유저 계정이 존재
- **When**: /admin 접속 시 이메일+패스워드 입력
- **Then**: 세션 생성, 쿠키 설정, /admin 대시보드 표시

### AC-17-003: 읽기 로그인 비활성화 상태

- **Given**: `requireReadLogin = false`
- **When**: 인증 없이 `GET /api/tree`, `GET /api/raw`, `/doc/*` 접속
- **Then**: 정상 응답 (200)

### AC-17-004: 읽기 로그인 활성화 상태

- **Given**: `requireReadLogin = true`
- **When**: 인증 없이 `GET /api/tree` 접속
- **Then**: 401 응답 또는 로그인 페이지 리다이렉트

### AC-17-005: MCP user-key 인증

- **Given**: user-key가 있는 활성 사용자
- **When**: `X-API-Key: <user-key>` 또는 `Authorization: Bearer <user-key>` 헤더로 MCP 요청
- **Then**: 사용자 권한에 따라 요청 처리

### AC-17-006: 그룹 권한 검증

- **Given**: `read` 권한만 가진 사용자
- **When**: MCP `create_document` 호출
- **Then**: 403 `INSUFFICIENT_PERMISSION`

### AC-17-007: 가입 요청 워크플로우

- **Given**: 이메일 서버 설정 완료, `allowSignup = true`
- **When**: 가입 요청 → 이메일 인증 → 슈퍼유저 승인
- **Then**: 사용자 계정 생성, user-key 발급, 승인 메일 발송

### AC-17-008: 가입 도메인 제한

- **Given**: `allowedEmailDomains = ["company.com"]`
- **When**: `user@other.com`으로 가입 요청
- **Then**: 400 `EMAIL_DOMAIN_NOT_ALLOWED`

### AC-17-009: user-key 재발급

- **Given**: 로그인한 사용자가 내 정보 페이지에서 "재발급" 클릭
- **When**: 확인 후 재발급 실행
- **Then**: 새 user-key 생성, 기존 키 무효화, 화면에 새 키 표시

### AC-17-010: 브루트포스 방어

- **Given**: 잘못된 패스워드로 5회 연속 로그인 시도
- **When**: 6번째 로그인 시도
- **Then**: 429 `TOO_MANY_ATTEMPTS`, 15분 잠금

### AC-17-011: 마지막 슈퍼유저 보호

- **Given**: 슈퍼유저가 1명만 존재
- **When**: 해당 슈퍼유저 삭제 시도
- **Then**: 403 `LAST_SUPERUSER_PROTECTED`

### AC-17-012: 이메일 서버 미설정 시 가입 요청

- **Given**: config.json5에 `email` 설정 없음
- **When**: 로그인 페이지 접근
- **Then**: "가입 요청" 버튼 숨김. 슈퍼유저 직접 추가만 가능

### AC-17-013: 세션 만료

- **Given**: 로그인 상태, `sessionTimeout = 3600000` (1시간)
- **When**: 1시간 동안 활동 없이 API 요청
- **Then**: 401 `SESSION_EXPIRED`, 로그인 페이지로 리다이렉트

### AC-17-014: 본인 패스워드 변경

- **Given**: 로그인한 사용자가 내 정보 페이지에서 패스워드 변경
- **When**: 현재 패스워드 + 새 패스워드 입력 후 변경 실행
- **Then**: 패스워드 변경 완료, 기존 세션 유지

### AC-17-015: Rate Limiting

- **Given**: 동일 IP에서 1분 내 10회 로그인 시도
- **When**: 11번째 로그인 시도
- **Then**: 429 응답, 요청 거부

### AC-17-016: 인증 설정 즉시 반영

- **Given**: 슈퍼유저가 `requireReadLogin`을 `false`에서 `true`로 변경
- **When**: 변경 직후 미인증 사용자가 `GET /api/tree` 접근
- **Then**: 401 응답 (즉시 적용)

### AC-17-017: 마지막 슈퍼유저 강등 방지

- **Given**: 슈퍼유저가 1명만 존재
- **When**: 해당 슈퍼유저의 그룹을 Editor로 변경 시도
- **Then**: 403 `LAST_SUPERUSER_PROTECTED`

### AC-17-018: 가입 거절 후 재가입

- **Given**: 가입이 거절된 사용자
- **When**: 동일 이메일로 다시 가입 요청
- **Then**: 새 가입 요청 생성 성공, 기존 거절 기록 보존

### AC-17-019: 에디터의 /admin 접근

- **Given**: `write` 권한만 가진 에디터 사용자가 로그인
- **When**: `/admin` 접근
- **Then**: 문서 작업 탭(편집/업로드/삭제) + 내 정보 탭만 표시. 사용자/그룹 관리 탭 숨김

### AC-17-020: CLI 패스워드 리셋

- **Given**: 유일한 슈퍼유저가 패스워드 분실
- **When**: 서버에서 `node scripts/reset-admin.js --email admin@example.com --password newPass!` 실행
- **Then**: 패스워드 변경 완료, 로그인 가능

---

## 부록 A: 구현 순서 제안

| Phase | 범위 | 우선순위 | 예상 복잡도 |
|-------|------|---------|-----------|
| Phase 1 | 데이터 모델 + 파일 저장소 서비스 | P0 | 중 |
| Phase 2 | 최초 설정 마법사 + 로그인/로그아웃 | P0 | 중 |
| Phase 3 | 인증 미들웨어 전환 (기존 apiKey → user-key) | P0 | 높음 |
| Phase 4 | 그룹 CRUD + 사용자 CRUD (Admin UI) | P0 | 높음 |
| Phase 5 | 인증 설정 관리 (Admin UI) | P0 | 중 |
| Phase 6 | 내 정보 페이지 + user-key 관리 | P1 | 낮음 |
| Phase 7 | 이메일 서비스 + 가입 요청 워크플로우 | P1 | 높음 |
| Phase 8 | Rate Limiting + 보안 강화 | P1 | 중 |
| Phase 9 | 하위 호환성 + 마이그레이션 | P2 | 낮음 |

## 부록 B: 보안 체크리스트

- [ ] 패스워드: bcrypt cost 12, 평문 미저장
- [ ] 세션 토큰: 256-bit 랜덤, httpOnly 쿠키
- [ ] user-key: 256-bit 랜덤, timing-safe 비교
- [ ] 이메일 인증 토큰: 256-bit 랜덤, 24시간 만료, 1회용
- [ ] 브루트포스: 5회 실패 시 15분 잠금
- [ ] Rate Limiting: 로그인, 가입, 인증 요청
- [ ] CSRF: SameSite 쿠키 + 헤더 기반 API 인증
- [ ] XSS: 기존 DOMPurify 유지
- [ ] 경로 검증: 기존 path-validator 유지
- [ ] 에러 메시지: 이메일/패스워드 오류 구분 안 함 (정보 누출 방지)
- [ ] 데이터 파일: 원자적 쓰기 (temp → rename)
- [ ] 로그: 패스워드, user-key 등 민감 정보 마스킹

## 부록 C: 영향받는 기존 파일

| 파일 | 변경 유형 | 설명 |
|------|-----------|------|
| `src/middleware/auth.js` | **대폭 수정** | apiKey → user-key 인증으로 전환 |
| `src/middleware/admin-auth.js` | **수정** | API Key 세션 → email/password 세션 |
| `src/services/session-service.js` | **확장** | 세션 데이터 모델 확장 (userId, email, groupId) |
| `src/routes/admin-api.js` | **수정** | 인증 엔드포인트 폐기, 새 엔드포인트 추가 |
| `src/routes/mcp.js` | **수정** | validateApiKey 함수 → user-key 검증으로 변경 |
| `src/routes/api.js` | **수정** | 조건부 인증 미들웨어 적용 (requireReadLogin) |
| `src/utils/config-loader.js` | **수정** | dataDir, email 설정 추가, apiKey 폐기 경고 |
| `config.example.json5` | **수정** | 새 설정 항목 추가, apiKey 주석 처리 |
| `public/js/admin.js` | **대폭 수정** | 사용자/그룹 관리 UI 추가 |
| `public/css/admin.css` | **확장** | 사용자 관리 UI 스타일 추가 |
| `src/views/index.ejs` | **수정** | 로그인/Setup Wizard 페이지 포함 |
| `src/controllers/admin/admin-auth-controller.js` | **대폭 수정** | API Key → email/password 인증 |
| `src/routes/context-mcp.js` | **수정** | 인증 로직이 있는 경우 user-key 전환 |
| `package.json` | **수정** | bcrypt, nodemailer, uuid 의존성 추가 |
